// The participants list (spec/v1/40-composition.md#participants): every
// project composition expects a fragment from, the Platform document's among
// them, each with how long its newest publish may be. It is enumerated, never
// derived: a project nothing depends on can vanish without breaking a
// reference, and only a list of what was expected can tell.
import { z } from "zod";
import { stated, type ShapeRule } from "./shape-rule.ts";

const text = z.string().min(1);
/** How long a participant's newest publish may be, in whole days. */
const age = z.string().regex(/^\d+d$/);
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** How old a participant's newest publish may be where its entry says nothing. */
export const DEFAULT_MAX_AGE = "7d";

/**
 * An override is a decision somebody made, so it says why: a `maxAge` carries
 * its reason, and a dormant participant is a ledger entry, with an owner, a
 * reason and the date it is looked at again.
 */
const overridesAreExplained: ShapeRule<{
  readonly maxAge?: string;
  readonly dormant?: true;
  readonly owner?: string;
  readonly reason?: string;
  readonly reviewBy?: string;
}> = {
  statement: {
    dependentRequired: {
      maxAge: ["reason"],
      dormant: ["owner", "reason", "reviewBy"],
    },
  },
  breaches: (entry) => [
    ...(entry.maxAge !== undefined && entry.reason === undefined
      ? [
          {
            path: ["reason"],
            message: "a maxAge other than the default says why",
          },
        ]
      : []),
    ...(entry.dormant === undefined
      ? []
      : (["owner", "reason", "reviewBy"] as const)
          .filter((field) => entry[field] === undefined)
          .map((field) => ({
            path: [field],
            message: `a dormant participant names its ${field}`,
          }))),
  ],
};

const participant = stated(
  z.strictObject({
    maxAge: age.exactOptional(),
    // Exempt from `maxAge`, and from nothing else.
    dormant: z.literal(true).exactOptional(),
    owner: text.exactOptional(),
    reason: text.exactOptional(),
    reviewBy: day.exactOptional(),
  }),
  "Participant",
  overridesAreExplained,
);

export const participants = z
  .strictObject({
    // Each project by its own name, the Platform document under its own.
    participants: z.record(text, participant),
  })
  .meta({ id: "Participants" });

export type ParticipantsDocument = z.output<typeof participants>;
export type Participant = ParticipantsDocument["participants"][string];
