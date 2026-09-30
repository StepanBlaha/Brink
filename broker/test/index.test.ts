import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import worker, { NOTION_TOKEN_URL, resetRateLimits, type Env } from "../src/index";

const ORIGIN = "https://brink-auth.test.workers.dev";
const env: Env = {
  NOTION_CLIENT_ID: "cid",
  NOTION_CLIENT_SECRET: "csecret",
  APP_CALLBACK_URL: "brink://oauth/callback",
  RATE_LIMIT_PER_MINUTE: "3",
};

const post = (path: string, body: unknown, ip = "1.2.3.4") =>
  worker.fetch(new Request(`${ORIGIN}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "CF-Connecting-IP": ip },
    body: JSON.stringify(body),
  }), env);

const notionOK = {
  access_token: "ntn_access", token_type: "bearer", refresh_token: "ntn_refresh", bot_id: "b",
  workspace_id: "w", workspace_name: "Acme", workspace_icon: "🚀", owner: { type: "user", user: { id: "u" } },
};

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  resetRateLimits();
  fetchMock = vi.fn(async () => new Response(JSON.stringify(notionOK), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("GET /callback", () => {
  it("302s to the app scheme with only code and state", async () => {
    const res = await worker.fetch(new Request(`${ORIGIN}/callback?code=abc&state=xyz&evil=1`), env);
    expect(res.status).toBe(302);
    const location = new URL(res.headers.get("Location")!);
    expect(location.protocol).toBe("brink:");
    expect(location.searchParams.get("code")).toBe("abc");
    expect(location.searchParams.get("state")).toBe("xyz");
    expect(location.searchParams.has("evil")).toBe(false);
  });

  it("passes a denial through as error", async () => {
    const res = await worker.fetch(new Request(`${ORIGIN}/callback?error=access_denied&state=s`), env);
    expect(new URL(res.headers.get("Location")!).searchParams.get("error")).toBe("access_denied");
  });
});

describe("POST /token", () => {
  it("exchanges the code with Basic auth and strips the owner object", async () => {
    const res = await post("/token", { code: "c1", redirect_uri: `${ORIGIN}/callback` });
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.access_token).toBe("ntn_access");
    expect(body.refresh_token).toBe("ntn_refresh");
    expect(body.workspace_name).toBe("Acme");
    expect(body.owner).toBeUndefined();

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(NOTION_TOKEN_URL);
    expect((init.headers as Record<string, string>).Authorization).toBe(`Basic ${btoa("cid:csecret")}`);
    expect(JSON.parse(init.body as string)).toEqual({
      grant_type: "authorization_code", code: "c1", redirect_uri: `${ORIGIN}/callback`,
    });
  });

  it("rejects any other redirect URI without calling Notion", async () => {
    const res = await post("/token", { code: "c1", redirect_uri: "https://evil.example/callback" });
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects malformed bodies", async () => {
    expect((await post("/token", { redirect_uri: `${ORIGIN}/callback` })).status).toBe(400);
    expect((await post("/token", ["nope"])).status).toBe(400);
  });

  it("maps a Notion error to 400 without echoing tokens", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 }));
    const res = await post("/token", { code: "c1", redirect_uri: `${ORIGIN}/callback` });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_grant", message: "Notion rejected the request." });
  });
});

describe("POST /refresh", () => {
  it("uses the refresh_token grant", async () => {
    const res = await post("/refresh", { refresh_token: "r1" });
    expect(res.status).toBe(200);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({ grant_type: "refresh_token", refresh_token: "r1" });
  });
});

describe("routing and limits", () => {
  it("404s unknown routes", async () => {
    const res = await worker.fetch(new Request(`${ORIGIN}/token`), env);
    expect(res.status).toBe(404);
  });

  it("rate-limits per IP", async () => {
    for (let i = 0; i < 3; i++) expect((await post("/refresh", { refresh_token: "r" }, "9.9.9.9")).status).toBe(200);
    expect((await post("/refresh", { refresh_token: "r" }, "9.9.9.9")).status).toBe(429);
    expect((await post("/refresh", { refresh_token: "r" }, "8.8.8.8")).status).toBe(200);
  });
});
