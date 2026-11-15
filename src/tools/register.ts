import type { McpServer } from "@modelcontextprotocol/server";
import type { PostHogClient } from "../posthog/types.js";
import { registerCohortTools } from "./cohorts.js";
import { registerEventTools } from "./events.js";
import { registerExperimentTools } from "./experiments.js";
import { registerFlagTools } from "./flags.js";
import { registerGroupTools } from "./groups.js";
import { registerInsightTools } from "./insights.js";
import { registerPersonTools } from "./persons.js";
import { registerProjectTools } from "./project.js";
import { registerSetupTools } from "./setup.js";
import {
  localSetupStatus,
  type SetupStatus,
} from "./setup-status.js";

/** Expected tool names for contract tests (sorted). */
export const EXPECTED_TOOL_NAMES = [
  "capture_event",
  "create_feature_flag",
  "find_group",
  "get_cohort",
  "get_cohort_persons",
  "get_experiment",
  "get_feature_flag",
  "get_feature_flag_definition",
  "get_insight",
  "get_person",
  "get_person_events",
  "get_project",
  "get_setup_status",
  "identify_user",
  "list_cohorts",
  "list_dashboards",
  "list_experiments",
  "list_feature_flags",
  "list_group_types",
  "list_groups",
  "list_insights",
  "list_persons",
  "query_funnel",
  "query_retention",
  "query_trends",
  "update_feature_flag",
] as const;

export function registerAllTools(
  server: McpServer,
  ph: PostHogClient,
  setup: SetupStatus = localSetupStatus(),
): void {
  registerSetupTools(server, setup);
  registerEventTools(server, ph);
  registerPersonTools(server, ph);
  registerFlagTools(server, ph);
  registerExperimentTools(server, ph);
  registerInsightTools(server, ph);
  registerCohortTools(server, ph);
  registerGroupTools(server, ph);
  registerProjectTools(server, ph);
}
