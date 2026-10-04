// A set of authored files, resolved and rendered (spec/v1/30-deliverables.md):
// every registered adapter builds its typed objects from the projections, the
// kustomizations list what each directory applies, and the one serializer the
// caller hands in writes the bytes. A path two Deliverables claim is refused
// before anything is serialized. Nothing here performs IO.
import {
  ADAPTERS,
  kustomizationsFor,
  type Adapter,
} from "../adapters/registry.ts";
import { renderPolicyJobPolicy } from "../adapters/networking/render.ts";
import { documentsOf, renderPolicyJob } from "../adapters/vault-policy/job.ts";
import type { Diagnostic, Result } from "../model/diagnostic.ts";
import type { Hasher } from "../model/hasher.ts";
import type { Deliverable, RenderedObject } from "../objects/deliverable.ts";
import type { AuthoredFile } from "./check-intent-set.ts";
import {
  resolveIntentSet,
  type ResolvedSet,
  type ResolveOptions,
} from "./resolve-intent-set.ts";

/** One file's typed objects and its path in, its bytes out: the serializer port. */
export type Serializer = (
  objects: readonly RenderedObject[],
  path: string,
) => string;

export interface RenderOptions extends ResolveOptions {
  readonly serialize: Serializer;
  /** The adapters that render; the registered set unless a caller names another. */
  readonly adapters?: readonly Adapter[];
  /** The projects whose share of the tree to render. */
  readonly projects: readonly string[];
}

/** One rendered file, attributed to the adapter that produced it. */
export interface RenderedFile {
  readonly path: string;
  readonly adapter: string;
  readonly text: string;
}

/** One artifact's files: a Project's share, or the estate-scoped `_estate`. */
export interface RenderedArtifact {
  readonly name: string;
  readonly files: readonly RenderedFile[];
}

/** The estate-scoped paths, which the `_estate` artifact publishes (spec/v1/55-delivery.md#rendered-artifacts-and-pins). */
const ESTATE_SCOPED = /^apps\/(edge|vso-secrets)\//;
const ESTATE = "_estate";

export function collisions(deliverables: readonly Deliverable[]): Diagnostic[] {
  const owners = new Map<string, string[]>();
  for (const { path, adapter } of deliverables)
    owners.set(path, [...(owners.get(path) ?? []), adapter]);
  return [...owners.entries()]
    .filter(([, adapters]) => adapters.length > 1)
    .map(([path, adapters]) => ({
      code: "E_PATH_COLLISION",
      path: "",
      message: `${path} is claimed by ${adapters.join(" and ")}`,
      hint: "Every path has one owner: the plan assigns each adapter's paths from its default path.",
    }));
}

// No two artifacts share a name and no two files a path, so `<=` would order
// the same list.
// Stryker disable next-line EqualityOperator
const byName = (a: string, b: string): number => (a < b ? -1 : 1);
// Stryker disable next-line EqualityOperator
const byPath = (a: RenderedFile, b: RenderedFile): number =>
  byName(a.path, b.path);

export function renderIntentSet(
  files: readonly AuthoredFile[],
  options: RenderOptions,
): Result<readonly RenderedArtifact[]> {
  const resolved = resolveIntentSet(files, options);
  return resolved.ok ? renderResolvedSet(resolved.value, options) : resolved;
}

/** Where every Vault document lands: what the Vault policy job is handed. */
const VAULT_DOCUMENTS = "apps/vso-secrets/policies/";

/**
 * The Vault policy job of one render
 * (spec/v1/30-deliverables.md#vault-configuration-is-rendered-not-applied):
 * its objects and its policy, where the platform names the job and the render
 * holds a document for it to write. It is handed exactly the documents of this
 * render and is named by their digest, so it spans the projects rendered and
 * belongs to no one of them.
 */
function policyJobOf(
  resolved: ResolvedSet,
  rendered: readonly Deliverable[],
  hash: Hasher,
): Deliverable[] {
  const documents = rendered.filter(({ path }) =>
    path.startsWith(VAULT_DOCUMENTS),
  );
  return resolved.policyJob === undefined || documents.length === 0
    ? []
    : [
        ...renderPolicyJob(
          resolved.policyJob,
          documents,
          hash(documentsOf(documents)),
        ),
        renderPolicyJobPolicy(resolved.policyJob),
      ];
}

/** A set already resolved, rendered: the half of {@link renderIntentSet} after resolution. */
export function renderResolvedSet(
  resolved: ResolvedSet,
  options: Omit<RenderOptions, Exclude<keyof ResolveOptions, "hash">>,
): Result<readonly RenderedArtifact[]> {
  const projects = resolved.projects
    .filter(({ project }) => options.projects.includes(project))
    .flatMap((project) =>
      (options.adapters ?? ADAPTERS).flatMap((adapter) =>
        adapter.render(project),
      ),
    );
  const rendered = [
    ...projects,
    ...policyJobOf(resolved, projects, options.hash),
  ];
  const deliverables = [
    ...rendered,
    ...kustomizationsFor(rendered.map(({ path }) => path)),
  ];
  const refused = collisions(deliverables);
  if (refused.length > 0) return { ok: false, diagnostics: refused };

  const artifacts = new Map<string, RenderedFile[]>();
  for (const { path, adapter, objects } of deliverables) {
    const name = ESTATE_SCOPED.test(path)
      ? ESTATE
      : (path.split("/")[1] as string);
    artifacts.set(name, [
      ...(artifacts.get(name) ?? []),
      { path, adapter, text: options.serialize(objects, path) },
    ]);
  }
  // The adapters hand their Deliverables out in the order they derive them, and
  // the artifacts are named in the order they are first met: a stable order a
  // caller can rely on, whatever order the adapters were registered in.
  return {
    ok: true,
    value: [...artifacts.keys()].sort(byName).map((name) => ({
      name,
      files: (artifacts.get(name) as RenderedFile[]).sort(byPath),
    })),
  };
}
