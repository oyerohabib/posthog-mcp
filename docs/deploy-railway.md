# Deploy posthog-mcp on Railway (Streamable HTTP)

This runs the **remote HTTP** entrypoint (`src/http.ts`), not STDIO.

**Preferred auth:** MCP OAuth (WorkOS AuthKit) + PostHog OAuth onboarding. See [oauth-onboarding.md](./oauth-onboarding.md).

## What Railway stores

```env
NODE_ENV=production
PUBLIC_BASE_URL=https://YOUR-DOMAIN
MCP_RESOURCE_URL=https://YOUR-DOMAIN/mcp
WORKOS_AUTHKIT_DOMAIN=https://YOUR.authkit.app
WORKOS_CLIENT_ID=
WORKOS_API_KEY=
TOKEN_ENCRYPTION_KEY=<64-char hex>
DATABASE_URL=<Railway Postgres>
```

Optional ops escape hatch:

```env
MCP_API_KEY=<long random secret>
ALLOW_POSTHOG_HEADER_CREDENTIALS=1
```

**Do not** put user PostHog `phx_` / `phc_` keys or LLM keys in Railway for the normal OAuth path.

## Build & start

Railway uses [`railway.toml`](../railway.toml). Nixpacks runs `npm ci` in the install phase; the build command is only:

```bash
npm run build
```

Start command:

```bash
npm run start:http
```

The process binds `0.0.0.0` and listens on `PORT`. Health check: `GET /health` → `{ "ok": true }`.

## Deploy steps

1. Push this repo to GitHub (or connect the Railway project to your git remote).
2. Create a new Railway project → **Deploy from GitHub** → select this repository.
3. In **Variables**, add `NODE_ENV=production` and `MCP_API_KEY` (generate a long random string).
4. Confirm start command is `npm run start:http` (from `railway.toml`).
5. Under **Networking**, generate a **public domain** (Railway does not always attach one automatically).
6. Open `https://YOUR-RAILWAY-DOMAIN/health` and confirm `{ "ok": true }`.
7. Point Cursor at `https://YOUR-RAILWAY-DOMAIN/mcp` (see README remote config).

Public MCP URL format:

```text
https://<railway-public-domain>/mcp
```

## Cursor (OAuth)

```json
{
  "mcpServers": {
    "posthog": {
      "url": "https://YOUR-RAILWAY-DOMAIN/mcp"
    }
  }
}
```

Then complete PostHog connect + project selection via `/onboarding?user=…`.

## Security notes

- Production requires WorkOS OAuth config and/or `MCP_API_KEY`.
- PostHog tokens encrypted at rest (`TOKEN_ENCRYPTION_KEY`).
- Browser `Origin` is rejected unless listed in `MCP_ALLOWED_ORIGINS`.
- Body size capped (~1MB); basic per-IP rate limiting applies.

## Troubleshooting

| Symptom | Likely cause |
|---------|----------------|
| `503` / won't start | Missing WorkOS + `MCP_RESOURCE_URL` and no `MCP_API_KEY` |
| `401` on `/mcp` | Complete Cursor MCP OAuth (check PRM / AuthKit) |
| `403` + onboarding URL | Connect PostHog + select project |
| `403` Origin | Browser Origin not in `MCP_ALLOWED_ORIGINS` |
| Cursor can't connect | Domain / wrong `/mcp` path / AuthKit misconfigured |

## Local smoke test

```bash
export MCP_API_KEY=dev-secret
npm run dev:http
curl -s http://127.0.0.1:8787/health
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://127.0.0.1:8787/mcp
# expect 401 without Authorization
```
