// A rule about a document's shape that zod's structure cannot state but JSON
// Schema can: a conditional, or a requirement on what an array contains. zod
// drops a refinement when it generates a schema, so a rule written as one alone
// leaves the published schema accepting what the model refuses. Here the rule
// is declared once with both statements side by side: the check zod runs, and
// the JSON Schema keywords the generator emits for the same node. The corpus in
// test/schema-corpus.test.ts holds the two to the same verdicts.
//
// This is the one module a refinement may appear in (RULE-073 in
// docs/architecture-rules.md).
import type { z } from "zod";

/** One place a value breaks a rule, relative to the node the rule is on. */
export interface Breach {
  readonly path: readonly PropertyKey[];
  readonly message: string;
}

/** A rule both zod and JSON Schema state, about one node of a document. */
export interface ShapeRule<T> {
  /** The rule as JSON Schema keywords, merged into the node's generated schema. */
  readonly statement: Readonly<Record<string, unknown>>;
  /** The same rule as zod checks it: every breach in `value`, none when it holds. */
  readonly breaches: (value: T) => readonly Breach[];
}

/**
 * `schema` holding `rule`, registered under `id`: zod refuses every breach
 * with the rule's own message, and the generated JSON Schema carries the
 * rule's statement beside the node's structure.
 */
export function stated<T extends z.ZodType>(
  schema: T,
  id: string,
  rule: ShapeRule<z.output<T>>,
): T {
  return schema
    .superRefine((value, context) => {
      for (const { path, message } of rule.breaches(value))
        context.addIssue({ code: "custom", path: [...path], message });
    })
    .meta({ id, ...rule.statement });
}
