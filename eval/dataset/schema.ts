export type TaskCategory =
  | "events_users"
  | "flags_experiments"
  | "insights_analytics"
  | "cohorts_groups"
  | "project_config"
  | "multi_step";

export type TaskDifficulty = "easy" | "medium" | "hard";

export type ArgumentConstraint = {
  tool: string;
  /** Required argument equality checks (subset). */
  equals?: Record<string, unknown>;
  /** Arguments that must be present. */
  requiredKeys?: string[];
};

export type TaskValidation = {
  /** Final response must include these substrings (case-insensitive). */
  responseMustInclude?: string[];
  /** Agent should ask for clarification rather than call tools. */
  mustClarify?: boolean;
  /** Agent should refuse / explain limitation. */
  mustRefuse?: boolean;
  /** Mock state checks after tool mode. */
  mockState?: {
    eventsContains?: { distinctId: string; event: string };
    personHasProperties?: {
      distinctId: string;
      properties: Record<string, unknown>;
    };
    flagExists?: { key: string; active?: boolean };
  };
  /** Whether expected tool order must be sequential prefix. */
  orderedTools?: boolean;
};

export type EvalTask = {
  id: string;
  category: TaskCategory;
  difficulty: TaskDifficulty;
  prompt: string;
  expectedBehavior: string;
  /** Acceptable tool names (unordered unless validation.orderedTools). Empty = no tools expected. */
  expectedTools: string[];
  argumentConstraints?: ArgumentConstraint[];
  expectedOutcome: string;
  validation: TaskValidation;
  scoringNotes?: string;
};
