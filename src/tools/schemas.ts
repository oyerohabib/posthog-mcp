import * as z from "zod/v4";
import { errorCode } from "../posthog/errors.js";

export const jsonValueSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema),
  ]),
);

export const jsonObjectSchema = z.record(z.string(), jsonValueSchema);

export function textResult(data: unknown, isError = false) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    structuredContent: data as Record<string, unknown>,
    isError,
  };
}

export function errorResult(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  return textResult({ ok: false, error: errorCode(err), message }, true);
}
