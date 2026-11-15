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

  if (setup.status === "needs_posthog" || setup.status === "needs_project") {
    const connectUrl = setup.connectUrl ?? "";
    server.registerPrompt(
      "connect_posthog",
      {
        title: "Connect PostHog",
        description:
          "Guide the user to authorize PostHog and select a project for this MCP server.",
        argsSchema: z.object({}),
      },
      () => ({
        messages: [
          {
            role: "user" as const,
            content: {
              type: "text" as const,
              text: [
                "PostHog is not fully linked for this MCP session.",
                "Call get_setup_status, then ask me to open the connectUrl in a browser.",
                connectUrl ? `connectUrl: ${connectUrl}` : "",
                "I will authorize PostHog and pick a project, then return here.",
                "After that, call get_setup_status again until status is ready.",
              ]
                .filter(Boolean)
                .join("\n"),
            },
          },
        ],
      }),
    );
  }
}
