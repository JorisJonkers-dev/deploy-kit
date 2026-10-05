// The participants list read into its model (spec/v1/40-composition.md#participants).
import type { Result } from "../model/diagnostic.ts";
import {
  participants,
  type ParticipantsDocument,
} from "../model/participants.ts";
import { schemaDiagnostics } from "./schema-diagnostics.ts";

export function readParticipants(value: unknown): Result<ParticipantsDocument> {
  const parsed = participants.safeParse(value);
  return parsed.success
    ? { ok: true, value: parsed.data }
    : {
        ok: false,
        diagnostics: schemaDiagnostics(
          parsed.error,
          "spec/v1/40-composition.md",
        ),
      };
}
