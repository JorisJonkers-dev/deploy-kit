// A project file read into the source model
// (spec/v1/10-project-intent.md): the schema's output is the model, in the
// authored vocabulary (docs/adr/architecture/0057-the-authored-shape-is-the-source-model.md).
// The rules the document answers are check/project.ts's.
import type { Result } from "../model/diagnostic.ts";
import {
  projectIntent,
  type ProjectIntentDocument,
} from "../model/project-intent.ts";
import { schemaDiagnostics } from "./schema-diagnostics.ts";

export function readProjectIntent(
  value: unknown,
): Result<ProjectIntentDocument> {
  const parsed = projectIntent.safeParse(value);
  return parsed.success
    ? { ok: true, value: parsed.data }
    : {
        ok: false,
        diagnostics: schemaDiagnostics(
          parsed.error,
          "spec/v1/10-project-intent.md",
        ),
      };
}
