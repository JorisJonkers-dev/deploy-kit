// What an acme tier derives on the Process of its proxy
// (spec/v1/20-resolved-deployment.md#a-tiers-proxy): the claim that keeps the
// ACME state, the DNS provider's token and the way out to the certificate
// authority. The resolver itself is the edge proxy's. Nothing here is
// authored.
import type {
  EffectiveApplication,
  EffectiveProcess,
} from "../model/effective-intent.ts";
import type { PlatformIntentDocument } from "../model/platform-intent.ts";
import type { ResolvedProcess } from "../model/resolved-deployment.ts";
import {
  ACME_CLAIM,
  ACME_MOUNT,
  ACME_SIZE,
  DNS_TOKEN_KEYS,
  tiersAnsweredBy,
} from "../model/tier-proxy.ts";
import { destinationOf } from "./secrets.ts";

type ResolvedGrant = NonNullable<ResolvedProcess["secrets"]>[number];
type EnvEntry = NonNullable<ResolvedProcess["environment"]>[number];

export interface ProxyDerivation {
  /** The Process as resolution reads it: an acme tier's claim and egress added. */
  readonly process: EffectiveProcess;
  /** The grants the tier derives: an acme tier's DNS token. */
  readonly grants: readonly ResolvedGrant[];
  /** The variables the token arrives as, under the name its client reads. */
  readonly environment: readonly EnvEntry[];
}

export function deriveProxy(
  process: EffectiveProcess,
  application: EffectiveApplication,
  context: {
    readonly platform: PlatformIntentDocument;
    readonly project: string;
  },
): ProxyDerivation {
  const tiers = tiersAnsweredBy(
    context.platform,
    context.project,
    application,
    process.name,
  );
  const acme = tiers.some(({ certificates }) => certificates === "acme");
  if (!acme) return { process, grants: [], environment: [] };
  // Every acme tier has the platform's account, or E_NO_ACME_POLICY refused it.
  const account = context.platform.acme as NonNullable<
    PlatformIntentDocument["acme"]
  >;
  const key = DNS_TOKEN_KEYS[account.dnsProvider];
  return {
    process: {
      ...process,
      volumes: [
        // A Process with no volumes and one with an empty list hold none alike.
        // Stryker disable next-line ArrayDeclaration
        ...(process.volumes ?? []),
        {
          claim: ACME_CLAIM,
          mountAt: ACME_MOUNT,
          size: ACME_SIZE,
          durability: "reconstructible",
        },
      ],
      // The resolver asks the certificate authority and the DNS provider, both
      // beyond the cluster.
      egress: process.egress ?? {
        // The one target there is: resolution reads the reason alone.
        // Stryker disable next-line StringLiteral
        to: "internet",
        reason: "ACME issuance and its DNS challenge",
      },
    },
    grants: [
      {
        path: account.token,
        keys: [key],
        access: "read",
        delivery: "env",
        destination: destinationOf(process.name, account.token),
        restartTargets: [process.name],
      },
    ],
    environment: [{ name: key, secret: { path: account.token, key } }],
  };
}
