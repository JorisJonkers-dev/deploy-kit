import type { z } from "zod";
import type { Diagnostic } from "../domain/diagnostic.ts";

const escape = (segment: PropertyKey): string =>
  String(segment).replaceAll("~", "~0").replaceAll("/", "~1");

/** A schema failure as diagnostics, each at the JSON Pointer of the value it concerns. */
export function schemaDiagnostics(
  error: z.ZodError,
  chapter: string,
): Diagnostic[] {
  return error.issues.map((issue) => ({
    code: "schema",
    path: issue.path.map((segment) => `/${escape(segment)}`).join(""),
    message: issue.message,
    hint: `Correct the field against ${chapter}.`,
  }));
}
