// The rules one Platform document answers on its own
// (spec/v1/14-platform-intent.md): each carries the code the specification
// gives it and the JSON Pointer of what it refuses.
import { BACKED_UP } from "../model/backup.ts";
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

/** A class that derives a backup says when it runs and how many copies it keeps. */
function durabilityRefusals(document: PlatformIntentDocument): Diagnostic[] {
  return Object.entries(document.durability).flatMap(([durability, policy]) =>
    BACKED_UP.has(durability) &&
    (policy.schedule === undefined || policy.retain === undefined)
      ? [
          {
            code: "E_DURABILITY_POLICY_INCOMPLETE",
            path: `/durability/${durability}`,
            message: `the ${durability} class derives a backup, and its policy names no ${policy.schedule === undefined ? "schedule" : "retention"}`,
            hint: "Give the policy a `schedule` and a `retain` count.",
          },
        ]
      : [],
  );
}

/**
 * A group holds a role by one grant: a second would render a second binding
 * under the first one's name.
 */
function humanGrantRefusals(document: PlatformIntentDocument): Diagnostic[] {
  const seen = new Set<string>();
  // A missing list and an empty one refuse nothing alike.
  // Stryker disable next-line ArrayDeclaration
  return (document.humanGrants ?? []).flatMap(
    ({ group, clusterRole }, index): Diagnostic[] => {
      const key = `${group} ${clusterRole}`;
      if (!seen.has(key)) {
        seen.add(key);
        return [];
      }
      return [
        {
          code: "E_DUPLICATE_HUMAN_GRANT",
          path: `/humanGrants/${String(index)}`,
          message: `the group ${group} is granted ${clusterRole} twice`,
          hint: "Keep one grant of the role to the group, with the reason it is held.",
        },
      ];
    },
  );
}

/**
 * A severity route names a receiver the Platform document declares
 * (spec/v1/14-platform-intent.md#monitoring), or an alert it routes reaches no one.
 */
function receiverRefusals(document: PlatformIntentDocument): Diagnostic[] {
  const { monitoring } = document;
  if (monitoring === undefined) return [];
  const declared = new Set(monitoring.receivers.map(({ name }) => name));
  return monitoring.routes.flatMap(({ receiver }, index): Diagnostic[] =>
    declared.has(receiver)
      ? []
      : [
          {
            code: "E_UNKNOWN_RECEIVER",
            path: `/monitoring/routes/${String(index)}/receiver`,
            message: `the platform declares no receiver ${receiver}`,
            hint: "Name a receiver `monitoring.receivers` declares, or declare it there.",
          },
        ],
  );
}

/** Every refusal the Platform document earns on its own. */
export const platformDiagnostics = (
  document: PlatformIntentDocument,
): readonly Diagnostic[] => [
  ...forwardAuthRefusals(document),
  ...handoverRefusals(document),
  ...durabilityRefusals(document),
  ...humanGrantRefusals(document),
  ...receiverRefusals(document),
];
