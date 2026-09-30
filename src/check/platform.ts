// The rules one Platform document answers on its own
// (spec/v1/14-platform-intent.md): each carries the code the specification
// gives it and the JSON Pointer of what it refuses.
import type { Diagnostic } from "../model/diagnostic.ts";
import type { PlatformIntentDocument } from "../model/platform-intent.ts";

/** A tier carrying `authenticated` needs the endpoint that authenticates for it. */
function forwardAuthRefusals(document: PlatformIntentDocument): Diagnostic[] {
  return document.tiers.flatMap((tier, index) =>
    tier.audiences.includes("authenticated") && tier.forwardAuth === undefined
      ? [
          {
            code: "E_NO_FORWARD_AUTH_ENDPOINT",
            path: `/tiers/${index}`,
            message: `tier ${tier.name} carries authenticated and names no forwardAuth endpoint`,
            hint: "Declare the tier's `forwardAuth`, or stop carrying `authenticated` on it.",
          },
        ]
      : [],
  );
}

/** A Project is on one delivery path at a time, never on both. */
function handoverRefusals(document: PlatformIntentDocument): Diagnostic[] {
  const legacy = new Set(document.handover?.legacy);
  const both =
    document.handover?.estate?.filter((project) => legacy.has(project)) ?? [];
  return both.length === 0
    ? []
    : [
        {
          code: "E_HANDOVER_BOTH_PATHS",
          path: "/handover",
          message: `the handover ledger puts ${both.join(", ")} on both delivery paths`,
          hint: "Keep each Project in `legacy` until its handover, then move it to `estate`.",
        },
      ];
}

/** Every refusal the Platform document earns on its own. */
export const platformDiagnostics = (
  document: PlatformIntentDocument,
): readonly Diagnostic[] => [
  ...forwardAuthRefusals(document),
  ...handoverRefusals(document),
];
