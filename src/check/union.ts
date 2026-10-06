// The invariants every fragment answers over the composed union
// (spec/v1/40-composition.md#the-estate-wide-invariants), as an enumerable
// registry. Identity is answered by any set of project files; a reference
// resolves against the Platform document's providers as well as the union, so
// it is answered only beside one. Every collision is refused at each of its
// sides, so the same set yields the same refusals in any order, and the
// fragment that introduced one is the one isolated
// (spec/v1/40-composition.md#a-refused-project-is-isolated).
import type { Diagnostic, RefusalCode } from "../model/diagnostic.ts";
import type { PlatformIntentDocument } from "../model/platform-intent.ts";
import type {
  DependencyEdge,
  ProjectIntentDocument,
} from "../model/project-intent.ts";

export interface Fragment {
  readonly name: string;
  readonly document: ProjectIntentDocument;
}

type Application = ProjectIntentDocument["applications"][number];
type Process = Application["processes"][number];

/** Something as written, and where: the fragment and the pointer into it. */
interface Placed<T> {
  readonly document: string;
  readonly path: string;
  readonly value: T;
}

/** An invariant, answered by project files alone, or only beside the Platform document. */
export type Invariant =
  | {
      readonly code: RefusalCode;
      /** Answered by project files alone. */
      readonly needsPlatform: false;
      readonly answer: (union: readonly Fragment[]) => Diagnostic[];
    }
  | {
      readonly code: RefusalCode;
      /** Answered only beside the Platform document, whose providers it reads. */
      readonly needsPlatform: true;
      readonly answer: (
        union: readonly Fragment[],
        platform: PlatformIntentDocument,
      ) => Diagnostic[];
    };

/** Every item some other item shares a key with. */
function collisions<T>(items: readonly T[], keyOf: (item: T) => string): T[] {
  const counts = new Map<string, number>();
  for (const item of items)
    counts.set(keyOf(item), (counts.get(keyOf(item)) ?? 0) + 1);
  return items.filter((item) => (counts.get(keyOf(item)) as number) > 1);
}

const applicationsOf = ({ name, document }: Fragment): Placed<Application>[] =>
  document.applications.map((value, a) => ({
    document: name,
    path: `/applications/${String(a)}`,
    value,
  }));

const processesOf = (fragment: Fragment): Placed<Process>[] =>
  applicationsOf(fragment).flatMap(({ document, path, value }) =>
    value.processes.map((process, p) => ({
      document,
      path: `${path}/processes/${String(p)}`,
      value: process,
    })),
  );

type Exposure = NonNullable<Application["exposure"]>[number];

const exposuresOf = (application: Placed<Application>): Placed<Exposure>[] =>
  // Stryker disable next-line ArrayDeclaration: an Application with no
  // exposure and one with an empty list expose nothing alike.
  (application.value.exposure ?? []).map((value, e) => ({
    document: application.document,
    path: `${application.path}/exposure/${String(e)}`,
    value,
  }));

/** An edge as written, and every Process that holds it: a level's edge is held by every Process below it. */
interface Held {
  readonly edge: DependencyEdge;
  readonly holders: readonly Process[];
}

function edgesOf(fragment: Fragment): Placed<Held>[] {
  const { name, document } = fragment;
  const placed = (
    edges: readonly DependencyEdge[] | undefined,
    at: string,
    holders: readonly Process[],
  ): Placed<Held>[] =>
    // Stryker disable next-line ArrayDeclaration: a level with no edge and
    // one with an empty list hold nothing alike.
    (edges ?? []).map((edge, e) => ({
      document: name,
      path: `${at}/dependsOn/${String(e)}`,
      value: { edge, holders },
    }));
  return [
    ...placed(
      document.dependsOn,
      "",
      document.applications.flatMap(({ processes }) => processes),
    ),
    ...applicationsOf(fragment).flatMap((application) => [
      ...placed(
        application.value.dependsOn,
        application.path,
        application.value.processes,
      ),
      ...application.value.processes.flatMap((process, p) =>
        placed(
          process.dependsOn,
          `${application.path}/processes/${String(p)}`,
          [process],
        ),
      ),
    ]),
  ];
}

const refusal = (
  code: RefusalCode,
  { document, path }: Placed<unknown>,
  at: string,
  message: string,
  hint: string,
): Diagnostic => ({ code, document, path: `${path}${at}`, message, hint });

/** The Processes of the union that provide `surface` under the Application id `application`. */
const providing = (
  union: readonly Fragment[],
  { application, surface }: DependencyEdge,
): { readonly project: string; readonly process: Process }[] =>
  union.flatMap(({ document }) =>
    document.applications
      .filter(({ id }) => id === application)
      .flatMap(({ processes }) =>
        processes
          .filter(({ provides }) => provides?.[surface] !== undefined)
          .map((process) => ({ project: document.project, process })),
      ),
  );

const keyOf = (project: string, process: Process): string =>
  `${project}/${process.name}`;

/** Every edge that lies on a cycle of required edges between Processes. */
function cyclic(union: readonly Fragment[]): Placed<Held>[] {
  const arcs: { from: string; to: string; edge: Placed<Held> }[] = [];
  for (const fragment of union)
    for (const placed of edgesOf(fragment))
      if (placed.value.edge.required !== false)
        for (const holder of placed.value.holders)
          for (const { project, process } of providing(
            union,
            placed.value.edge,
          ))
            arcs.push({
              from: keyOf(fragment.document.project, holder),
              to: keyOf(project, process),
              edge: placed,
            });
  const reaches = (from: string, to: string): boolean => {
    const seen = new Set<string>([from]);
    const queue = [from];
    for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
      if (next === to) return true;
      for (const arc of arcs)
        if (arc.from === next && !seen.has(arc.to)) {
          seen.add(arc.to);
          queue.push(arc.to);
        }
    }
    return false;
  };
  const onCycle = arcs.filter(({ from, to }) => reaches(to, from));
  // An edge held by several Processes is refused once, where it is written.
  const written = new Map<string, Placed<Held>>();
  for (const { edge } of onCycle)
    written.set(`${edge.document}#${edge.path}`, edge);
  return [...written.values()];
}

export const INVARIANTS: readonly Invariant[] = [
  {
    code: "E_DUPLICATE_PROJECT",
    needsPlatform: false,
    answer: (union) =>
      collisions(union, ({ document }) => document.project).map(
        ({ name, document }) => ({
          code: "E_DUPLICATE_PROJECT",
          document: name,
          path: "/project",
          message: `more than one fragment declares the project ${document.project}`,
          hint: "A project sits in exactly one repository: rename one of them, or merge the two files.",
        }),
      ),
  },
  {
    code: "E_DUPLICATE_APPLICATION_ID",
    needsPlatform: false,
    answer: (union) =>
      collisions(union.flatMap(applicationsOf), ({ value }) => value.id).map(
        (application) =>
          refusal(
            "E_DUPLICATE_APPLICATION_ID",
            application,
            "/id",
            `more than one Application carries the id ${application.value.id}, so an edge to it names none of them`,
            "Application ids are unique across the estate: rename one of them.",
          ),
      ),
  },
  {
    code: "E_DUPLICATE_PROCESS_NAME",
    needsPlatform: false,
    answer: (union) =>
      union.flatMap((fragment) =>
        collisions(processesOf(fragment), ({ value }) => value.name).map(
          (process) =>
            refusal(
              "E_DUPLICATE_PROCESS_NAME",
              process,
              "/name",
              `more than one Process of project ${fragment.document.project} is named ${process.value.name}, and the name is its identity in the namespace`,
              "Process names are unique within their project: rename one of them.",
            ),
        ),
      ),
  },
  {
    code: "E_DUPLICATE_EXPOSURE_NAME",
    needsPlatform: false,
    answer: (union) =>
      union
        .flatMap(applicationsOf)
        .flatMap((application) =>
          collisions(exposuresOf(application), ({ value }) => value.name).map(
            (exposure) =>
              refusal(
                "E_DUPLICATE_EXPOSURE_NAME",
                exposure,
                "/name",
                `more than one exposure of ${application.value.id} is named ${exposure.value.name}`,
                "Exposure names are unique within their Application: rename one of them.",
              ),
          ),
        ),
  },
  {
    code: "E_DUPLICATE_HOST",
    needsPlatform: false,
    answer: (union) =>
      collisions(
        union.flatMap(applicationsOf).flatMap(exposuresOf),
        ({ value }) => value.host,
      ).map((exposure) =>
        refusal(
          "E_DUPLICATE_HOST",
          exposure,
          "/host",
          `more than one exposure claims the host ${exposure.value.host}`,
          "A host is unique across the estate: route the paths of one host from one exposure, or choose another host.",
        ),
      ),
  },
  {
    code: "E_UNRESOLVED_APPLICATION",
    needsPlatform: true,
    answer: (union, platform) =>
      union.flatMap(edgesOf).flatMap((placed) => {
        const { application } = placed.value.edge;
        const declared =
          union.some(({ document }) =>
            document.applications.some(({ id }) => id === application),
          ) || platform.providers?.some(({ name }) => name === application);
        return declared === true
          ? []
          : [
              refusal(
                "E_UNRESOLVED_APPLICATION",
                placed,
                "/application",
                `no fragment declares an Application ${application}, and the platform names no provider of that name`,
                "Name an Application a fragment declares, or a provider the Platform document lists.",
              ),
            ];
      }),
  },
  {
    code: "E_UNKNOWN_SURFACE",
    needsPlatform: true,
    answer: (union, platform) =>
      union.flatMap(edgesOf).flatMap((placed) => {
        const { edge } = placed.value;
        const declared = union.some(({ document }) =>
          document.applications.some(({ id }) => id === edge.application),
        );
        const provider = platform.providers?.find(
          ({ name }) => name === edge.application,
        );
        const known =
          providing(union, edge).length > 0 ||
          (provider !== undefined &&
            Object.hasOwn(provider.surfaces, edge.surface));
        // An Application nothing declares is E_UNRESOLVED_APPLICATION's.
        return known || (!declared && provider === undefined)
          ? []
          : [
              refusal(
                "E_UNKNOWN_SURFACE",
                placed,
                "/surface",
                `${edge.application} provides no surface ${edge.surface}`,
                "Name a surface a Process of that Application provides, or one the provider lists.",
              ),
            ];
      }),
  },
  {
    code: "E_DEPENDENCY_CYCLE",
    needsPlatform: true,
    answer: (union) =>
      cyclic(union).map((placed) =>
        refusal(
          "E_DEPENDENCY_CYCLE",
          placed,
          "",
          `this required edge to ${placed.value.edge.application} closes a cycle of required edges, so no Process on it can start first`,
          "Mark one edge on the cycle `required: false`, if its Process starts without that peer, or remove it.",
        ),
      ),
  },
];

/**
 * Every invariant `union` breaks: identity always, and references where the
 * Platform document is read beside it.
 */
export function unionDiagnostics(
  union: readonly Fragment[],
  platform: PlatformIntentDocument | undefined,
): Diagnostic[] {
  return INVARIANTS.flatMap((invariant) =>
    !invariant.needsPlatform
      ? invariant.answer(union)
      : platform === undefined
        ? []
        : invariant.answer(union, platform),
  );
}
