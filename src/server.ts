import { McpServer } from "@modelcontextprotocol/server";
import { createPostHogClient, type PostHogClient } from "./posthog/client.js";
import { registerAllTools } from "./tools/register.js";
import {
  localSetupStatus,
  type SetupStatus,
} from "./tools/setup-status.js";

/**
 * Build the PostHog MCP server with tools agents can call.
 * Pass a client for tests/HTTP; otherwise resolve from env (mock by default).
 * Remote HTTP should pass SetupStatus; STDIO defaults to `local`.
 */
export function createPostHogMcpServer(
  client?: PostHogClient,
  setup: SetupStatus = localSetupStatus(),
): McpServer {
  const ph = client ?? createPostHogClient();
  const server = new McpServer({
    name: "posthog-mcp",
    version: "1.0.0",
  });
  registerAllTools(server, ph, setup);
  return server;
}
