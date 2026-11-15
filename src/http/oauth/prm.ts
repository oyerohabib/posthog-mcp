/**
 * OAuth 2.0 Protected Resource Metadata (RFC 9728) for MCP.
 */

export function publicBaseUrl(): string {
  return (process.env.PUBLIC_BASE_URL ?? "http://127.0.0.1:8787").replace(
    /\/$/,
    "",
  );
}

export function mcpResourceUrl(): string {
  return (
    process.env.MCP_RESOURCE_URL?.replace(/\/$/, "") ??
    `${publicBaseUrl()}/mcp`
  );
}

export function authkitDomain(): string {
  return (process.env.WORKOS_AUTHKIT_DOMAIN ?? "").replace(/\/$/, "");
}

export function protectedResourceMetadata(): Record<string, unknown> {
  const resource = mcpResourceUrl();
  const as = authkitDomain();
  return {
    resource,
    authorization_servers: as ? [as] : [],
    bearer_methods_supported: ["header"],
    scopes_supported: ["openid", "profile", "email"],
  };
}

export function resourceMetadataPath(): string {
  // Path-scoped well-known for /mcp
  return "/.well-known/oauth-protected-resource/mcp";
}

export function resourceMetadataUrl(): string {
  return `${publicBaseUrl()}${resourceMetadataPath()}`;
}
