// The rules one Platform document answers on its own
// (spec/v1/14-platform-intent.md): each carries the code the specification
// gives it and the JSON Pointer of what it refuses.
import { BACKED_UP } from "../model/backup.ts";
import type { Diagnostic } from "../model/diagnostic.ts";
import { l4AddressOf } from "../model/l4-addresses.ts";
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

/**
 * A tier's proxy listens on an L4 Address the document declares, and an acme
 * tier's proxy registers with the account the document names
 * (spec/v1/14-platform-intent.md#tiers).
 */
function tierRefusals(document: PlatformIntentDocument): Diagnostic[] {
  return document.tiers.flatMap((tier, index): Diagnostic[] => [
    ...(tier.address === undefined ||
    l4AddressOf(document, tier.address) !== undefined
      ? []
      : [
          {
            code: "E_UNKNOWN_L4_ADDRESS" as const,
            path: `/tiers/${String(index)}/address`,
            message: `the platform declares no L4 Address ${tier.address}`,
            hint: "Declare the address in `l4Addresses`, or name one it declares.",
          },
        ]),
    // The DNS provider's token reaches the proxy through the Secret Store.
    ...(tier.certificates === "acme" && document.secretStore === undefined
      ? [
          {
            code: "E_NO_SECRET_STORE" as const,
            path: `/tiers/${String(index)}`,
            message: `tier ${tier.name} issues its certificates through acme, and no Secret Store holds its DNS provider's token`,
            hint: "Name the platform's `secretStore`, or issue the tier's certificates another way.",
          },
        ]
      : []),
    // A certificate read from the Secret Store is what a tls tier that issues
    // none serves; on a plain tier nothing would serve it, and on an acme
    // tier the resolver issues what its routes serve.
    ...(tier.certificateFrom !== undefined &&
    (tier.listener === "plain" || tier.certificates === "acme")
      ? [
          {
            code: "E_CERTIFICATE_FROM_UNSERVED" as const,
            path: `/tiers/${String(index)}/certificateFrom`,
            message: `tier ${tier.name} reads a certificate from ${tier.certificateFrom}, and ${tier.listener === "plain" ? "terminates no TLS" : "issues its own through acme"}, so its proxy would serve it for nothing`,
            hint: "Name `certificateFrom` on a `tls` tier whose `certificates` is `none`, or drop it.",
          },
        ]
      : []),
    ...(tier.certificateFrom !== undefined && document.secretStore === undefined
      ? [
          {
            code: "E_NO_SECRET_STORE" as const,
            path: `/tiers/${String(index)}/certificateFrom`,
            message: `tier ${tier.name} reads its certificate from ${tier.certificateFrom}, and no Secret Store holds it`,
            hint: "Name the platform's `secretStore`, or drop `certificateFrom`.",
          },
        ]
      : []),
    // Every proxy serves the one default store, so two tiers naming a
    // certificate would both name the certificate every proxy serves.
    ...(tier.certificateFrom !== undefined &&
    document.tiers.findIndex(
      ({ certificateFrom }) => certificateFrom !== undefined,
    ) < index
      ? [
          {
            code: "E_CERTIFICATE_FROM_REPEATED" as const,
            path: `/tiers/${String(index)}/certificateFrom`,
            message: `tier ${tier.name} names a certificate, and an earlier tier already names the one every proxy serves`,
            hint: "Name `certificateFrom` on one tier alone.",
          },
        ]
      : []),
    ...(tier.certificates === "acme" && document.acme === undefined
      ? [
          {
            code: "E_NO_ACME_POLICY" as const,
            path: `/tiers/${String(index)}`,
            message: `tier ${tier.name} issues its certificates through acme, and the platform names no acme account`,
            hint: "Declare the Platform document's `acme`: the account's email, the DNS provider and its token's path.",
          },
        ]
      : []),
  ]);
}

/** Every refusal the Platform document earns on its own. */
export const platformDiagnostics = (
  document: PlatformIntentDocument,
): readonly Diagnostic[] => [
  ...forwardAuthRefusals(document),
  ...tierRefusals(document),
  ...durabilityRefusals(document),
  ...humanGrantRefusals(document),
  ...receiverRefusals(document),
];
