# Phase 0 OAuth spike findings

Branch: `feat/oauth-posthog-onboarding`

## MCP Authorization Server (WorkOS AuthKit)

- Spec: [MCP Authorization 2026-07-28](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization)
- Decision: WorkOS AuthKit as managed AS; this service is the resource server only
- Required from us: RFC 9728 PRM, `401` + `WWW-Authenticate` with `resource_metadata`, JWT audience = `MCP_RESOURCE_URL`
- Live WorkOS dashboard credentials are configured via Railway env (not committed)

## PostHog OAuth (CIMD)

- Docs: https://posthog.com/docs/api/oauth
- Region-agnostic AS: `https://oauth.posthog.com`
- CIMD hosted at `{PUBLIC_BASE_URL}/oauth/posthog-client`
- Tokens: `pha_` access, `phr_` refresh (rotate on refresh)
- API hosts: `https://us.posthog.com` / `https://eu.posthog.com` (not oauth.posthog.com)
- Capture/decide still need project `api_token` (`phc_…`) in the request body

## Assumptions (verify with live credentials)

1. `GET /api/projects/:id` with `project:read` returns `api_token` for capture/decide
2. Private REST accepts `Authorization: Bearer pha_…` with declared scopes
3. Cursor completes AuthKit PKCE against our PRM
4. Refresh rotates `phr_`; always persist the new refresh token

## Spike status

Infrastructure for PRM, JWT auth (testable with a local verifier), CIMD, encrypted token store, and onboarding routes is implemented on this branch. End-to-end WorkOS + PostHog consent requires production secrets on Railway.
