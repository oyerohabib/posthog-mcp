import type { MockPostHogClient } from "../../src/posthog/mock.js";
import type { EvalTask } from "../dataset/schema.js";

export type RecordedToolCall = {
  name: string;
  arguments: Record<string, unknown>;
  isError: boolean;
};

export type ScoreBreakdown = {
  success: boolean;
  toolSelectionCorrect: boolean;
  argumentCorrect: boolean;
  mockStateCorrect: boolean;
  responseCorrect: boolean;
  clarifyOrRefuseCorrect: boolean;
  unnecessaryTools: number;
  invalidTools: number;
  reasons: string[];
};

const CLARIFY_RE =
  /\b(clarif|which user|which event|need more|could you (specify|provide)|missing|what (is|are) the)\b/i;
const REFUSE_RE =
  /\b(cannot|can't|unable|not supported|refuse|won't|will not|no tool|don't have (a )?tool|destructive|not allowed)\b/i;

export function scoreTask(opts: {
  task: EvalTask;
  finalText: string;
  toolCalls: RecordedToolCall[];
  mock: MockPostHogClient;
  toolsEnabled: boolean;
}): ScoreBreakdown {
  const { task, finalText, toolCalls, mock, toolsEnabled } = opts;
  const reasons: string[] = [];
  const calledNames = toolCalls.map((c) => c.name);

  let clarifyOrRefuseCorrect = true;
  if (task.validation.mustClarify) {
    clarifyOrRefuseCorrect =
      CLARIFY_RE.test(finalText) ||
      (toolsEnabled && calledNames.length === 0);
    if (!clarifyOrRefuseCorrect) reasons.push("expected clarification");
  }
  if (task.validation.mustRefuse) {
    clarifyOrRefuseCorrect = REFUSE_RE.test(finalText);
    if (!clarifyOrRefuseCorrect) reasons.push("expected refusal");
  }

  let toolSelectionCorrect = true;
  if (toolsEnabled && !task.validation.mustClarify && !task.validation.mustRefuse) {
    if (task.expectedTools.length === 0) {
      toolSelectionCorrect = calledNames.length === 0;
      if (!toolSelectionCorrect) reasons.push("expected no tools");
    } else if (task.validation.orderedTools) {
      const prefix = calledNames.slice(0, task.expectedTools.length);
      toolSelectionCorrect =
        JSON.stringify(prefix) === JSON.stringify(task.expectedTools) ||
        task.expectedTools.every((t) => calledNames.includes(t));
      if (!toolSelectionCorrect) {
        reasons.push(
          `expected ordered tools ${task.expectedTools.join(",")}, got ${calledNames.join(",")}`,
        );
      }
    } else {
      toolSelectionCorrect = task.expectedTools.every((t) =>
        calledNames.includes(t),
      );
      if (!toolSelectionCorrect) {
        reasons.push(
          `missing expected tools; expected ${task.expectedTools.join(",")}, got ${calledNames.join(",")}`,
        );
      }
    }
  } else if (!toolsEnabled) {
    // No-tools mode: tool selection N/A — mark true; success depends on clarify/refuse/response.
    toolSelectionCorrect = true;
  }

  let argumentCorrect = true;
  if (toolsEnabled && task.argumentConstraints?.length) {
    for (const constraint of task.argumentConstraints) {
      const call = toolCalls.find((c) => c.name === constraint.tool);
      if (!call) {
        argumentCorrect = false;
        reasons.push(`missing call for arg check: ${constraint.tool}`);
        continue;
      }
      for (const key of constraint.requiredKeys ?? []) {
        if (!(key in call.arguments)) {
          argumentCorrect = false;
          reasons.push(`${constraint.tool} missing arg ${key}`);
        }
      }
      for (const [k, v] of Object.entries(constraint.equals ?? {})) {
        if (JSON.stringify(call.arguments[k]) !== JSON.stringify(v)) {
          argumentCorrect = false;
          reasons.push(
            `${constraint.tool}.${k} expected ${JSON.stringify(v)} got ${JSON.stringify(call.arguments[k])}`,
          );
        }
      }
    }
  }

  let mockStateCorrect = true;
  const ms = task.validation.mockState;
  if (toolsEnabled && ms) {
    if (ms.eventsContains) {
      const found = mock.store.events.some(
        (e) =>
          e.distinctId === ms.eventsContains!.distinctId &&
          e.event === ms.eventsContains!.event,
      );
      if (!found) {
        mockStateCorrect = false;
        reasons.push(
          `mock missing event ${ms.eventsContains.event} for ${ms.eventsContains.distinctId}`,
        );
      }
    }
    if (ms.personHasProperties) {
      const person = mock.store.findPersonByDistinctId(
        ms.personHasProperties.distinctId,
      );
      for (const [k, v] of Object.entries(ms.personHasProperties.properties)) {
        if (person?.properties[k] !== v) {
          mockStateCorrect = false;
          reasons.push(`person prop ${k} mismatch`);
        }
      }
    }
    if (ms.flagExists) {
      const flag = mock.store.findFlag(ms.flagExists.key);
      if (!flag) {
        mockStateCorrect = false;
        reasons.push(`flag ${ms.flagExists.key} missing`);
      } else if (
        ms.flagExists.active !== undefined &&
        flag.active !== ms.flagExists.active
      ) {
        mockStateCorrect = false;
        reasons.push(`flag ${ms.flagExists.key} active mismatch`);
      }
    }
  }

  let responseCorrect = true;
  // Protocol tokens like "ok" are tool-result noise; prefer mock-state / tool evidence.
  const softNeedles = new Set(["ok", "true", "false", "null"]);
  for (const needle of task.validation.responseMustInclude ?? []) {
    if (finalText.toLowerCase().includes(needle.toLowerCase())) continue;

    // If mock state already proves the write/read succeeded, skip soft protocol needles.
    if (softNeedles.has(needle.toLowerCase()) && toolsEnabled) {
      const hasToolEvidence =
        toolCalls.some((c) => !c.isError && task.expectedTools.includes(c.name)) ||
        (task.validation.mockState != null && mockStateCorrect);
      if (hasToolEvidence) continue;
    }

    responseCorrect = false;
    reasons.push(`response missing "${needle}"`);
  }

  const unnecessaryTools =
    toolsEnabled && task.expectedTools.length > 0
      ? calledNames.filter((n) => !task.expectedTools.includes(n)).length
      : toolsEnabled && task.expectedTools.length === 0
        ? calledNames.length
        : 0;
  const invalidTools = toolCalls.filter((c) => c.isError).length;

  // No-tools: tasks that need tools fail unless clarify/refuse is the expected behavior.
  if (!toolsEnabled) {
    const expectsTools =
      task.expectedTools.length > 0 &&
      !task.validation.mustClarify &&
      !task.validation.mustRefuse;
    if (expectsTools) {
      responseCorrect = false;
      reasons.push("no-tools mode cannot complete tool-required task");
    }
  }

  const success =
    clarifyOrRefuseCorrect &&
    (task.validation.mustClarify || task.validation.mustRefuse
      ? true
      : toolsEnabled
        ? toolSelectionCorrect &&
          argumentCorrect &&
          mockStateCorrect &&
          responseCorrect
        : !task.expectedTools.length && responseCorrect);

  // For mustClarify/mustRefuse success is primarily clarifyOrRefuseCorrect
  const finalSuccess =
    task.validation.mustClarify || task.validation.mustRefuse
      ? clarifyOrRefuseCorrect &&
        (toolsEnabled
          ? task.expectedTools.length === 0
            ? calledNames.length === 0 || clarifyOrRefuseCorrect
            : clarifyOrRefuseCorrect
          : clarifyOrRefuseCorrect)
      : success;

  return {
    success: finalSuccess,
    toolSelectionCorrect,
    argumentCorrect,
    mockStateCorrect,
    responseCorrect,
    clarifyOrRefuseCorrect,
    unnecessaryTools,
    invalidTools,
    reasons,
  };
}
