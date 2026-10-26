// A set of authored files and the pinned inputs beside them, resolved
// (spec/v1/20-resolved-deployment.md): the set composed as checkIntentSet
// composes it, the pinned inputs read and checked, and every project's
// projections written. The hash arrives as a port; nothing here performs IO.
import { resolveStableAddresses } from "../resolve/stable-addresses.ts";
import type { ResolvedStableAddress } from "../model/stable-address.ts";
import type { ResolvedNodeAgent } from "../model/node-agents.ts";
import { resolveNodeAgents } from "../resolve/node-agents.ts";
import { forwardAuthEndpoint } from "../model/runtime-profiles.ts";
import type { ResolvedForwardAuth } from "../adapters/traefik/shared-middlewares.ts";
import { pinnedDiagnostics } from "../check/pinned-inputs.ts";
import type { Diagnostic, Result } from "../model/diagnostic.ts";
import type { ScopedEnv } from "../model/env.ts";
import type { ImagesLockDocument } from "../model/images-lock.ts";
import type { Hasher } from "../model/hasher.ts";
import type { EffectiveProject } from "../model/effective-intent.ts";
import type { InputDigest, PinnedSet } from "../model/resolution.ts";
import type { MigrationProofDocument } from "../model/migration-proof.ts";
import type {
  HumanGrant,
  PlatformIntentDocument,
} from "../model/platform-intent.ts";
import {
  readClusterState,
  readImagesLock,
  readMigrationProof,
  readNodeContract,
} from "../read/pinned-inputs.ts";
import { readYaml } from "../read/yaml.ts";
import type { ResolvedProject } from "../model/resolution.ts";
import { resolveEvents } from "../resolve/events.ts";
import {
  resolveCatalogJobs,
  type CatalogHome,
} from "../resolve/catalog-job.ts";
import { resolvePolicyJob } from "../resolve/policy-job.ts";
import { resolveUnion } from "../resolve/union.ts";
import type {
  ResolvedEvents,
  ResolvedCatalogJob,
  ResolvedPolicyJob,
} from "../model/resolved-deployment.ts";
import { composeIntentSet, type AuthoredFile } from "./check-intent-set.ts";

export interface ResolveOptions {
  readonly hash: Hasher;
  /** The integrity of the schema package the render was made with. */
  readonly schemaPackageIntegrity: string;
  /**
   * The images lock, where the caller already holds it: composition's union
   * of every fragment's share. Without it the set's own lock file is read.
   */
  readonly imagesLock?: ImagesLockDocument | undefined;
}

export interface ResolvedSet {
  readonly projects: readonly ResolvedProject[];
  /** The Vault policy job, where the platform names one and a Secret Store answers. */
  readonly policyJob?: ResolvedPolicyJob;
  /** The methods that apply each datastore's database catalog. */
  readonly catalogJobs?: readonly ResolvedCatalogJob[];
  /**
   * Where each method whose datastore's own Project is on the estate path
   * belongs: that Project's share of the tree.
   */
  readonly catalogHomes: ReadonlyMap<ResolvedCatalogJob, CatalogHome>;
  /** Where Flux's events go, where the platform names a Reporter. */
  readonly events?: ResolvedEvents;
  /** Every tier's proxy, as `<project>/<application>`: where the shared Middlewares live. */
  readonly tierProxies: readonly string[];
  /** The groups the platform grants a built-in cluster role. */
  readonly humanGrants?: readonly HumanGrant[];
  /** The priority classes the platform declares. */
  readonly priority?: PlatformIntentDocument["priority"];
  /** The Node Agents the node contract and the pools derive. */
  readonly nodeAgents: readonly ResolvedNodeAgent[];
  /** Each tier proxy whose tier names a forward-auth provider, and where the edge asks it. */
  readonly forwardAuths: readonly ResolvedForwardAuth[];
  /** One Stable Address per surface an edge or a tier's forward-auth names. */
  readonly stableAddresses: readonly ResolvedStableAddress[];
}

const NODE_CONTRACT = "node-contract.yml";
const IMAGES_LOCK = "images.lock.yml";
const CLUSTER_STATE = "cluster-state.yml";
const MIGRATION_PROOF = "migration-proof.yml";

const missing = (what: string): Diagnostic => ({
  code: "schema",
  path: "",
  message: `a resolution reads ${what}, and the set holds none`,
  hint: "Read the set together with its Platform document, node contract, images lock and ClusterState snapshot.",
});

/** The one file of a set named `suffix`, read as YAML and then by `read`. */
function pinned<T>(
  files: readonly AuthoredFile[],
  suffix: string,
  read: (value: unknown) => Result<T>,
): Result<T> {
  const file = files.find(({ name }) => name.endsWith(suffix));
  if (file === undefined)
    return { ok: false, diagnostics: [missing(`a ${suffix}`)] };
  const yaml = readYaml(file.text);
  const result = yaml.ok ? read(yaml.value) : yaml;
  return result.ok
    ? result
    : {
        ok: false,
        diagnostics: result.diagnostics.map((diagnostic) => ({
          ...diagnostic,
          document: file.name,
        })),
      };
}

/** The env files in the order their paths sort, whatever order they were read in. */
function inPathOrder(env: readonly ScopedEnv[]): ScopedEnv[] {
  const sorted = [...env];
  // No two env files share a path, so `<=` would order the same list.
  // Stryker disable next-line EqualityOperator
  sorted.sort((a, b) => (a.path < b.path ? -1 : 1));
  return sorted;
}

/** Everything before a path's last segment, or nothing where it has one. */
const directoryOf = (path: string): string =>
  path.slice(0, path.lastIndexOf("/") + 1);

/**
 * A project's Asset and dashboard files, by the `from` path it names each by:
 * the file of the set at that path beside the project file.
 */
function assetsOf(
  name: string,
  project: EffectiveProject,
  files: readonly AuthoredFile[],
): Map<string, string> {
  const named = new Set(
    project.applications.flatMap(({ processes }) =>
      // A missing list and an empty one name no Asset alike.
      // Stryker disable next-line ArrayDeclaration
      processes.flatMap(({ assets }) => (assets ?? []).map(({ from }) => from)),
    ),
  );
  // A dashboard's file is read the same way, by the `from` it names.
  for (const { dashboards } of project.applications)
    // Stryker disable next-line ArrayDeclaration: no list ships nothing.
    for (const { from } of dashboards ?? []) named.add(from);
  // A rule-group file is read the same way, by the `from` it names.
  for (const { alertRules } of project.applications)
    // Stryker disable next-line ArrayDeclaration: no list carries nothing.
    for (const { from } of alertRules ?? []) named.add(from);
  const beside = directoryOf(name);
  return new Map(
    // The set holds every Asset's file, or E_ASSET_NOT_FOUND refused it.
    [...named].map((from) => [
      from,
      (
        files.find(
          (candidate) => candidate.name === beside + from,
        ) as AuthoredFile
      ).text,
    ]),
  );
}

type Held = readonly [string, string];
// No two Asset files share a path, so `<=` would order the same list.
// Stryker disable next-line EqualityOperator
const byFrom = ([a]: Held, [b]: Held): number => (a < b ? -1 : 1);

/** The migration proof beside each project file that has one, or every refusal of one. */
function proofsOf(
  projects: readonly { readonly name: string; readonly project: string }[],
  files: readonly AuthoredFile[],
): Result<Map<string, MigrationProofDocument>> {
  const proofs = new Map<string, MigrationProofDocument>();
  const diagnostics: Diagnostic[] = [];
  for (const { name, project } of projects) {
    const path = directoryOf(name) + MIGRATION_PROOF;
    const file = files.find((candidate) => candidate.name === path);
    if (file === undefined) continue;
    const yaml = readYaml(file.text);
    const read = yaml.ok ? readMigrationProof(yaml.value) : yaml;
    if (read.ok) proofs.set(project, read.value);
    else
      diagnostics.push(
        ...read.diagnostics.map((diagnostic) => ({
          ...diagnostic,
          document: path,
        })),
      );
  }
  return diagnostics.length > 0
    ? { ok: false, diagnostics }
    : { ok: true, value: proofs };
}

/** A project's Asset files in the order their paths sort. */
const assetsInPathOrder = (
  assets: ReadonlyMap<string, string>,
): { readonly from: string; readonly text: string }[] =>
  [...assets].sort(byFrom).map(([from, text]) => ({ from, text }));

export function resolveIntentSet(
  files: readonly AuthoredFile[],
  { hash, schemaPackageIntegrity, imagesLock }: ResolveOptions,
): Result<ResolvedSet> {
  const composed = composeIntentSet(files);
  if (!composed.ok) return composed;
  const { platform, projects } = composed.value;
  if (platform === undefined)
    return { ok: false, diagnostics: [missing("a Platform document")] };
  const contract = pinned(files, NODE_CONTRACT, readNodeContract);
  const lock: Result<ImagesLockDocument> =
    imagesLock === undefined
      ? pinned(files, IMAGES_LOCK, readImagesLock)
      : { ok: true, value: imagesLock };
  const state = pinned(files, CLUSTER_STATE, readClusterState);
  const proofs = proofsOf(
    projects.map(({ name, value }) => ({
      name,
      project: value.document.project,
    })),
    files,
  );
  if (!contract.ok || !lock.ok || !state.ok || !proofs.ok)
    return {
      ok: false,
      diagnostics: [contract, lock, state, proofs].flatMap((result) =>
        result.ok ? [] : result.diagnostics,
      ),
    };

  const set: PinnedSet = {
    platform: platform.value.document,
    nodeContract: contract.value,
    imagesLock: lock.value,
    clusterState: state.value,
    projects: projects.map(({ value }) => value.effective),
    assets: new Map(
      projects.map(({ name, value }) => [
        value.effective.project,
        assetsOf(name, value.effective, files),
      ]),
    ),
    proofs: proofs.value,
  };
  const fragments = projects.map(({ value }): InputDigest => ({
    input: "intent-fragment",
    name: value.document.project,
    digest: hash({
      document: value.document,
      env: inPathOrder(value.env).map(({ scope, file }) => ({ scope, file })),
      assets: assetsInPathOrder(
        set.assets.get(value.document.project) as ReadonlyMap<string, string>,
      ),
      // CI writes the proof beside the project file, so it is the fragment's.
      ...(proofs.value.has(value.document.project)
        ? { proof: proofs.value.get(value.document.project) }
        : {}),
    }),
  }));
  // No two fragments name one project, so `<=` would order the same list.
  // Stryker disable next-line EqualityOperator
  fragments.sort((a, b) => (a.name < b.name ? -1 : 1));
  const contractDigest = hash(contract.value);
  const digests: InputDigest[] = [
    ...fragments,
    {
      input: "platform-intent",
      name: set.platform.metadata.project,
      digest: hash(set.platform),
    },
    {
      input: "node-contract",
      name: contract.value.cluster,
      digest: contractDigest,
    },
    { input: "images-lock", name: lock.value.name, digest: hash(lock.value) },
    {
      input: "cluster-state",
      name: state.value.cluster,
      digest: hash(state.value),
    },
  ];

  const refusals = pinnedDiagnostics(
    set,
    projects.map(({ name, value }) => ({
      document: name,
      effective: value.effective,
    })),
    contractDigest,
    platform.name,
  );
  if (refusals.length > 0) return { ok: false, diagnostics: refusals };
  const job = resolvePolicyJob(set);
  const { jobs: catalogs, homes } = resolveCatalogJobs(set, job);
  const events = resolveEvents(set);
  return {
    ok: true,
    value: {
      projects: resolveUnion(set, digests, schemaPackageIntegrity, hash),
      ...(job === undefined ? {} : { policyJob: job }),
      ...(catalogs.length === 0 ? {} : { catalogJobs: catalogs }),
      catalogHomes: homes,
      ...(events === undefined ? {} : { events }),
      tierProxies: set.platform.tiers.map(({ traefik }) => traefik),
      stableAddresses: resolveStableAddresses(
        set.projects,
        set.platform,
        set.clusterState,
      ),
      nodeAgents: resolveNodeAgents(
        set.platform,
        set.nodeContract,
        set.imagesLock,
      ),
      // An absent list and an undefined one render no binding alike.
      // Stryker disable next-line ConditionalExpression
      ...(set.platform.humanGrants === undefined
        ? {}
        : { humanGrants: set.platform.humanGrants }),
      // No policy and an undefined one render no class alike.
      // Stryker disable next-line ConditionalExpression
      ...(set.platform.priority === undefined
        ? {}
        : { priority: set.platform.priority }),
      // A provider the union does not declare is asked by no route, or
      // E_UNKNOWN_FORWARD_AUTH_PROVIDER refused the set, so its Middleware is
      // not rendered.
      forwardAuths: set.platform.tiers.flatMap(
        ({ traefik, forwardAuth }): ResolvedForwardAuth[] => {
          if (forwardAuth === undefined) return [];
          const address = forwardAuthEndpoint(
            set.platform,
            set.projects,
            forwardAuth,
          );
          return address === undefined
            ? []
            : [
                {
                  proxy: traefik,
                  address,
                  // No list and an undefined one hand on nothing alike.
                  // Stryker disable next-line ConditionalExpression
                  ...(forwardAuth.responseHeaders === undefined
                    ? {}
                    : { responseHeaders: forwardAuth.responseHeaders }),
                },
              ];
        },
      ),
    },
  };
}
