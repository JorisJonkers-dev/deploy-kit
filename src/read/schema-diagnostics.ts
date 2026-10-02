import type { z } from "zod";
import type { Diagnostic } from "../model/diagnostic.ts";

const escape = (segment: PropertyKey): string =>
  String(segment).replaceAll("~", "~0").replaceAll("/", "~1");

/** Where a refusal lands, and what it says, before its code and hint. */
interface Refusal {
  readonly path: string;
  readonly message: string;
}

/**
 * One issue as the refusals it reports: an unknown field at its own pointer,
 * one per field, and anything else at the value the issue concerns
 * (spec/v1/10-project-intent.md#what-a-schema-refusal-reports).
 */
function refusalsOf(issue: z.core.$ZodIssue): Refusal[] {
  const at = issue.path.map((segment) => `/${escape(segment)}`).join("");
  return issue.code === "unrecognized_keys"
    ? issue.keys.map((key) => ({
        path: `${at}/${escape(key)}`,
        message: `"${key}" is not a field of the model`,
      }))
    : [{ path: at, message: issue.message }];
}

/** A schema failure as diagnostics: one per offending value, at its JSON Pointer. */
export function schemaDiagnostics(
  error: z.ZodError,
  chapter: string,
): Diagnostic[] {
  const reported = new Map<string, Refusal>();
  for (const refusal of error.issues.flatMap(refusalsOf))
    if (!reported.has(refusal.path)) reported.set(refusal.path, refusal);
  return [...reported.values()].map(({ path, message }) => ({
    code: "schema",
    path,
    message,
    hint: `Correct the field against ${chapter}.`,
  }));
}
