import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import { textResult } from "./schemas.js";
import {
  localSetupStatus,
  type SetupStatus,
} from "./setup-status.js";

export function registerSetupTools(
  server: McpServer,
  setup: SetupStatus = localSetupStatus(),
): void {
  server.registerTool(
    "get_setup_status",
    {
      title: "Get setup status",
      description:
        "Check whether PostHog is linked for this MCP session. Call this first on remote MCP before other tools, or when tools return auth/onboarding errors. Returns status (ready | needs_posthog | needs_project | local), a message, and connectUrl when the user must open a browser to authorize PostHog or pick a project.",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true, destructiveHint: false },
    },
    async () => textResult({ ok: true, ...setup }),
  );
}
