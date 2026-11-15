/**
 * Remote vs local MCP setup status for get_setup_status.
 */

export type SetupStatusKind =
  | "ready"
  | "needs_posthog"
  | "needs_project"
  | "local";

export type SetupStatus = {
  status: SetupStatusKind;
  message: string;
  connectUrl?: string;
  projectName?: string;
};

export function localSetupStatus(): SetupStatus {
  return {
    status: "local",
    message:
      "STDIO/local mode — PostHog credentials come from environment variables (or mock). No browser onboarding URL.",
  };
}

export function readySetupStatus(projectName?: string | null): SetupStatus {
  return {
    status: "ready",
    message: projectName
      ? `PostHog project "${projectName}" is linked. Tools are ready.`
      : "PostHog is linked. Tools are ready.",
    projectName: projectName ?? undefined,
  };
}

export function needsPostHogSetupStatus(connectUrl: string): SetupStatus {
  return {
    status: "needs_posthog",
    message:
      "Authorize PostHog in the browser, then select a project. Open connectUrl, then return to Cursor.",
    connectUrl,
  };
}

export function needsProjectSetupStatus(connectUrl: string): SetupStatus {
  return {
    status: "needs_project",
    message:
      "PostHog is authorized but no project is selected. Open connectUrl to choose a project, then return to Cursor.",
    connectUrl,
  };
}

/**
 * MCP initialize `instructions` so agents steer users to PostHog connect
 * without requiring them to discover get_setup_status manually.
 */
export function setupInstructions(setup: SetupStatus): string {
  if (setup.status === "needs_posthog" || setup.status === "needs_project") {
    const url = setup.connectUrl ?? "";
    return [
      "PostHog is not fully linked for this MCP session.",
      "Before other PostHog tools, call get_setup_status.",
      "Show the user the connectUrl and ask them to open it in a browser to authorize PostHog and/or select a project.",
      url ? `connectUrl: ${url}` : "connectUrl is returned by get_setup_status.",
      "After they finish and return to Cursor, call get_setup_status again until status is ready, then continue.",
    ].join(" ");
  }
  if (setup.status === "ready") {
    return setup.projectName
      ? `PostHog is linked (project "${setup.projectName}"). Use the analytics tools as needed.`
      : "PostHog is linked. Use the analytics tools as needed.";
  }
  return "STDIO/local mode: PostHog credentials come from environment variables or the mock client. There is no browser connectUrl.";
}
