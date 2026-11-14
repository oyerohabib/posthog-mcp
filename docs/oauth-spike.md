# Phase 0 OAuth spike findings

Branch: `feat/oauth-posthog-onboarding`

## MCP Authorization Server (WorkOS AuthKit)

- Spec: [MCP Authorization 2026-07-28](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization)
- Decision: WorkOS AuthKit as managed AS; this service is the resource server only
- Required from us: RFC 9728 PRM, `401` + `WWW-Authenticate` with `resource_metadata`, JWT audience = `MCP_RESOURCE_URL`

## PostHog OAuth (CIMD)

- Docs: https://posthog.com/docs/api/oauth
- Region-agnostic AS: `https://oauth.posthog.com`
- CIMD hosted at `{PUBLIC_BASE_URL}/oauth/posthog-client`
