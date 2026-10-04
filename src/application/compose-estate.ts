// Composing the estate (spec/v1/40-composition.md#the-composition-run): every
// Project's newest Intent Fragment, the Platform document's and the ClusterState
// snapshot, resolved and rendered as one union. An error refuses the fragments
// it names, not the run: a changed fragment it names is isolated at the
// fragment the previous lock recorded for its Project, and the union is
// composed again, until no error names a changed fragment
// (spec/v1/40-composition.md#a-refused-project-is-isolated). A Pause holds a
// Project's pin, and a Rollback composes it at its held fragment
// (spec/v1/55-delivery.md#pause-and-rollback). What comes out is one artifact
// per Project and the estate, which pins move, the lock, and what the workflow
// reports (spec/v1/55-delivery.md#notifications). Nothing here performs IO.
import type { Adapter } from "../adapters/registry.ts";
import type { CompositionLockDocument } from "../model/composition-lock.ts";
import type { Diagnostic, Result } from "../model/diagnostic.ts";
import type { FragmentManifest } from "../model/fragment.ts";
import type { Hasher } from "../model/hasher.ts";
import { brokenInvariant } from "../model/internal-failure.ts";
import type { PlatformIntentDocument } from "../model/platform-intent.ts";
import {
  PIN_ANNOTATIONS,
  type PinAnnotationsDocument,
} from "../model/pin-annotations.ts";
import type { AuthoredFile } from "./check-intent-set.ts";
import {
  composedLock,
  IMAGES_LOCK,
  type Carrier,
} from "./images-lock-shares.ts";
import { aliasesOf, type ImagesLockDocument } from "../model/images-lock.ts";
import { parsePlatformIntent } from "./parse-platform-intent.ts";
import { parseProjectIntent } from "./parse-project-intent.ts";
import {
  renderResolvedSet,
  type RenderedFile,
  type Serializer,
} from "./render-intent-set.ts";
import { resolveIntentSet, type ResolvedSet } from "./resolve-intent-set.ts";

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
}

export interface ComposeInput {
  /** The Platform document's fragment: the document, the node contract and, where it carries one, an images lock. */
  readonly platform: Fragment;
  /** Every Project's newest fragment, each with its share of the images lock where it has one. */
  readonly fragments: readonly Fragment[];
  /** Every earlier fragment a Rollback or the previous lock names, by reference. */
  readonly held: readonly Fragment[];
  /** The pin of every Project and of the estate that has been delivered, by artifact name. */
  readonly pins: Readonly<Record<string, Pin>>;
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

/** One artifact's files, the hash of what it holds, and whether its pin moves. */
export interface ComposedArtifact {
  readonly name: string;
  readonly files: readonly RenderedFile[];
  readonly contentHash: string;
  readonly moves: boolean;
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
  readonly lock: CompositionLockDocument;
  readonly statuses: readonly CommitStatus[];
  readonly conditions: readonly Condition[];
}

/** Where a fragment's files sit in the union: a Project's under its name, the platform's apart. */
const PLATFORM = "_platform";
const ESTATE = "_estate";
const CLUSTER_STATE = "cluster-state.yml";
const PLATFORM_DOCUMENT = "platform.intent.yml";

interface Isolation {
  readonly refused: Fragment;
  readonly codes: readonly string[];
}

const placed = (directory: string, files: readonly AuthoredFile[]) =>
  files.map(({ name, text }) => ({ name: `${directory}/${name}`, text }));

/** The directory of the union a diagnostic's document sits in: a Project's, the platform's, or none. */
const directoryOf = ({ document }: Diagnostic): string | undefined =>
  document?.split("/")[0];

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

const PROJECT_FILE = ".project.yml";

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
  const previous = input.previous?.lock.spec.fragments ?? {};
  const annotations = (project: string): PinAnnotationsDocument =>
    input.pins[project]?.annotations ?? {};
  const rollbackOf = (project: string): string | undefined =>
    (annotations(project) as Record<string, string>)[
      PIN_ANNOTATIONS.rollbackFragment
    ];

  // A Rollback composes its Project at the held fragment; every other Project
  // at its newest.
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

  for (;;) {
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
    for (const diagnostic of refusals) {
      // The platform's directory, and no directory at all, hold no candidate.
      // A map holds no candidate under no key, so a diagnostic naming no
      // document finds none.
      const project = directoryOf(diagnostic) as string;
      const candidate = candidates.get(project);
      if (candidate === undefined || candidate.ref === previous[project]?.ref)
        return { ok: false, diagnostics: refusals };
      blamed.set(project, [...(blamed.get(project) ?? []), diagnostic]);
    }
    for (const [project, diagnostics] of blamed) {
      isolated.set(project, {
        refused: candidates.get(project) as Fragment,
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
 * (spec/v1/60-setup.md#handing-over-one-project-at-a-time). The estate-scoped
 * artifact waits until no Project is legacy.
 */
function deliver(
  input: ComposeInput,
  resolved: ResolvedSet,
  options: ComposeOptions,
): Result<Delivered> {
  // A resolved set holds a Platform document that parsed.
  const platform = platformOf(input.platform);
  const ledger = platform.handover;
  const rendered = renderResolvedSet(resolved, {
    ...options,
    projects: resolved.projects
      .map(({ project }) => project)
      .filter(
        (project) =>
          ledger === undefined || ledger.estate?.includes(project) === true,
      ),
  });
  return rendered.ok
    ? {
        ok: true,
        value: {
          artifacts: rendered.value.filter(
            // A ledger with no legacy Project delivers the machinery too, which
            // no adapter renders yet (JorisJonkers-dev/deploy-kit#202), so no
            // composition can deliver the estate-scoped artifact before then.
            // Stryker disable next-line ConditionalExpression,OptionalChaining
            ({ name }) => name !== ESTATE || ledger?.legacy === undefined,
          ),
          projects: resolved.projects,
          cluster: platform.metadata.cluster,
        },
      }
    : rendered;
}

function composition(
  input: ComposeInput,
  options: ComposeOptions,
  candidates: ReadonlyMap<string, Fragment>,
  isolated: ReadonlyMap<string, Isolation>,
  { artifacts: rendered, projects, cluster }: Delivered,
): Composition {
  const { hash } = options;
  const paused = (name: string): boolean =>
    PIN_ANNOTATIONS.pausedBy in (input.pins[name]?.annotations ?? {});
  const artifacts = rendered.map(({ name, files }): ComposedArtifact => {
    const contentHash = hash(files.map(({ path, text }) => ({ path, text })));
    return {
      name,
      files,
      contentHash,
      // An unchanged render publishes nothing, and a held Project moves no pin.
      moves: !paused(name) && input.pins[name]?.contentHash !== contentHash,
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
              [...isolated].map(([project, { refused, codes }]) => [
                project,
                { refused: refused.ref, codes: [...codes] },
              ]),
            ),
          }),
      clusterStateDigest: hash(input.clusterState.text),
    },
  };

  return {
    artifacts,
    lock,
    statuses: statusesOf(input, isolated),
    conditions: conditionsOf(input, isolated),
  };
}

/** Whether each newest fragment composed, on the commit that published it. */
function statusesOf(
  input: ComposeInput,
  isolated: ReadonlyMap<string, Isolation>,
): CommitStatus[] {
  return [input.platform, ...input.fragments]
    .sort((a, b) => byText(a.manifest.spec.project, b.manifest.spec.project))
    .map((fragment) => {
      const { project, version } = fragment.manifest.spec;
      const { repository, sourceSha: sha } = fragment.manifest.metadata;
      const refusal = isolated.get(project);
      if (refusal?.refused.ref === fragment.ref)
        return {
          repository,
          sha,
          state: "failure",
          description: `${project} ${version} isolated: ${refusal.codes.join(", ")}`,
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
  input: ComposeInput,
  isolated: ReadonlyMap<string, Isolation>,
): Condition[] {
  const conditions: Condition[] = [...isolated]
    .sort(([a], [b]) => byText(a, b))
    .map(([project, { refused, codes }]) => {
      const { version } = refused.manifest.spec;
      return {
        project,
        condition: "isolated",
        title: `${project}: ${version} isolated`,
        body: `The fragment ${refused.ref} was refused with ${codes.join(", ")}. ${project} stays at the fragment it last composed at, and its pin does not move until a release composes.`,
        discord: `${project} ${version} isolated: ${codes.join(", ")}`,
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
            body: `Rolled back to ${target} by ${by} at ${at}: ${reason}. It is composed at that release's fragment and moves no pin until it is resumed.`,
            discord: `${project} rolled back to ${target} by ${by}: ${reason}`,
          },
    );
  }
  return conditions;
}
