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
