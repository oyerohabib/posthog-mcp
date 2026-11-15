# OAuth onboarding (MCP + PostHog)

Normal remote users should **not** paste `MCP_API_KEY` or PostHog `phx_` / `phc_` into Cursor.

## Cursor (URL only)

```json
{
  "mcpServers": {
    "posthog": {
      "url": "https://YOUR-DOMAIN/mcp"
    }
  }
}
```

1. Cursor discovers Protected Resource Metadata and starts **WorkOS AuthKit** OAuth (PKCE).
2. After sign-in, open the onboarding link returned by tools (or `/onboarding?user=…`) to **authorize PostHog** (CIMD) and **select a project**.
3. Tokens stay on the server (encrypted). Cursor never sees PostHog secrets.

## Railway variables

| Variable | Required |
|----------|----------|
| `PUBLIC_BASE_URL` | yes (e.g. `https://posthog-mcp.up.railway.app`) |
| `MCP_RESOURCE_URL` | yes (`https://…/mcp`) |
| `WORKOS_AUTHKIT_DOMAIN` | yes |
| `WORKOS_CLIENT_ID` / `WORKOS_API_KEY` | yes (AuthKit) |
| `TOKEN_ENCRYPTION_KEY` | yes (64-char hex) |
| `DATABASE_URL` | yes (Railway Postgres) |
| `MCP_API_KEY` | optional ops only |
| `NODE_ENV` | `production` |

## Endpoints

| Path | Purpose |
|------|---------|
| `GET /health` | Health |
| `GET /.well-known/oauth-protected-resource` | RFC 9728 PRM |
| `GET /.well-known/oauth-protected-resource/mcp` | Path-scoped PRM |
| `POST /mcp` | Streamable HTTP MCP |
| `GET /oauth/posthog-client` | PostHog CIMD |
| `GET /onboarding` | Connect / status UI |
| `GET /oauth/posthog/start` | Start PostHog OAuth |
| `GET /oauth/posthog/callback` | OAuth callback |
| `GET\|POST /onboarding/projects` | Project picker |
| `GET /oauth/posthog/disconnect` | Revoke + clear |

## Spec

- MCP Authorization: https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization
- PostHog OAuth: https://posthog.com/docs/api/oauth
- Spike notes: [oauth-spike.md](./oauth-spike.md)

## Legacy

`Authorization: Bearer <MCP_API_KEY>` plus `X-PostHog-*` headers remain available for ops when `ALLOW_POSTHOG_HEADER_CREDENTIALS=1` or outside production. Prefer OAuth for humans.
