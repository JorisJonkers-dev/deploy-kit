// A set of authored files, resolved and rendered (spec/v1/30-deliverables.md):
// every registered adapter builds its typed objects from the projections, the
// kustomizations list what each directory applies, and the one serializer the
// caller hands in writes the bytes. A path two Deliverables claim is refused
// before anything is serialized. Nothing here performs IO.
import { NODE_PROJECT } from "../model/node-agents.ts";
import { renderNodeAgents } from "../adapters/kubernetes/node-agents.ts";
import { renderNodeSecrets } from "../adapters/vso/render.ts";
import { renderSharedMiddlewares } from "../adapters/traefik/shared-middlewares.ts";
import { renderHeldCertificates } from "../adapters/traefik/held-certificates.ts";
import {
  ADAPTERS,
  kustomizationsFor,
  type Adapter,
} from "../adapters/registry.ts";
import { renderEvents } from "../adapters/kubernetes/events.ts";
import { renderHumanGrants } from "../adapters/kubernetes/human-grants.ts";
import { renderStableAddresses } from "../adapters/kubernetes/stable-addresses.ts";
import { renderPriorityClasses } from "../adapters/kubernetes/priority-classes.ts";
import { ADAPTER as TRAEFIK } from "../adapters/traefik/render.ts";
import { renderPolicyJobPolicy } from "../adapters/networking/render.ts";
import {
  applicationDirectory,
  ESTATE_DIRECTORY,
  policyJobDirectory,
} from "../adapters/shared/paths.ts";
import { documentsOf, renderPolicyJob } from "../adapters/vault-policy/job.ts";
import {
  policiesOf,
  renderCatalogVault,
  renderNodeVault,
} from "../adapters/vault-policy/render.ts";
import {
  catalogDigestOf,
  renderCatalogJob,
} from "../adapters/kubernetes/catalog.ts";
import type { Diagnostic, Result } from "../model/diagnostic.ts";
import type { Hasher } from "../model/hasher.ts";
import type { Deliverable, RenderedObject } from "../objects/deliverable.ts";
import type { ServiceAccount } from "../objects/kubernetes.ts";
import type {
  ResolvedCatalogJob,
  ResolvedPolicyJob,
} from "../model/resolved-deployment.ts";
import { namespaceOf } from "../model/runtime-profiles.ts";
import type { CatalogHome } from "../resolve/catalog-job.ts";
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
const ESTATE_SCOPED = `${ESTATE_DIRECTORY}/`;
const ESTATE = "_estate";

/** Where a Vault document lands: a policies directory, under the name Vault holds it by. */
// No rendered path runs on past its `.json`, so the anchor decides nothing.
// Stryker disable next-line Regex
const VAULT_DOCUMENT = /\/policies\/[^/]+\.(policy|role)\.json$/;

export function collisions(deliverables: readonly Deliverable[]): Diagnostic[] {
  const owners = new Map<string, string[]>();
  for (const { path, adapter } of deliverables)
    owners.set(path, [...(owners.get(path) ?? []), adapter]);
  // A Vault role binds a ServiceAccount's name and namespace, so a second
  // account of one name would hold the first one's role.
  const accounts = new Map<string, string[]>();
  for (const { path, objects } of deliverables)
    for (const object of objects)
      if (isAccount(object)) {
        const name = `${String(object.metadata.namespace)}/${object.metadata.name}`;
        accounts.set(name, [...(accounts.get(name) ?? []), path]);
      }
  // Every Project writes its own documents, but Vault holds every name in one
  // place, so two documents of one name are one policy or one role.
  const names = new Map<string, string[]>();
  for (const { path } of deliverables)
    if (VAULT_DOCUMENT.test(path)) {
      const name = path.slice(path.lastIndexOf("/") + 1);
      names.set(name, [...(names.get(name) ?? []), path]);
    }
  return [
    ...[...names.entries()]
      .filter(([, paths]) => new Set(paths).size > 1)
      .map(([name, paths]) => ({
        code: "E_PATH_COLLISION" as const,
        path: "",
        message: `the Vault name ${name} is claimed by ${[...new Set(paths)].join(" and ")}`,
        hint: "Rename an Application or a Process: a Vault name is its namespace and its identity, and a hyphen does not keep two of them apart.",
      })),
    ...[...owners.entries()]
      .filter(([, adapters]) => adapters.length > 1)
      .map(([path, adapters]) => ({
        code: "E_PATH_COLLISION" as const,
        path: "",
        message: `${path} is claimed by ${adapters.join(" and ")}`,
        hint: "Every path has one owner: an adapter writes only below the directories the shared path helpers give it.",
      })),
    ...[...accounts.entries()]
      .filter(([, paths]) => paths.length > 1)
      .map(([name, paths]) => ({
        code: "E_PATH_COLLISION" as const,
        path: "",
        message: `the ServiceAccount ${name} is claimed by ${paths.join(" and ")}`,
        hint: "Rename the Process: a derived identity's name is its Process's with -backup, -migration or -catalog, so no Process may carry one.",
      })),
  ];
}

const isAccount = (object: RenderedObject): object is ServiceAccount =>
  "kind" in object && object.kind === "ServiceAccount";

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

/**
 * What names the Vault policy job: the documents it is handed, and everything
 * its pod template runs with, since a Job's template never changes once
 * created.
 */
const policyJobDigestOf = (
  job: NonNullable<ResolvedSet["policyJob"]>,
  documents: readonly Deliverable[],
): unknown => ({
  documents: documentsOf(documents),
  image: job.image,
  uid: job.uid,
  gid: job.gid,
  memory: job.memory,
  cpu: job.cpu,
  deadline: job.deadline,
  eligibleNodes: job.eligibleNodes,
});

/**
 * One Vault policy job in `directory`
 * (spec/v1/30-deliverables.md#vault-configuration-is-rendered-not-applied):
 * its objects and its policy, handed the documents under that directory and
 * named by their digest, where it holds any.
 */
function policyJobIn(
  job: ResolvedPolicyJob,
  rendered: readonly Deliverable[],
  directory: string,
  hash: Hasher,
): Deliverable[] {
  const documents = rendered.filter(({ path }) =>
    path.startsWith(`${policiesOf(directory)}/`),
  );
  return documents.length === 0
    ? []
    : [
        ...renderPolicyJob(
          job,
          documents,
          hash(policyJobDigestOf(job, documents)),
          directory,
        ),
        renderPolicyJobPolicy(job, "networkpolicy.yaml", directory),
      ];
}

/**
 * The Vault policy jobs of one render, where the platform names the job
 * (spec/v1/20-resolved-deployment.md#the-vault-policy-job): one in each
 * Project's own share, in that Project's namespace, writing only that
 * Project's documents. Each logs in as the platform's role, which confines a
 * writer to its own namespace's names.
 */
function policyJobsOf(
  resolved: ResolvedSet,
  rendered: readonly Deliverable[],
  projects: readonly string[],
  hash: Hasher,
): Deliverable[] {
  const job = resolved.policyJob;
  if (job === undefined) return [];
  return projects.flatMap((project) =>
    policyJobIn(
      {
        ...job,
        namespace: namespaceOf(project),
        ...meshIn(resolved, project),
      },
      rendered,
      policyJobDirectory(project),
      hash,
    ),
  );
}

/** What the mesh derives in a Project's namespace, read off its resolved Applications. */
const meshIn = (
  resolved: ResolvedSet,
  project: string,
): { mesh?: NonNullable<ResolvedPolicyJob["mesh"]> } => {
  // A Project this render holds resolved; one whose one Application moved out
  // of it holds none, and enrols nothing.
  // The Node Agents' Project resolves no Application, and enrols nothing.
  const [first] =
    resolved.projects.find((held) => held.project === project)?.applications ??
    [];
  const mesh = first?.mesh;
  // `{}` and `{ mesh: undefined }` render the same job, so no test tells them apart.
  // Stryker disable next-line ConditionalExpression
  return mesh === undefined ? {} : { mesh };
};

/** The catalog methods this render holds: those whose datastore's own Project renders. */
const heldCatalogs = (
  resolved: ResolvedSet,
  projects: readonly string[],
): ResolvedCatalogJob[] =>
  (resolved.catalogJobs ?? []).filter((job) =>
    projects.includes(homeOf(resolved, job).project),
  );

/** The Project and Application that run a catalog method's datastore. */
const homeOf = (resolved: ResolvedSet, job: ResolvedCatalogJob): CatalogHome =>
  // Resolution gives every catalog method the home it derives it in.
  resolved.catalogHomes.get(job) as CatalogHome;

/**
 * Each datastore's catalog method this render holds
 * (spec/v1/16-dependencies.md#applying-the-catalog): its objects, its policy,
 * and the Vault documents the policy job writes for it, in the share of the
 * datastore's own Project.
 */
function catalogJobsOf(
  resolved: ResolvedSet,
  held: readonly ResolvedCatalogJob[],
  hash: Hasher,
): Deliverable[] {
  return held.flatMap((job) => {
    const home = homeOf(resolved, job);
    const directory = applicationDirectory(home.project, home.application);
    return [
      renderCatalogJob(job, hash(catalogDigestOf(job)), directory),
      renderPolicyJobPolicy(
        { ...job, ...meshIn(resolved, home.project) },
        `${job.identity}-networkpolicy.yaml`,
        directory,
      ),
      ...renderCatalogVault(job, policyJobDirectory(home.project)),
    ];
  });
}

/** A set already resolved, rendered: the half of {@link renderIntentSet} after resolution. */
export function renderResolvedSet(
  resolved: ResolvedSet,
  options: Omit<RenderOptions, Exclude<keyof ResolveOptions, "hash">>,
): Result<readonly RenderedArtifact[]> {
  const events = resolved.events;
  const rendering = resolved.projects.filter(({ project }) =>
    options.projects.includes(project),
  );
  const adapters = options.adapters ?? ADAPTERS;
  const projects = rendering.flatMap((project) =>
    adapters.flatMap((adapter) => adapter.render(project)),
  );
  const held = heldCatalogs(resolved, options.projects);
  const catalogs = catalogJobsOf(resolved, held, options.hash);
  // The Node Agents are the `node` Project's, rendered where it is asked for:
  // the speaker's memberlist key is that Project's own to generate.
  const agents = options.projects.includes(NODE_PROJECT)
    ? [
        ...renderNodeAgents(resolved.nodeAgents),
        ...renderNodeSecrets(resolved.nodeAgents),
        ...renderNodeVault(resolved.nodeAgents),
      ]
    : [];
  const rendered = [
    ...projects,
    ...catalogs,
    ...agents,
    ...policyJobsOf(
      resolved,
      [...projects, ...catalogs, ...agents],
      options.projects,
      options.hash,
    ),
    // Each Project's route for Flux's events is its own.
    ...rendering.flatMap(({ project }) =>
      events === undefined ? [] : renderEvents(events, project),
    ),
    // The Middlewares every route names, with the routes they serve.
    ...(adapters.some(({ name }) => name === TRAEFIK)
      ? renderSharedMiddlewares(
          resolved.tierProxies,
          options.projects,
          resolved.forwardAuths,
        )
      : []),
    // The certificate a tier reads, served from the default TLS store.
    ...(adapters.some(({ name }) => name === TRAEFIK)
      ? renderHeldCertificates(resolved.heldCertificates, options.projects)
      : []),
    // The Stable Addresses are the estate's, delivered with the Projects that
    // resolve them: a render holding none of them has nothing to resolve.
    ...renderStableAddresses(
      resolved.stableAddresses.filter(({ consumers }) =>
        consumers.some((project) => options.projects.includes(project)),
      ),
    ),
    // A Human Grant is the platform's, so every render holds it.
    ...renderHumanGrants(resolved.humanGrants ?? []),
    // The priority classes are the cluster's, so every render holds them.
    ...renderPriorityClasses(resolved.priority),
  ];
  const deliverables = [
    ...rendered,
    ...kustomizationsFor(rendered.map(({ path }) => path)),
  ];
  const refused = collisions(deliverables);
  if (refused.length > 0) return { ok: false, diagnostics: refused };

  const artifacts = new Map<string, RenderedFile[]>();
  for (const { path, adapter, objects } of deliverables) {
    const name = path.startsWith(ESTATE_SCOPED)
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
