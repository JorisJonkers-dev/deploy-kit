// What an acme tier derives on the Process of its proxy
// (spec/v1/20-resolved-deployment.md#a-tiers-proxy): the claim that keeps the
// ACME state, the DNS provider's token and the way out to the certificate
// authority; and on every tier, the API access its provider reads routes with.
// The resolver itself is the edge proxy's. Nothing here is authored.
import type {
  EffectiveApplication,
  EffectiveProcess,
  EffectiveProject,
} from "../model/effective-intent.ts";
import type { PlatformIntentDocument } from "../model/platform-intent.ts";
import type { ResolvedProcess } from "../model/resolved-deployment.ts";
import {
  ACME_CLAIM,
  CERTIFICATE_KEYS,
  ACME_MOUNT,
  ACME_SIZE,
  DNS_TOKEN_KEYS,
  PROXY_API,
  proxyProcessOf,
  tiersAnsweredBy,
  type ResolvedHeldCertificate,
} from "../model/tier-proxy.ts";
import { destinationOf } from "./secrets.ts";

type ResolvedGrant = NonNullable<ResolvedProcess["secrets"]>[number];
type EnvEntry = NonNullable<ResolvedProcess["environment"]>[number];

export interface ProxyDerivation {
  /** The Process as resolution reads it: its API access, and an acme tier's claim and egress, added. */
  readonly process: EffectiveProcess;
  /** The grants the tier derives: an acme tier's DNS token, and the certificate a tier reads. */
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
  if (tiers.length === 0) return { process, grants: [], environment: [] };
  const read = withProxyApi(process);
  const held = heldCertificateOf(process.name, tiers);
  const acme = tiers.some(({ certificates }) => certificates === "acme");
  if (!acme) return { process: read, grants: held, environment: [] };
  // Every acme tier has the platform's account, or E_NO_ACME_POLICY refused it.
  const account = context.platform.acme as NonNullable<
    PlatformIntentDocument["acme"]
  >;
  const key = DNS_TOKEN_KEYS[account.dnsProvider];
  return {
    process: {
      ...read,
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
      ...held,
    ],
    environment: [{ name: key, secret: { path: account.token, key } }],
  };
}

/**
 * A tier's proxy reads its routes through the Kubernetes API, so it holds the
 * access its provider needs, beside any it declares itself.
 */
function withProxyApi(process: EffectiveProcess): EffectiveProcess {
  const rules = PROXY_API.rules.map(({ group, objects, verbs }) => ({
    group,
    objects: [...objects],
    verbs: [...verbs],
  }));
  return {
    ...process,
    api: {
      reason: process.api?.reason ?? PROXY_API.reason,
      rules: [...rules, ...(process.api?.rules ?? [])],
    },
  };
}

/**
 * The certificate a tier reads from the Secret Store, synced beside its proxy
 * for the default TLS store to name. The proxy reads it through the API, so
 * nothing is injected and a new certificate restarts nothing.
 */
const heldCertificateOf = (
  process: string,
  tiers: readonly { readonly certificateFrom?: string | undefined }[],
): ResolvedGrant[] =>
  tiers.flatMap(({ certificateFrom }) =>
    certificateFrom === undefined
      ? []
      : [
          {
            path: certificateFrom,
            keys: [...CERTIFICATE_KEYS],
            access: "read" as const,
            delivery: "env" as const,
            destination: destinationOf(process, certificateFrom),
          },
        ],
  );

/**
 * The default TLS store a tier's certificate derives, where the union declares
 * its proxy: one tier at most names one (E_CERTIFICATE_FROM_REPEATED).
 */
export function resolveHeldCertificates(
  platform: Pick<PlatformIntentDocument, "tiers">,
  projects: readonly EffectiveProject[],
): ResolvedHeldCertificate[] {
  return platform.tiers.flatMap(
    ({ traefik, listener, certificateFrom }): ResolvedHeldCertificate[] => {
      if (certificateFrom === undefined) return [];
      const [project, application] = traefik.split("/");
      // The union declares every tier's proxy, or E_UNKNOWN_TIER_PROXY refused it.
      const declared = projects
        .find((candidate) => candidate.project === project)
        ?.applications.find(
          ({ id }) => id === application,
        ) as EffectiveApplication;
      const process = proxyProcessOf(declared, listener);
      return process === undefined
        ? []
        : [{ proxy: traefik, secret: destinationOf(process, certificateFrom) }];
    },
  );
}
