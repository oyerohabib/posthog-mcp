# Deploy posthog-mcp on Railway (Streamable HTTP)

This runs the **remote HTTP** entrypoint (`src/http.ts`), not STDIO. Clients authenticate with a bearer API key and send **their own** PostHog credentials on every request.

Bearer auth is a pragmatic first step — **not** a complete OAuth 2.1 implementation. The `Authenticator` interface in `src/http/auth.ts` is the extension point for OAuth later.

## What Railway stores

Set only service config:

```env
NODE_ENV=production
MCP_API_KEY=<long random secret>
```

Optional:

```env
MCP_ALLOWED_ORIGINS=https://app.example.com
POSTHOG_ALLOWED_HOSTS=
PORT=<Railway provides this>
```

**Do not** set on Railway:

- `POSTHOG_API_KEY` / `POSTHOG_PERSONAL_API_KEY` / `POSTHOG_PROJECT_ID`
- `GROQ_API_KEY` / `GEMINI_API_KEY`

PostHog keys arrive as request headers. LLM keys are only for local evals.

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

## Per-request PostHog headers

| Header | Example |
|--------|---------|
| `Authorization` | `Bearer <same as MCP_API_KEY>` |
| `X-PostHog-API-Key` | `phc_…` |
| `X-PostHog-Personal-API-Key` | `phx_…` |
| `X-PostHog-Project-ID` | `12345` |
| `X-PostHog-Host` | `https://us.i.posthog.com` or `https://eu.i.posthog.com` |

Hosts outside the allowlist are rejected (SSRF protection). Extra hosts: `POSTHOG_ALLOWED_HOSTS`.

Missing PostHog headers on `/mcp` return **400** (no silent mock fallback in production HTTP).

## Cursor

```json
{
  "mcpServers": {
    "posthog": {
      "url": "https://YOUR-RAILWAY-DOMAIN/mcp",
      "headers": {
        "Authorization": "Bearer ${env:POSTHOG_MCP_API_KEY}",
        "X-PostHog-API-Key": "${env:POSTHOG_PROJECT_API_KEY}",
        "X-PostHog-Personal-API-Key": "${env:POSTHOG_PERSONAL_API_KEY}",
        "X-PostHog-Project-ID": "${env:POSTHOG_PROJECT_ID}",
        "X-PostHog-Host": "https://us.i.posthog.com"
      }
    }
  }
}
```

Set `POSTHOG_MCP_API_KEY` to the same value as Railway `MCP_API_KEY`.

## Security notes

- Production refuses to start without `MCP_API_KEY`.
- Secrets are compared with `timingSafeEqual` and never logged (headers redacted).
- Browser `Origin` is rejected unless listed in `MCP_ALLOWED_ORIGINS`.
- Body size capped (~1MB); basic per-IP rate limiting applies.
- This is **not** multi-tenant OAuth; anyone with the bearer key can call the service (with their own PostHog headers).

## Troubleshooting

| Symptom | Likely cause |
|---------|----------------|
| `503` / won't start | Missing `MCP_API_KEY` in production |
| `401` on `/mcp` | Wrong/missing `Authorization: Bearer …` |
| `400` Missing X-PostHog-… | Client omitted PostHog headers |
| `400` host not allowed | Host not in allowlist / not https |
| `403` Origin | Browser Origin not in `MCP_ALLOWED_ORIGINS` |
| Cursor can't connect | Domain not generated under Railway Networking; wrong `/mcp` path |
| Tools fail upstream | Invalid PostHog personal key / project id for that region |

## Local smoke test

```bash
export MCP_API_KEY=dev-secret
npm run dev:http
curl -s http://127.0.0.1:8787/health
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://127.0.0.1:8787/mcp
# expect 401 without Authorization
```
