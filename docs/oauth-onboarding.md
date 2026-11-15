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
2. When PostHog is not linked, the MCP server’s **instructions** (and optional `connect_posthog` prompt) tell the agent to call **`get_setup_status`** and ask you to open **`connectUrl`**. You can also call that tool yourself.
3. The onboarding page starts **PostHog OAuth** (CIMD) automatically, then shows a **project picker**.
4. When the page says **Connected / Return to Cursor**, go back to Cursor and use PostHog tools (or call `get_setup_status` again — it should be `ready`).
5. Tokens stay on the server (encrypted). Cursor never sees PostHog secrets.

Cursor cannot open the PostHog browser automatically after WorkOS; you still open `connectUrl` once.

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
| `GET /onboarding` | Connect / status UI (auto-starts PostHog OAuth when needed) |
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
