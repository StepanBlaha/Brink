# brink-auth: Brink's token-exchange broker

A tiny Cloudflare Worker that lets Brink use Notion's OAuth ("Connect to Notion") without
shipping the client secret inside the app. It holds `NOTION_CLIENT_SECRET` and only relays:

| Route | What it does |
|---|---|
| `GET /callback` | Notion redirects here after consent. 302 to `brink://oauth/callback?code=…&state=…` (only `code`, `state`, `error` pass through). |
| `POST /token` `{code, redirect_uri}` | Exchanges the code at `https://api.notion.com/v1/oauth/token` using HTTP Basic auth. `redirect_uri` must equal `<worker origin>/callback`. |
| `POST /refresh` `{refresh_token}` | Same endpoint, `grant_type=refresh_token`. |

It stores nothing (no KV, no D1), logs nothing (no `console.*`, observability off) and returns
only the token and workspace fields (the user `owner` object is dropped). There's a best-effort
per-IP limit of 20 requests a minute per isolate. There's no CORS because only the native app calls it.

## Deploy

```sh
cd broker
npm i -g wrangler          # or use npx wrangler …
wrangler login
wrangler secret put NOTION_CLIENT_ID       # from the Notion developer portal
wrangler secret put NOTION_CLIENT_SECRET
wrangler deploy                            # prints https://brink-auth.<you>.workers.dev
```

Then:

1. In the Notion developer portal, set the integration's redirect URI to
   `https://brink-auth.<you>.workers.dev/callback`.
2. In `Sources/NotionDock/App/OAuthConfig.swift`, set `clientID` and `brokerURLString`.

If you serve the Worker on a custom domain, the redirect URI follows that origin. To pin it
explicitly, add `ALLOWED_REDIRECT_URI` under `[vars]`.

## Test

```sh
npm install
npm test          # vitest; fetch is stubbed, no network
npm run typecheck
```
