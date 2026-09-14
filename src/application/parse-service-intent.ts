// Conformance, operationally.
//
// A document **conforms to** the Service Intent metamodel when all four of
// these hold, and this use-case is where the four are put in order:
//
//   1. it is YAML;
//   2. it is an instance of the metamodel (schema.ts): every closed vocabulary
//      is respected, every union picks an arm, and no class carries a key it
//      does not declare;
//   3. it maps into the domain model, which is total for an instance;
//   4. every well-formedness rule in `SERVICE_INTENT_RULES` returns no
//      violation.
//
// Nothing about the model's **semantics** is evaluated: no derivation runs, no
// Deliverable is produced, and no second document is read. Conformance here is
// the language definition's first three parts, which is exactly what Atkinson
// and Kuehne's fourth part is defined against and what the derivation this
// repository has not written yet will be held to.
//
// Every stage runs to completion before the next is entered, and stage 4 runs
// every rule rather than stopping at the first: a use-case returns a diagnostic
// list, so one command reports ten mistakes
// (docs/architecture.md#error-model).
//
// This is the seam the tests assert at (docs/architecture.md#testing): document
// in, `Result` out, in memory, no filesystem. The gate supplies the bytes.
import {
  accepted,
  refused,
  type Diagnostic,
  type Result,
} from "../domain/diagnostic.ts";
import type { Domain } from "../domain/service-intent/model.ts";
import { SERVICE_INTENT_RULES } from "../domain/service-intent/rules.ts";
import { readDomain } from "../wire/service-intent/read.ts";

/**
 * Parse one Service Intent document and hold it to every rule one document
 * decides.
 *
 * `document` names the file the bytes came from; it is stamped onto every
 * diagnostic, including the ones a rule raised, because a rule is a pure
 * function of the model and cannot know which file it was read from.
 */
export function parseServiceIntent(
  text: string,
  document: string,
): Result<Domain> {
  const read = readDomain(text, document);
  if (!read.ok) return read;

  const violations: Diagnostic[] = [];
  for (const rule of SERVICE_INTENT_RULES)
    for (const violation of rule.evaluate(read.value))
      violations.push({ ...violation, document });

  return violations.length === 0 ? accepted(read.value) : refused(violations);
}

/**
 * Whether `document` conforms, as one boolean, for a caller that only needs
 * the answer. The diagnostics are the interesting half; this exists so a test
 * or a report can say "23 of 23" without re-deriving it.
 */
export function conforms(text: string, document: string): boolean {
  return parseServiceIntent(text, document).ok;
}
