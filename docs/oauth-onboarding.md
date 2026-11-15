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
