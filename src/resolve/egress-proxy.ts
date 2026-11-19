// The proxy a Process narrowed to named hosts is forced through
// (spec/v1/16-dependencies.md#host-narrowed-egress): a Process of its own in
// the Process's Application, on the platform's proxy image, holding the one
// rule that reaches beyond the cluster, with the Process's edge to it, the
// variables that point its clients there and the policy that admits nothing
// else. The Process is declared; everything here derives.
import type {
  EffectiveApplication,
  EffectiveProcess,
} from "../model/effective-intent.ts";
import {
  egressProxyName,
  hostsOf,
  isHostEgress,
  PROXY_CONFIG,
  PROXY_PORT,
  PROXY_SURFACE,
  PROXY_WRITABLE,
  proxyConfigOf,
  proxyEnvironmentOf,
} from "../model/egress-proxy.ts";
import type { PlatformIntentDocument } from "../model/platform-intent.ts";
import type { ResolvedProcess } from "../model/resolved-deployment.ts";
import { namespaceOf } from "../model/runtime-profiles.ts";
import { egressOf } from "./policy.ts";
import { resolveProcess, type ProcessContext } from "./process.ts";

type Edge = NonNullable<ResolvedProcess["dependencies"]>[number];
type Variable = NonNullable<ResolvedProcess["environment"]>[number];

/** Where the generated configuration is held, beside no project file. */
const configOf = (proxy: string): string => `derived/${proxy}/squid.conf`;

export interface EgressProxy {
  /** The proxy, resolved as any Process is. */
  readonly proxy: ResolvedProcess;
  /** The Process's edge to it, which its policy reaches the proxy by. */
  readonly edge: Edge;
  /** The variables that point the Process's clients at it. */
  readonly environment: readonly Variable[];
}

/** The hosts an edge reaches, as the variables keep them off the proxy. */
const edgeHostsOf = (base: ResolvedProcess): string[] =>
  (base.dependencies ?? []).map(({ address }) =>
    address.slice(0, address.lastIndexOf(":")),
  );

/**
 * The proxy of a Process whose egress is narrowed to hosts, or none where it
 * is not. The platform names the proxy and the lock holds its image, or
 * E_NO_EGRESS_PROXY and E_UNLOCKED_IMAGE refused the set.
 */
export function deriveEgressProxy(
  process: EffectiveProcess,
  base: ResolvedProcess,
  application: EffectiveApplication,
  context: ProcessContext,
): EgressProxy | undefined {
  const { egress } = process;
  if (!isHostEgress(egress)) return undefined;
  const policy = context.platform.egressProxy as NonNullable<
    PlatformIntentDocument["egressProxy"]
  >;
  const name = egressProxyName(process.name);
  const hosts = hostsOf(egress);
  const from = configOf(name);
  const derived: EffectiveProcess = {
    name,
    lifecycle: "application",
    image: policy.image,
    command: ["squid"],
    args: ["-N", "-f", PROXY_CONFIG],
    runtime: "none",
    provides: { [PROXY_SURFACE]: PROXY_PORT },
    probes: {
      readiness: { tcp: PROXY_PORT },
      liveness: { tcp: PROXY_PORT },
    },
    assets: [{ from, mountAt: PROXY_CONFIG }],
    writablePaths: [...PROXY_WRITABLE],
    // Beside the Process it serves, on the architectures and at the site it
    // is held to, so its traffic does not cross sites.
    placement: {
      memory: policy.memory,
      cpu: policy.cpu,
      ...(process.placement.arch === undefined
        ? {}
        : { arch: process.placement.arch }),
      ...(process.placement.site === undefined
        ? {}
        : { site: process.placement.site }),
    },
    startupBudget: "30s",
    // A proxy that restarts drops only the connections it carries.
    cutover: "interrupted",
  };
  const resolved = resolveProcess(derived, {
    ...context,
    assets: new Map([
      ...context.assets,
      [from, proxyConfigOf(process.name, hosts)],
    ]),
  });
  const namespace = namespaceOf(context.project);
  return {
    proxy: {
      ...resolved,
      egressProxy: { for: process.name, reason: egress.reason, hosts },
      ingress: [
        {
          rule: "egress-client",
          namespace,
          process: process.name,
          port: PROXY_PORT,
        },
      ],
      egress: egressOf(derived, context, false),
    },
    edge: {
      application: application.id,
      surface: PROXY_SURFACE,
      address: `${name}.${namespace}.svc.cluster.local:${String(PROXY_PORT)}`,
      peers: [{ namespace, process: name, port: PROXY_PORT }],
    },
    environment: proxyEnvironmentOf(
      `${name}.${namespace}.svc.cluster.local`,
      edgeHostsOf(base),
    ),
  };
}
