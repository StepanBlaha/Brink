/**
 * Brink token-exchange broker.
 *
 * Notion's OAuth token endpoint needs the integration's client secret, which can't ship inside a
 * desktop app. This Worker holds the secret and does only three things:
 *   GET  /callback  Notion redirects here; we 302 the browser to brink://oauth/callback?code&state.
 *   POST /token     {code, redirect_uri} → Notion /v1/oauth/token (authorization_code).
 *   POST /refresh   {refresh_token}      → Notion /v1/oauth/token (refresh_token).
 * It stores nothing and logs nothing (no console.* anywhere, observability off in wrangler.toml).
 */

export interface Env {
  NOTION_CLIENT_ID: string;
  NOTION_CLIENT_SECRET: string;
  APP_CALLBACK_URL?: string;
  /** Optional override; defaults to `<this worker's origin>/callback`. */
  ALLOWED_REDIRECT_URI?: string;
  RATE_LIMIT_PER_MINUTE?: string;
}

export const NOTION_TOKEN_URL = "https://api.notion.com/v1/oauth/token";
const MAX_BODY_BYTES = 4096;
const PARAM_PATTERN = /^[\x21-\x7E]{1,2048}$/; // printable ASCII, no spaces

// ---- Rate limiting: fixed one-minute window per IP, per isolate (best effort, no storage). ----
const windows = new Map<string, { start: number; count: number }>();

export function rateLimited(ip: string, limit: number, now = Date.now()): boolean {
  const entry = windows.get(ip);
  if (!entry || now - entry.start >= 60_000) {
    windows.set(ip, { start: now, count: 1 });
    if (windows.size > 10_000) {
      for (const [key, value] of windows) if (now - value.start >= 60_000) windows.delete(key);
    }
    return false;
  }
  entry.count += 1;
  return entry.count > limit;
}

export function resetRateLimits(): void {
  windows.clear();
}

// ---- Helpers ----
const baseHeaders = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};

function json(body: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...baseHeaders, "Content-Type": "application/json", ...extra },
  });
}

const fail = (status: number, error: string, message: string) => json({ error, message }, status);

export function allowedRedirectURI(request: Request, env: Env): string {
  return env.ALLOWED_REDIRECT_URI ?? `${new URL(request.url).origin}/callback`;
}

async function readJSON(request: Request): Promise<Record<string, unknown> | null> {
  if (!(request.headers.get("Content-Type") ?? "").includes("application/json")) return null;
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) return null;
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Calls Notion and returns only the fields the app needs (no owner/user object). */
async function exchange(env: Env, body: Record<string, string>): Promise<Response> {
  if (!env.NOTION_CLIENT_ID || !env.NOTION_CLIENT_SECRET) {
    return fail(500, "not_configured", "Broker secrets are not set.");
  }
  const basic = btoa(`${env.NOTION_CLIENT_ID}:${env.NOTION_CLIENT_SECRET}`);
  let upstream: Response;
  try {
    upstream = await fetch(NOTION_TOKEN_URL, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch {
    return fail(502, "upstream_unreachable", "Could not reach Notion.");
  }
  const data = (await upstream.json().catch(() => null)) as Record<string, unknown> | null;
  if (!upstream.ok || !data || typeof data.access_token !== "string") {
    const code = typeof data?.error === "string" ? data.error : "upstream_error";
    const status = upstream.status >= 400 && upstream.status < 500 ? 400 : 502;
    return fail(status, code, "Notion rejected the request.");
  }
  const pick = (k: string) => (typeof data[k] === "string" ? data[k] : null);
  return json({
    access_token: data.access_token,
    token_type: pick("token_type") ?? "bearer",
    refresh_token: pick("refresh_token"),
    bot_id: pick("bot_id"),
    workspace_id: pick("workspace_id"),
    workspace_name: pick("workspace_name"),
    workspace_icon: pick("workspace_icon"),
  });
}

// ---- Routes ----
function handleCallback(request: Request, env: Env): Response {
  const params = new URL(request.url).searchParams;
  const target = new URL(env.APP_CALLBACK_URL ?? "brink://oauth/callback");
  for (const name of ["code", "state", "error"]) {
    const value = params.get(name);
    if (value !== null && PARAM_PATTERN.test(value)) target.searchParams.set(name, value);
  }
  if (!target.searchParams.has("code") && !target.searchParams.has("error")) {
    target.searchParams.set("error", "invalid_request");
  }
  const location = target.toString();
  const html = `<!doctype html><meta charset="utf-8"><title>Brink</title>` +
    `<p style="font:15px -apple-system,sans-serif;margin:3em;text-align:center">` +
    `Returning to Brink… <a href="${location.replace(/"/g, "&quot;")}">Open Brink</a></p>`;
  return new Response(html, {
    status: 302,
    headers: { ...baseHeaders, Location: location, "Content-Type": "text/html; charset=utf-8" },
  });
}

async function handleToken(request: Request, env: Env): Promise<Response> {
  const body = await readJSON(request);
  const code = body?.code, redirectURI = body?.redirect_uri;
  if (typeof code !== "string" || !PARAM_PATTERN.test(code) || typeof redirectURI !== "string") {
    return fail(400, "invalid_request", "Expected {code, redirect_uri}.");
  }
  if (redirectURI !== allowedRedirectURI(request, env)) {
    return fail(400, "invalid_redirect_uri", "That redirect URI is not allowed.");
  }
  return exchange(env, { grant_type: "authorization_code", code, redirect_uri: redirectURI });
}

async function handleRefresh(request: Request, env: Env): Promise<Response> {
  const body = await readJSON(request);
  const refreshToken = body?.refresh_token;
  if (typeof refreshToken !== "string" || !PARAM_PATTERN.test(refreshToken)) {
    return fail(400, "invalid_request", "Expected {refresh_token}.");
  }
  return exchange(env, { grant_type: "refresh_token", refresh_token: refreshToken });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);
    const route = `${request.method} ${pathname}`;
    if (route === "GET /callback") return handleCallback(request, env);
    if (route !== "POST /token" && route !== "POST /refresh") return fail(404, "not_found", "Not found.");

    const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
    const limit = Number(env.RATE_LIMIT_PER_MINUTE ?? "20") || 20;
    if (rateLimited(ip, limit)) return json({ error: "rate_limited", message: "Slow down." }, 429, { "Retry-After": "60" });

    return route === "POST /token" ? handleToken(request, env) : handleRefresh(request, env);
  },
} satisfies ExportedHandler<Env>;
