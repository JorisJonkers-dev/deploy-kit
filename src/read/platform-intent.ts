// A Platform document read into the source model
// (spec/v1/14-platform-intent.md): the schema's output is the model, and the
// rules it answers are check/platform.ts's.
import type { Result } from "../model/diagnostic.ts";
import {
  platformIntent,
  type PlatformIntentDocument,
} from "../model/platform-intent.ts";
import { schemaDiagnostics } from "./schema-diagnostics.ts";

export function readPlatformIntent(
  value: unknown,
): Result<PlatformIntentDocument> {
  const parsed = platformIntent.safeParse(value);
  return parsed.success
    ? { ok: true, value: parsed.data }
    : {
        ok: false,
        diagnostics: schemaDiagnostics(
          parsed.error,
          "spec/v1/14-platform-intent.md",
        ),
      };
}
