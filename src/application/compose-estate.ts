// Composing the estate (spec/v1/40-composition.md#the-composition-run): every
// Project's newest Intent Fragment, the Platform document's and the ClusterState
// snapshot, resolved and rendered as one union. An error refuses the fragments
// it names, not the run: a changed fragment it names is isolated at the
// fragment the previous lock recorded for its Project, and the union is
// composed again, until no error names a changed fragment
// (spec/v1/40-composition.md#a-refused-project-is-isolated). The participants
// list says who is expected: a participant that published nothing, or nothing
// lately, and a fragment the list does not name, are isolated before the union
// is composed at all (spec/v1/40-composition.md#participants). A Pause holds a
// Project's pin, and a Rollback composes it at its held fragment
// (spec/v1/55-delivery.md#pause-and-rollback). What comes out is one artifact
// per Project and the estate, which pins move, the lock, and what the workflow
// reports (spec/v1/55-delivery.md#notifications). Nothing here performs IO.
import { NODE_PROJECT } from "../model/node-agents.ts";
import {
  ESTATE_ARTIFACT,
  artifactRepositoryOf,
  retryPatches,
  versionPatches,
} from "../adapters/flux/source.ts";
import { blueGreen } from "../adapters/kubernetes/capacity.ts";
import type { Adapter } from "../adapters/registry.ts";
import { projectDirectory } from "../adapters/shared/paths.ts";
import type { CompositionLockDocument } from "../model/composition-lock.ts";
import type { Diagnostic, Result } from "../model/diagnostic.ts";
import type { FragmentManifest } from "../model/fragment.ts";
import type { Hasher } from "../model/hasher.ts";
import { brokenInvariant } from "../model/internal-failure.ts";
import {
  DEFAULT_MAX_AGE,
  type ParticipantsDocument,
} from "../model/participants.ts";
import type { PlatformIntentDocument } from "../model/platform-intent.ts";
import {
  PIN_ANNOTATIONS,
  type PinAnnotationsDocument,
} from "../model/pin-annotations.ts";
import {
  ROLLOUT_ENVIRONMENT,
  rolloutUrlOf,
  type Rollout,
} from "../model/rollout.ts";
import type { AuthoredFile } from "./check-intent-set.ts";
import {
  composedLock,
  IMAGES_LOCK,
  type Carrier,
} from "./images-lock-shares.ts";
import { aliasesOf, type ImagesLockDocument } from "../model/images-lock.ts";
import { parsePlatformIntent } from "./parse-platform-intent.ts";
import { parseProjectIntent } from "./parse-project-intent.ts";
import { pinSources, type PinSource } from "./pin-sources.ts";
import {
  renderResolvedSet,
  type RenderedFile,
  type Serializer,
} from "./render-intent-set.ts";
import { resolveIntentSet, type ResolvedSet } from "./resolve-intent-set.ts";
import type { RenderedObject } from "../objects/deliverable.ts";
import type { ResolvedProject } from "../model/resolution.ts";
import { readYaml } from "../read/yaml.ts";

/** One published fragment: its digest-named reference, its manifest and its files. */
export interface Fragment {
  readonly ref: string;
  readonly manifest: FragmentManifest;
  /** Every file the fragment holds, by its path inside the fragment. */
  readonly files: readonly AuthoredFile[];
}

/** What a Project's pin names: the content its artifact holds, and how a human holds it. */
export interface Pin {
  readonly contentHash: string;
  readonly annotations: PinAnnotationsDocument;
  /**
   * The release the pinned artifact labels its pods with, read from its unit's
   * index: `null` where it labels none, absent where the caller did not read it.
   * A Project's pin whose artifact labels none moves, so every pod a pin
   * applies says which release it runs.
   */
  readonly labelled?: string | null;
}

export interface ComposeInput {
  /**
   * The Platform document's fragment: the document, the node contract and,
   * where it carries one, an images lock. None where none was published.
   */
  readonly platform: Fragment | undefined;
  /** Every Project's newest fragment, each with its share of the images lock where it has one. */
  readonly fragments: readonly Fragment[];
  /** Who is expected to have published: `participants.yml` of the Estate repository. */
  readonly participants: ParticipantsDocument;
  /** When each newest fragment was published, by the project it declares, the platform's among them. */
  readonly published: Readonly<Record<string, string>>;
  /** Every earlier fragment a Rollback or the previous lock names, by reference. */
  readonly held: readonly Fragment[];
  /** The pin of every Project and of the estate that has been delivered, by artifact name. */
  readonly pins: Readonly<Record<string, Pin>>;
  /**
   * The pin source the Estate repository holds for each pinned artifact, by
   * artifact name, as committed. An artifact with none here is written a
   * source only when its pin moves.
   */
  readonly sources?: Readonly<Record<string, string>> | undefined;
  readonly clusterState: AuthoredFile;
  /** The previous lock, and the estate commit it was committed in; none before the first composition. */
  readonly previous?:
    | {
        readonly lock: CompositionLockDocument;
        readonly commit: string;
      }
    | undefined;
}

export interface ComposeOptions {
  readonly hash: Hasher;
  readonly serialize: Serializer;
  readonly schemaPackageIntegrity: string;
  /** The model version the toolkit writes, and the toolkit's own release. */
  readonly schemaVersion: string;
  readonly toolkitVersion: string;
  /** When this composition ran: the one clock reading, made by the caller. */
  readonly generatedAt: string;
  /** The adapters that render; the registered set unless a caller names another. */
  readonly adapters?: readonly Adapter[];
}

/** One artifact's files, the hash of what it holds, where it is published, and whether its pin moves. */
export interface ComposedArtifact {
  readonly name: string;
  readonly files: readonly RenderedFile[];
  readonly contentHash: string;
  /** The OCI repository it is published to, the one its pin source names. */
  readonly repository: string;
  readonly moves: boolean;
  /** The Rollout a Project's moving pin starts; the estate-scoped artifact is no Project's release. */
  readonly rollout?: Rollout;
}

/** A commit status on the commit that published a fragment. */
export interface CommitStatus {
  readonly repository: string;
  readonly sha: string;
  readonly state: "success" | "failure";
  readonly description: string;
}

/** A Project condition the workflow keeps one issue open for, and posts when it opens. */
export interface Condition {
  readonly project: string;
  readonly condition: "isolated" | "paused" | "rolled-back";
  readonly title: string;
  readonly body: string;
  readonly discord: string;
}

export interface Composition {
  readonly artifacts: readonly ComposedArtifact[];
  /**
   * The pin source of every artifact whose pin moves, a first delivery among
   * them, and of every artifact whose committed source no longer says what
   * composition derives: the file the Estate repository commits for it,
   * whole. One whose pin moves is committed at the moved digest; one whose
   * pin stays already names the digest it was committed at.
   */
  readonly sources: readonly PinSource[];
  /**
   * The committed pin sources the Estate repository removes, by path: the
   * estate-scoped artifact's, once that artifact holds nothing
   * (spec/v1/55-delivery.md#what-a-pin-source-holds), since a source that
   * stays would pin an artifact no composition publishes again.
   */
  readonly removedSources: readonly string[];
  /**
   * One Rollout per Project whose pin moves
   * (spec/v1/55-delivery.md#rollouts): what the composition workflow creates
   * each GitHub Deployment from.
   */
  readonly rollouts: readonly Rollout[];
  readonly lock: CompositionLockDocument;
  readonly statuses: readonly CommitStatus[];
  readonly conditions: readonly Condition[];
}

/** Where a fragment's files sit in the union: a Project's under its name, the platform's apart. */
const PLATFORM = "_platform";
const CLUSTER_STATE = "cluster-state.yml";
const PLATFORM_DOCUMENT = "platform.intent.yml";
const PROJECT_FILE = ".project.yml";

/** Why a Project stayed where it was; a participant that published nothing has no fragment to name. */
interface Isolation {
  readonly refused: Fragment | undefined;
  readonly codes: readonly string[];
  /** Why its fragment was written at a version the toolkit refuses, where it was. */
  readonly written?: string | undefined;
}

/** What holds a participant back before the union composes, and why. */
interface Standing {
  readonly code: string;
  readonly written?: string;
}

/**
 * Whether the toolkit reads the model version a fragment was written at: a
 * range, not equality (spec/v1/40-composition.md#versioning). Another major,
 * either way, or a newer minor is refused, since an older toolkit would drop
 * what it cannot read and exit zero; a patch never gates.
 */
function versionRefusal(written: string, toolkit: string): string | undefined {
  const [major, minor] = written.split(".").map(Number) as [number, number];
  const [ownMajor, ownMinor] = toolkit.split(".").map(Number) as [
    number,
    number,
  ];
  if (major !== ownMajor)
    return `written at ${written}, a different major than this toolkit's ${toolkit}`;
  return minor > ownMinor
    ? `written at ${written}, a newer minor than this toolkit's ${toolkit}`
    : undefined;
}

/** A composition whose Platform document is there to compose with. */
type Composing = ComposeInput & { readonly platform: Fragment };

/** Codes as a report names them. */
const named = (codes: readonly string[]): string => codes.join(", ");

const DAY_MS = 86_400_000;

/**
 * A record's own entry under `key`, and never one its prototype answers for:
 * a project may be named `constructor`, and a list that holds no such entry
 * must say so.
 */
const own = <T>(
  record: Readonly<Record<string, T>>,
  key: string,
): T | undefined => (Object.hasOwn(record, key) ? record[key] : undefined);

/**
 * Every project a fragment's own files declare: its project files', and the
 * Platform document's where it holds one. A file that does not parse declares
 * none here, and resolution reports it.
 */
function declaredBy({ files }: Fragment): string[] {
  return files.flatMap(({ name, text }) => {
    if (name.endsWith(PROJECT_FILE)) {
      const parsed = parseProjectIntent(text, []);
      return parsed.ok ? [parsed.value.effective.project] : [];
    }
    if (name !== PLATFORM_DOCUMENT) return [];
    const parsed = parsePlatformIntent(text);
    return parsed.ok ? [parsed.value.document.metadata.project] : [];
  });
}

/**
 * What the participants list says of one project's newest fragment, as the
 * code that holds it back, or nothing where it stands
 * (spec/v1/40-composition.md#participants). The list admits a project by
 * name, so a fragment is the participant its manifest names only where the
 * files it carries declare that project and no other: what composes is what
 * the files say.
 */
function standingOf(
  input: ComposeInput,
  options: Pick<ComposeOptions, "generatedAt" | "schemaVersion">,
  project: string,
  fragment: Fragment | undefined,
): Standing | undefined {
  const entry = own(input.participants.participants, project);
  if (entry === undefined) return { code: "E_PARTICIPANT_UNLISTED" };
  if (fragment === undefined) return { code: "E_PARTICIPANT_MISSING" };
  if (declaredBy(fragment).some((declared) => declared !== project))
    return { code: "E_PARTICIPANT_UNLISTED" };
  const version = versionRefusal(
    fragment.manifest.spec.schemaVersion,
    options.schemaVersion,
  );
  if (version !== undefined)
    return { code: "E_SCHEMA_VERSION_MISMATCH", written: version };
  // Dormant exempts a participant from its age, and from nothing else.
  if (entry.dormant === true) return undefined;
  const at = own(input.published, project);
  if (at === undefined)
    throw brokenInvariant(
      `${project}: a fragment whose publish time the caller did not supply`,
    );
  const days = Number((entry.maxAge ?? DEFAULT_MAX_AGE).slice(0, -1));
  return Date.parse(options.generatedAt) - Date.parse(at) > days * DAY_MS
    ? { code: "E_PARTICIPANT_STALE" }
    : undefined;
}

const PARTICIPANTS = "participants.yml";

/** What stops the run before anything composes: the list's own entries, and the platform's standing. */
function listRefusals(
  input: ComposeInput,
  options: ComposeOptions,
): Diagnostic[] {
  const platform = input.platform;
  const project = platform?.manifest.spec.project;
  const standing =
    project === undefined
      ? { code: "E_PARTICIPANT_MISSING" }
      : standingOf(input, options, project, platform);
  return [
    ...(standing === undefined
      ? []
      : [
          {
            code: standing.code,
            document: PARTICIPANTS,
            path: "/participants",
            message:
              project === undefined
                ? "the Platform document published no fragment"
                : `the Platform document's fragment, ${project}, cannot be composed with: ${standing.code}${standing.written === undefined ? "" : `: ${(platform as Fragment).ref} was ${standing.written}`}`,
            hint: "No render is composed without a current, listed Platform document: publish it, or correct its entry.",
          } as Diagnostic,
        ]),
  ];
}

/**
 * A fragment the union would compose that the toolkit cannot read: the one a
 * Project is held at, or a Rollback's. Nothing is left to hold it at, and
 * composing it would drop what the toolkit cannot read, so the run stops
 * (spec/v1/40-composition.md#versioning).
 */
function unreadable(
  candidates: ReadonlyMap<string, Fragment>,
  schemaVersion: string,
): Diagnostic[] {
  return [...candidates].flatMap(([project, fragment]) => {
    const written = versionRefusal(
      fragment.manifest.spec.schemaVersion,
      schemaVersion,
    );
    return written === undefined
      ? []
      : [
          {
            code: "E_SCHEMA_VERSION_MISMATCH",
            document: PARTICIPANTS,
            path: "/participants",
            message: `${project} can be composed only at ${fragment.ref}, which was ${written}`,
            hint: "Republish the fragment at a model version this toolkit reads, or compose with a toolkit that reads it.",
          },
        ];
  });
}

const placed = (directory: string, files: readonly AuthoredFile[]) =>
  files.map(({ name, text }) => ({ name: `${directory}/${name}`, text }));

/** The directory of the union a diagnostic's document sits in: a Project's, the platform's, or none. */
const directoryOf = ({ document }: Diagnostic): string | undefined =>
  document?.split("/")[0];

/** The documents a refusal rests on beside its own. */
// A missing list and an empty one involve nothing alike.
// Stryker disable next-line ArrayDeclaration
const involvedIn = ({ involves }: Diagnostic) => involves ?? [];

/** The Platform document a resolved set read: parsed already, so parsed again without refusal. */
function platformOf(fragment: Fragment): PlatformIntentDocument {
  const file = fragment.files.find(
    ({ name }) => name === PLATFORM_DOCUMENT,
  ) as AuthoredFile;
  return (
    parsePlatformIntent(file.text) as Extract<
      ReturnType<typeof parsePlatformIntent>,
      { readonly ok: true }
    >
  ).value.document;
}

/**
 * The one images lock resolution reads: the Platform document's, where its
 * fragment carries one, and every composed fragment's share, as one lock named
 * after the Platform document (spec/v1/40-composition.md#fragments). Each
 * document is handed over with the aliases it names, which are the document's
 * own: no env file decides one. A document that does not parse names none
 * here, and resolution reports it.
 */
function imagesLockOf(
  platform: Fragment,
  candidates: ReadonlyMap<string, Fragment>,
  previous: Readonly<Record<string, { readonly ref: string } | undefined>>,
  schemaVersion: string,
): Result<ImagesLockDocument> {
  const lockOf = (files: readonly AuthoredFile[]) =>
    files.find(({ name }) => name === IMAGES_LOCK);
  const projects = [...candidates].flatMap(([project, fragment]) =>
    fragment.files
      .filter(({ name }) => name.endsWith(PROJECT_FILE))
      .map(({ name, text }): Carrier => {
        const parsed = parseProjectIntent(text, []);
        return {
          directory: project,
          changed: fragment.ref !== previous[project]?.ref,
          document: `${project}/${name}`,
          names: parsed.ok ? aliasesOf(parsed.value.effective) : [],
          lock: lockOf(fragment.files),
        };
      }),
  );
  // The images the Platform document names itself: each engine's backup method.
  const named = platform.files
    .filter(({ name }) => name === PLATFORM_DOCUMENT)
    .flatMap(({ text }) => {
      const parsed = parsePlatformIntent(text);
      return parsed.ok
        ? Object.values(parsed.value.document.engines).map(
            ({ backup }) => backup,
          )
        : [];
    });
  return composedLock(
    {
      directory: PLATFORM,
      // The platform's lock is never the changed side of a disagreement: an
      // error that names it fails the run, as every platform error does.
      changed: false,
      document: `${PLATFORM}/${PLATFORM_DOCUMENT}`,
      names: named,
      lock: lockOf(platform.files),
    },
    projects,
    platform.manifest.spec.project,
    schemaVersion,
  );
}

/** A fragment by reference, which the caller owes for every reference it hands over. */
function heldAt(held: readonly Fragment[], ref: string): Fragment {
  const fragment = held.find((candidate) => candidate.ref === ref);
  if (fragment === undefined)
    throw brokenInvariant(`${ref}: a held fragment the caller did not supply`);
  return fragment;
}

// Codes, names and paths are each distinct within the list they sort, so `<=`
// would order the same list.
// Stryker disable next-line EqualityOperator
const byText = (a: string, b: string): number => (a < b ? -1 : 1);

export function composeEstate(
  input: ComposeInput,
  options: ComposeOptions,
): Result<Composition> {
  // A Platform document that is missing, stale or unlisted stops the run:
  // there is nothing to isolate.
  const refusals = listRefusals(input, options);
  return refusals.length > 0
    ? { ok: false, diagnostics: refusals }
    : composed(input as Composing, options);
}

function composed(
  input: Composing,
  options: ComposeOptions,
): Result<Composition> {
  const previous = input.previous?.lock.spec.fragments ?? {};
  const annotations = (project: string): PinAnnotationsDocument =>
    input.pins[project]?.annotations ?? {};
  const rollbackOf = (project: string): string | undefined =>
    (annotations(project) as Record<string, string>)[
      PIN_ANNOTATIONS.rollbackFragment
    ];

  // A Rollback composes its Project at the held fragment, and every other
  // Project at its newest. A Rollback takes no backup of its own: it relies on
  // the scheduled backups each volume's Durability Class derives
  // (spec/v1/55-delivery.md#pause-and-rollback).
  const candidates = new Map<string, Fragment>(
    input.fragments.map((fragment) => {
      const project = fragment.manifest.spec.project;
      const rollback = rollbackOf(project);
      return [
        project,
        rollback === undefined ? fragment : heldAt(input.held, rollback),
      ];
    }),
  );
  const isolated = new Map<string, Isolation>();

  // A participant's own standing holds it back, changed or not: at the
  // fragment it last composed at where it has one, and out of the render where
  // it has none or the list does not name it.
  const expected = Object.keys(input.participants.participants).filter(
    (project) => project !== input.platform.manifest.spec.project,
  );
  const newest = new Map(
    input.fragments.map((fragment) => [
      fragment.manifest.spec.project,
      fragment,
    ]),
  );
  for (const project of [...new Set([...expected, ...newest.keys()])]) {
    const fragment = newest.get(project);
    const standing = standingOf(input, options, project, fragment);
    if (standing === undefined) continue;
    const { code, written } = standing;
    isolated.set(project, { refused: fragment, codes: [code], written });
    const earlier = previous[project]?.ref;
    if (code === "E_PARTICIPANT_UNLISTED" || earlier === undefined)
      candidates.delete(project);
    else
      candidates.set(
        project,
        // A stale fragment is very often the one last composed at.
        fragment?.ref === earlier ? fragment : heldAt(input.held, earlier),
      );
  }

  for (;;) {
    const stops = unreadable(candidates, options.schemaVersion);
    if (stops.length > 0) return { ok: false, diagnostics: stops };
    const files = [
      ...placed(PLATFORM, input.platform.files),
      { name: `${PLATFORM}/${CLUSTER_STATE}`, text: input.clusterState.text },
      ...[...candidates].flatMap(([project, { files }]) =>
        placed(project, files),
      ),
    ];
    const lock = imagesLockOf(
      input.platform,
      candidates,
      previous,
      options.schemaVersion,
    );
    const resolved = lock.ok
      ? resolveIntentSet(files, { ...options, imagesLock: lock.value })
      : lock;
    const outcome = resolved.ok
      ? deliver(input, resolved.value, options)
      : resolved;
    if (outcome.ok)
      return {
        ok: true,
        value: composition(input, options, candidates, isolated, outcome.value),
      };
    const refusals = outcome.diagnostics;

    // What changed is what is isolated: an error that names no changed
    // fragment, or names the platform or nothing at all, fails the run.
    const blamed = new Map<string, Diagnostic[]>();
    const changed = (project: string | undefined): boolean => {
      // A map holds no candidate under no key.
      const candidate = candidates.get(project as string);
      return (
        candidate !== undefined &&
        candidate.ref !== previous[project as string]?.ref
      );
    };
    // A refusal at an unchanged fragment is blamed on the changed fragments
    // its own refusals rest on: a provider that dropped what it named is the
    // change, and the consumer only reports it
    // (spec/v1/40-composition.md#a-refused-project-is-isolated).
    const causes = (project: string | undefined): string[] => {
      const involved = refusals
        .filter((diagnostic) => directoryOf(diagnostic) === project)
        .flatMap(involvedIn)
        .map((document) => document.split("/")[0] as string);
      // Only a change can refuse an unchanged fragment, so every fragment
      // such a refusal involves has changed and the filter removes nothing a
      // reachable set holds; it stays so an unchanged fragment is never blamed.
      // Stryker disable next-line MethodExpression
      return [...new Set(involved.filter(changed))];
    };
    for (const diagnostic of refusals) {
      // The platform's directory, and no directory at all, hold no candidate.
      // A map holds no candidate under no key, so a diagnostic naming no
      // document finds none.
      const project = directoryOf(diagnostic);
      const culprits = changed(project) ? [project as string] : causes(project);
      if (culprits.length === 0) return { ok: false, diagnostics: refusals };
      for (const culprit of culprits)
        blamed.set(culprit, [...(blamed.get(culprit) ?? []), diagnostic]);
    }
    for (const [project, diagnostics] of blamed) {
      isolated.set(project, {
        refused: candidates.get(project),
        codes: [...new Set(diagnostics.map(({ code }) => code))],
      });
      // A Project that has never composed has nothing to stay at, and is left out.
      const earlier = previous[project]?.ref;
      if (earlier === undefined) candidates.delete(project);
      else candidates.set(project, heldAt(input.held, earlier));
    }
  }
}

/** What a resolved union delivers, and what it was composed from. */
interface Delivered {
  readonly artifacts: readonly {
    readonly name: string;
    readonly files: readonly RenderedFile[];
  }[];
  readonly projects: ResolvedSet["projects"];
  readonly cluster: string;
}

/**
 * A resolved union rendered for the Projects the ledger hands to the estate
 * path; a legacy one is composed and checked, never published
 * (spec/v1/60-setup.md#handing-over-one-project-at-a-time). Routes flip with
 * the edge's own handover: while a Project that declares a tier's proxy is
 * legacy, the old path's Traefik serves the edge, so no Project's share carries
 * a route, which would be a second source for it.
 */
function deliver(
  input: Composing,
  resolved: ResolvedSet,
  options: ComposeOptions,
): Result<Delivered> {
  // A resolved set holds a Platform document that parsed.
  const platform = platformOf(input.platform);
  const ledger = platform.handover;
  const rendered = renderResolvedSet(resolved, {
    ...options,
    routes: !platform.tiers.some(({ traefik }) =>
      // A missing legacy list and an empty one hold no edge alike.
      // Stryker disable next-line ArrayDeclaration
      (ledger?.legacy ?? []).includes(traefik.slice(0, traefik.indexOf("/"))),
    ),
    // The Node Agents' Project declares nothing, so no fragment names it:
    // every node runs an agent, so it is always the estate's, and the ledger
    // hands it over like any other.
    projects: [
      ...resolved.projects.map(({ project }) => project),
      NODE_PROJECT,
    ].filter(
      (project) =>
        ledger === undefined || ledger.estate?.includes(project) === true,
    ),
  });
  return rendered.ok
    ? {
        ok: true,
        value: {
          artifacts: rendered.value,
          projects: resolved.projects,
          cluster: platform.metadata.cluster,
        },
      }
    : rendered;
}

/**
 * A Project's share with `patches` added to its unit's index, after any it
 * already carries; a share given none is the share as rendered.
 */
function patchedFiles(
  files: readonly RenderedFile[],
  project: string,
  patches: readonly unknown[],
  serialize: Serializer,
): readonly RenderedFile[] {
  if (patches.length === 0) return files;
  const index = `${projectDirectory(project)}/kustomization.yaml`;
  return files.map((file) => {
    if (file.path !== index) return file;
    const read = readYaml(file.text);
    // The serializer wrote the index a moment ago, so it always reads back.
    // Stryker disable ConditionalExpression,StringLiteral
    if (!read.ok)
      throw brokenInvariant(
        `${index}: the render wrote an index it cannot read`,
      );
    // Stryker restore ConditionalExpression,StringLiteral
    const fields = read.value as Record<string, unknown>;
    const carried = (fields["patches"] ?? []) as readonly unknown[];
    const patched = {
      ...fields,
      patches: [...carried, ...patches],
    } as unknown as RenderedObject;
    return { ...file, text: serialize([patched], file.path) };
  });
}

/**
 * A Project's share as it is hashed: where its pin records a Retry, its unit's
 * index annotates the pod template of every gated Process's Deployment with
 * when the Retry ran (spec/v1/55-delivery.md#pause-and-rollback). The Retry is
 * part of what the share holds, so a Retry alone moves the pin, and a pin that
 * keeps it moves for nothing else.
 */
function retriedFiles(
  files: readonly RenderedFile[],
  project: ResolvedProject | undefined,
  pin: Pin | undefined,
  serialize: Serializer,
): readonly RenderedFile[] {
  const retriedAt = pin?.annotations[PIN_ANNOTATIONS.retriedAt];
  if (project === undefined || retriedAt === undefined) return files;
  // In the order the Project declares them, which no pull order changes.
  const gated = project.applications.flatMap(({ namespace, processes }) =>
    processes.filter(blueGreen).map(({ name }) => ({ namespace, name })),
  );
  return patchedFiles(
    files,
    project.project,
    retryPatches(retriedAt, gated),
    serialize,
  );
}

/**
 * A moving Project's artifact as it is published: its share of the rendered
 * tree, with its unit's index patched to label every pod it applies with the
 * release the pin moves to (spec/v1/55-delivery.md#rendered-artifacts-and-pins).
 * The label travels inside the artifact, so the one fetch that brings the new
 * image brings the label with it; written on the pin source instead, Flux could
 * apply the old artifact under the new label first. The content hash still
 * covers the share alone, so a release that renders nothing new moves no pin.
 */
const releasedFiles = (
  files: readonly RenderedFile[],
  project: string,
  version: string,
  serialize: Serializer,
): readonly RenderedFile[] =>
  patchedFiles(files, project, versionPatches(version), serialize);

function composition(
  input: Composing,
  options: ComposeOptions,
  candidates: ReadonlyMap<string, Fragment>,
  isolated: ReadonlyMap<string, Isolation>,
  { artifacts: rendered, projects, cluster }: Delivered,
): Composition {
  const { hash } = options;
  const held = (name: string, annotation: string): boolean =>
    annotation in (input.pins[name]?.annotations ?? {});
  const published = platformOf(input.platform).bootstrap.flux.artifacts;
  const artifacts = rendered.map(({ name, files: share }): ComposedArtifact => {
    const resolved = projects.find(({ project }) => project === name);
    const pin = input.pins[name];
    const files = retriedFiles(share, resolved, pin, options.serialize);
    const contentHash = hash(files.map(({ path, text }) => ({ path, text })));
    // A Project's artifact is rendered from the fragment it composed at,
    // which is the release its pin moves to.
    const released = candidates.get(name)?.manifest;
    // An unchanged render publishes nothing, save where the pinned artifact
    // labels no release, and a paused Project moves no pin, save to the
    // release a Rollback composed it at.
    const unlabelled = released !== undefined && pin?.labelled === null;
    const moves =
      (!held(name, PIN_ANNOTATIONS.pausedBy) ||
        held(name, PIN_ANNOTATIONS.rollbackFragment)) &&
      (pin?.contentHash !== contentHash || unlabelled);
    const url = resolved === undefined ? undefined : rolloutUrlOf(resolved);
    // The estate-scoped artifact is no fragment's, so it carries no release.
    const labelled = moves && released !== undefined;
    return {
      name,
      files: labelled
        ? releasedFiles(files, name, released.spec.version, options.serialize)
        : files,
      contentHash,
      repository: artifactRepositoryOf(published.repository, name),
      moves,
      ...(moves && released !== undefined
        ? {
            rollout: {
              project: name,
              repository: released.metadata.repository,
              sha: released.metadata.sourceSha,
              environment: ROLLOUT_ENVIRONMENT,
              version: released.spec.version,
              ...(url === undefined ? {} : { url }),
            },
          }
        : {}),
    };
  });

  const locked = (fragment: Fragment, revisions: Record<string, string>) => ({
    ref: fragment.ref,
    project: fragment.manifest.spec.project,
    repository: fragment.manifest.metadata.repository,
    schemaVersion: fragment.manifest.spec.schemaVersion,
    version: fragment.manifest.spec.version,
    revisions,
    sourceSha: fragment.manifest.metadata.sourceSha,
    inputsSha: fragment.manifest.spec.inputsSha,
  });
  type Locked = ReturnType<typeof locked>;
  const entries: [string, Locked][] = [
    [input.platform.manifest.spec.project, locked(input.platform, {})],
    ...projects.map(({ project, applications }): [string, Locked] => [
      project,
      locked(
        candidates.get(project) as Fragment,
        Object.fromEntries(
          applications.map(({ id, revision }) => [id, revision]),
        ),
      ),
    ]),
  ];
  // Composition is order-independent, so nothing it writes follows pull order.
  const fragments = Object.fromEntries(
    entries.sort(([a], [b]) => byText(a, b)),
  );
  const previous = input.previous;
  const lock: CompositionLockDocument = {
    apiVersion: "resolved.jorisjonkers.dev/v1",
    kind: "CompositionLock",
    metadata: {
      cluster,
      generatedAt: options.generatedAt,
    },
    spec: {
      schemaVersion: options.schemaVersion,
      toolkitVersion: options.toolkitVersion,
      composedDigest: hash(
        artifacts.map(({ name, contentHash }) => ({ name, contentHash })),
      ),
      ...(previous === undefined
        ? { lockChain: [] }
        : {
            previousLockDigest: hash(previous.lock),
            lockChain: [
              ...previous.lock.spec.lockChain,
              {
                digest: hash(previous.lock),
                commit: previous.commit,
                timestamp: previous.lock.metadata.generatedAt,
              },
            ],
          }),
      fragments,
      ...(isolated.size === 0
        ? {}
        : {
            isolated: Object.fromEntries(
              [...isolated]
                .sort(([a], [b]) => byText(a, b))
                .map(([project, { refused, codes }]) => [
                  project,
                  {
                    ...(refused === undefined ? {} : { refused: refused.ref }),
                    codes: [...codes],
                  },
                ]),
            ),
          }),
      clusterStateDigest: hash(input.clusterState.text),
    },
  };

  return {
    artifacts,
    // Rewritten whenever the pin moves, so a unit an artifact gains is
    // applied, and whenever what the Platform document or the unit DAG says
    // of it changes, keeping what a Pause, a Rollback or a Retry recorded on the pin.
    sources: pinSources(
      artifacts.filter(({ moves }) => moves),
      rendered,
      projects,
      platformOf(input.platform),
      options.serialize,
      Object.fromEntries(
        Object.entries(input.pins).map(([name, { annotations }]) => [
          name,
          annotations as Readonly<Record<string, string>>,
        ]),
      ),
      new Set(Object.keys(input.pins)),
      input.sources,
    ),
    removedSources:
      input.sources?.[ESTATE_ARTIFACT] !== undefined &&
      !rendered.some(({ name }) => name === ESTATE_ARTIFACT)
        ? [`projects/${ESTATE_ARTIFACT}/source.yaml`]
        : [],
    rollouts: artifacts.flatMap(({ rollout }) => rollout ?? []),
    lock,
    statuses: statusesOf(input, isolated),
    conditions: conditionsOf(input, isolated),
  };
}

/** Whether each newest fragment composed, on the commit that published it. */
function statusesOf(
  input: Composing,
  isolated: ReadonlyMap<string, Isolation>,
): CommitStatus[] {
  return [input.platform, ...input.fragments]
    .sort((a, b) => byText(a.manifest.spec.project, b.manifest.spec.project))
    .map((fragment) => {
      const { project, version } = fragment.manifest.spec;
      const { repository, sourceSha: sha } = fragment.manifest.metadata;
      const refusal = isolated.get(project);
      // A participant isolated with no fragment published none, so it is
      // never one of the fragments walked here.
      // Stryker disable next-line OptionalChaining
      if (refusal?.refused?.ref === fragment.ref)
        return {
          repository,
          sha,
          state: "failure",
          description: `${project} ${version} isolated: ${named(refusal.codes)}`,
        };
      const rollback = (input.pins[project]?.annotations ?? {}) as Record<
        string,
        string
      >;
      const target = rollback[PIN_ANNOTATIONS.rollbackVersion];
      return {
        repository,
        sha,
        state: "success",
        description:
          target === undefined
            ? `${project} ${version} composed`
            : `${project} ${version} held: rolled back to ${target}`,
      };
    });
}

/** Every Project condition that holds after this composition, one per pair. */
function conditionsOf(
  input: Composing,
  isolated: ReadonlyMap<string, Isolation>,
): Condition[] {
  const conditions: Condition[] = [...isolated]
    .sort(([a], [b]) => byText(a, b))
    .map(([project, { refused, codes, written }]): Condition => {
      if (refused === undefined)
        return {
          project,
          condition: "isolated",
          title: `${project}: no fragment published`,
          body: `The participants list expects ${project}, and it published no fragment: ${named(codes)}. ${project} stays at the fragment it last composed at, and its pin does not move until a release composes.`,
          discord: `${project} published no fragment: ${named(codes)}`,
        };
      const { version } = refused.manifest.spec;
      return {
        project,
        condition: "isolated",
        title: `${project}: ${version} isolated`,
        body: `The fragment ${refused.ref} was refused with ${named(codes)}${written === undefined ? "" : `: it was ${written}`}. ${project} stays at the fragment it last composed at, and its pin does not move until a release composes.`,
        discord: `${project} ${version} isolated: ${named(codes)}`,
      };
    });
  for (const project of Object.keys(input.pins).sort(byText)) {
    const held = (input.pins[project] as Pin).annotations as Record<
      string,
      string
    >;
    const by = held[PIN_ANNOTATIONS.pausedBy];
    if (by === undefined) continue;
    const at = held[PIN_ANNOTATIONS.pausedAt] as string;
    const reason = held[PIN_ANNOTATIONS.pausedReason] as string;
    const target = held[PIN_ANNOTATIONS.rollbackVersion];
    conditions.push(
      target === undefined
        ? {
            project,
            condition: "paused",
            title: `${project}: paused`,
            body: `Paused by ${by} at ${at}: ${reason}. Composition checks its newest fragment and moves no pin until it is resumed.`,
            discord: `${project} paused by ${by}: ${reason}`,
          }
        : {
            project,
            condition: "rolled-back",
            title: `${project}: rolled back to ${target}`,
            body: `Rolled back to ${target} by ${by} at ${at}: ${reason}. It is composed at that release's fragment, and its pin moves to no newer release until it is resumed.`,
            discord: `${project} rolled back to ${target} by ${by}: ${reason}`,
          },
    );
  }
  return conditions;
}
