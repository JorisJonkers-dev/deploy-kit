// What a Process's spawn templates derive (spec/v1/20-resolved-deployment.md#derived-mechanics):
// for each template, the pinned image its pods run, what they request, the
// label they carry and their policy selects, the surfaces they serve the
// Process and what they reach; the namespaced rules that let the Process
// create and remove them; and the variables that hand it the image and labels.
import { CONSUMER_LABEL, consumedOf } from "../model/consumer-label.ts";
import type {
  EffectiveProcess,
  EffectiveProject,
} from "../model/effective-intent.ts";
import {
  versionOf,
  type ImagesLockDocument,
  type LockedImage,
} from "../model/images-lock.ts";
import type { PlatformIntentDocument } from "../model/platform-intent.ts";
import { SPAWN_LABEL } from "../model/spawn-label.ts";
import type {
  EnvEntry,
  ResolvedProcess,
} from "../model/resolved-deployment.ts";
import { resolveEdge } from "./dependencies.ts";
import { DNS_PORT } from "./policy.ts";

/** What resolving a template reads: the lock, the union its edges reach, the platform and its Project. */
interface SpawnContext {
  readonly lock: ImagesLockDocument;
  readonly union: readonly EffectiveProject[];
  readonly platform: PlatformIntentDocument;
  readonly project: string;
}

type ResolvedSpawn = NonNullable<ResolvedProcess["spawns"]>[number];
type ResolvedApiRule = NonNullable<ResolvedProcess["api"]>["rules"][number];

/** Why a Process that declares no `api` of its own holds the rules its templates derive. */
export const SPAWN_REASON = "it creates the pods its spawn templates declare";

/**
 * What creating a template's pods takes, in the Process's own namespace: the
 * pods themselves, and their logs, which the Process reads back.
 */
export const SPAWN_RULES: readonly ResolvedApiRule[] = [
  {
    group: "core",
    objects: ["pods"],
    verbs: ["get", "list", "watch", "create", "delete"],
    scope: "namespace",
  },
  { group: "core", objects: ["pods/log"], verbs: ["get"], scope: "namespace" },
];

export function resolveSpawns(
  process: EffectiveProcess,
  context: SpawnContext,
): ResolvedSpawn[] {
  // A Process with no template and one with an empty list create nothing alike.
  // Stryker disable next-line ArrayDeclaration
  return (process.spawns ?? []).map((template) => {
    // Every alias is checked against the lock before resolution runs:
    // E_UNLOCKED_IMAGE.
    const image = context.lock.images[template.image] as LockedImage;
    // A template with no edge and one with an empty list reach nothing alike.
    // Stryker disable next-line ArrayDeclaration
    const edges = template.dependsOn ?? [];
    const surfaces = Object.entries(template.provides ?? {}).map(
      ([name, port]) => ({ name, port }),
    );
    return {
      name: template.name,
      image: `${image.repository}@${image.digest}`,
      ...versionOf("imageVersion", image),
      uid: image.uid,
      gid: image.gid,
      memory: template.placement.memory,
      cpu: template.placement.cpu,
      selector: `${process.name}-${template.name}`,
      ...(surfaces.length === 0 ? {} : { surfaces }),
      ...(edges.length === 0
        ? {}
        : {
            consumes: edges.map(({ application, surface }) =>
              consumedOf(application, surface),
            ),
            dependencies: edges.map((edge) =>
              resolveEdge(
                edge,
                context.union,
                context.platform,
                context.project,
              ),
            ),
          }),
      egress: [
        {
          rule: "cluster-dns" as const,
          namespace: context.platform.substrate.clusterDns,
          port: DNS_PORT,
        },
      ],
      ...(template.egress === undefined
        ? {}
        : { internetEgress: { reason: template.egress.reason } }),
    };
  });
}

/** The variable a template's value is handed in: `SPAWN_<TEMPLATE>_<WHAT>`. */
const variableOf = (template: string, what: string): string =>
  `SPAWN_${template.toUpperCase().replaceAll(/[^A-Z0-9]/g, "_")}_${what}`;

/**
 * What the Process is handed for each template: the pinned image its pods run,
 * and every label they must carry, as `key=value` joined by commas, the
 * template's own first and then one per surface they consume.
 */
export const spawnEnvironmentOf = (
  spawns: readonly ResolvedSpawn[],
): EnvEntry[] =>
  spawns.flatMap((spawn) => [
    { name: variableOf(spawn.name, "IMAGE"), value: spawn.image },
    {
      name: variableOf(spawn.name, "LABELS"),
      value: [
        `${SPAWN_LABEL}=${spawn.selector}`,
        // A template that consumes nothing carries its own label alone.
        // Stryker disable next-line ArrayDeclaration
        ...(spawn.consumes ?? []).map(
          (consumed) => `${CONSUMER_LABEL}${consumed}=true`,
        ),
      ].join(","),
    },
  ]);
