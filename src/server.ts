import { McpServer } from "@modelcontextprotocol/server";
import { createPostHogClient, type PostHogClient } from "./posthog/client.js";
import { registerAllTools } from "./tools/register.js";

/**
 * Build the PostHog MCP server with ~25 tools agents can call.
 * Pass a client for tests; otherwise resolve from env (mock by default).
 */
export function createPostHogMcpServer(client?: PostHogClient): McpServer {
  const ph = client ?? createPostHogClient();
  const server = new McpServer({
    name: "posthog-mcp",
    version: "1.0.0",
  });
  registerAllTools(server, ph);
  return server;
}
