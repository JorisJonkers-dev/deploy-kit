// A set of authored files and the pinned inputs beside them, resolved
// (spec/v1/20-resolved-deployment.md): the set composed as checkIntentSet
// composes it, the pinned inputs read and checked, and every project's
// projections written. The hash arrives as a port; nothing here performs IO.
import { pinnedDiagnostics } from "../check/pinned-inputs.ts";
import type { Diagnostic, Result } from "../model/diagnostic.ts";
import type { ScopedEnv } from "../model/env.ts";
import type { Hasher } from "../model/hasher.ts";
import type { EffectiveProject } from "../model/effective-intent.ts";
import type { InputDigest, PinnedSet } from "../model/resolution.ts";
import {
  readClusterState,
  readImagesLock,
  readNodeContract,
} from "../read/pinned-inputs.ts";
import { readYaml } from "../read/yaml.ts";
import type { ResolvedProject } from "../model/resolution.ts";
import { resolveUnion } from "../resolve/union.ts";
import { composeIntentSet, type AuthoredFile } from "./check-intent-set.ts";

export interface ResolveOptions {
  readonly hash: Hasher;
  /** The integrity of the schema package the render was made with. */
  readonly schemaPackageIntegrity: string;
}

export interface ResolvedSet {
  readonly projects: readonly ResolvedProject[];
}

const NODE_CONTRACT = "node-contract.yml";
const IMAGES_LOCK = "images.lock.yml";
const CLUSTER_STATE = "cluster-state.yml";

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
 * A project's Asset files, by the `from` path it names each by: the file of
 * the set at that path beside the project file, where the set holds one.
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
  const beside = directoryOf(name);
  return new Map(
    [...named].flatMap((from) => {
      const file = files.find((candidate) => candidate.name === beside + from);
      return file === undefined ? [] : [[from, file.text] as const];
    }),
  );
}

type Held = readonly [string, string];
// No two Asset files share a path, so `<=` would order the same list.
// Stryker disable next-line EqualityOperator
const byFrom = ([a]: Held, [b]: Held): number => (a < b ? -1 : 1);

/** A project's Asset files in the order their paths sort. */
const assetsInPathOrder = (
  assets: ReadonlyMap<string, string>,
): { readonly from: string; readonly text: string }[] =>
  [...assets].sort(byFrom).map(([from, text]) => ({ from, text }));

export function resolveIntentSet(
  files: readonly AuthoredFile[],
  { hash, schemaPackageIntegrity }: ResolveOptions,
): Result<ResolvedSet> {
  const composed = composeIntentSet(files);
  if (!composed.ok) return composed;
  const { platform, projects } = composed.value;
  if (platform === undefined)
    return { ok: false, diagnostics: [missing("a Platform document")] };
  const contract = pinned(files, NODE_CONTRACT, readNodeContract);
  const lock = pinned(files, IMAGES_LOCK, readImagesLock);
  const state = pinned(files, CLUSTER_STATE, readClusterState);
  if (!contract.ok || !lock.ok || !state.ok)
    return {
      ok: false,
      diagnostics: [contract, lock, state].flatMap((result) =>
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
  return {
    ok: true,
    value: {
      projects: resolveUnion(set, digests, schemaPackageIntegrity, hash),
    },
  };
}
