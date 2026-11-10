import type { EvalTask, TaskCategory } from "../dataset/schema.js";
import type { ScoreBreakdown } from "./validators.js";

export type TrialMetrics = {
  taskId: string;
  category: TaskCategory;
  mode: "with_tools" | "no_tools";
  trial: number;
  success: boolean;
  latencyMs: number;
  retries: number;
  promptTokens: number;
  completionTokens: number;
  estimatedCostUsd: number;
  toolCalls: number;
  score: ScoreBreakdown;
  finalText: string;
  toolsUsed: string[];
};

export type AggregateReport = {
  mode: string;
  trials: number;
  taskCount: number;
  successRate: number;
  byCategory: Record<string, { successRate: number; n: number }>;
  avgLatencyMs: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  estimatedCostUsd: number;
  toolSelectionAccuracy: number;
  argumentAccuracy: number;
  avgUnnecessaryTools: number;
  avgInvalidTools: number;
  varianceByTask: Record<
    string,
    { successes: number; trials: number; successRate: number }
  >;
};

export function aggregateMetrics(
  rows: TrialMetrics[],
  mode: string,
): AggregateReport {
  const n = rows.length || 1;
  const successes = rows.filter((r) => r.success).length;
  const byCategory: AggregateReport["byCategory"] = {};
  for (const r of rows) {
    if (!byCategory[r.category]) byCategory[r.category] = { successRate: 0, n: 0 };
    byCategory[r.category]!.n += 1;
    if (r.success) byCategory[r.category]!.successRate += 1;
  }
  for (const c of Object.keys(byCategory)) {
    const bucket = byCategory[c]!;
    bucket.successRate = bucket.successRate / bucket.n;
  }

  const varianceByTask: AggregateReport["varianceByTask"] = {};
  for (const r of rows) {
    if (!varianceByTask[r.taskId]) {
      varianceByTask[r.taskId] = { successes: 0, trials: 0, successRate: 0 };
    }
    varianceByTask[r.taskId]!.trials += 1;
    if (r.success) varianceByTask[r.taskId]!.successes += 1;
  }
  for (const id of Object.keys(varianceByTask)) {
    const v = varianceByTask[id]!;
    v.successRate = v.successes / v.trials;
  }

  const toolRows = rows.filter((r) => r.mode === "with_tools");
  const toolN = toolRows.length || 1;

  return {
    mode,
    trials: rows[0] ? Math.max(...rows.map((r) => r.trial)) : 0,
    taskCount: new Set(rows.map((r) => r.taskId)).size,
    successRate: successes / n,
    byCategory,
    avgLatencyMs: rows.reduce((a, r) => a + r.latencyMs, 0) / n,
    totalPromptTokens: rows.reduce((a, r) => a + r.promptTokens, 0),
    totalCompletionTokens: rows.reduce((a, r) => a + r.completionTokens, 0),
    estimatedCostUsd: rows.reduce((a, r) => a + r.estimatedCostUsd, 0),
    toolSelectionAccuracy:
      toolRows.filter((r) => r.score.toolSelectionCorrect).length / toolN,
    argumentAccuracy:
      toolRows.filter((r) => r.score.argumentCorrect).length / toolN,
    avgUnnecessaryTools:
      toolRows.reduce((a, r) => a + r.score.unnecessaryTools, 0) / toolN,
    avgInvalidTools:
      toolRows.reduce((a, r) => a + r.score.invalidTools, 0) / toolN,
    varianceByTask,
  };
}

export function filterTasks(
  tasks: EvalTask[],
  opts: { category?: string; limit?: number; ids?: string[] },
): EvalTask[] {
  let out = [...tasks];
  if (opts.ids?.length) out = out.filter((t) => opts.ids!.includes(t.id));
  if (opts.category) out = out.filter((t) => t.category === opts.category);
  if (opts.limit != null) out = out.slice(0, opts.limit);
  return out;
}
