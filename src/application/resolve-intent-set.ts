// A set of authored files and the pinned inputs beside them, resolved
// (spec/v1/20-resolved-deployment.md): the set composed as checkIntentSet
// composes it, the pinned inputs read and checked, and every project's
// projections written. The hash arrives as a port; nothing here performs IO.
import { pinnedDiagnostics } from "../check/pinned-inputs.ts";
import type { Diagnostic, Result } from "../model/diagnostic.ts";
import type { ScopedEnv } from "../model/env.ts";
import type { Hasher } from "../model/hasher.ts";
import type { InputDigest, PinnedSet } from "../model/resolution.ts";
import {
  readClusterState,
  readImagesLock,
  readNodeContract,
} from "../read/pinned-inputs.ts";
import { readYaml } from "../read/yaml.ts";
import { resolveUnion, type ResolvedProject } from "../resolve/union.ts";
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
  };
  const fragments = projects.map(({ value }): InputDigest => ({
    input: "intent-fragment",
    name: value.document.project,
    digest: hash({
      document: value.document,
      env: inPathOrder(value.env).map(({ scope, file }) => ({ scope, file })),
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
