// The invariants every fragment answers over the composed union
// (spec/v1/40-composition.md#the-estate-wide-invariants), as an enumerable
// registry. Identity is answered by any set of project files; a reference
// resolves against the Platform document's providers as well as the union, so
// it is answered only beside one. Every collision is refused at each of its
// sides, so the same set yields the same refusals in any order, and the
// fragment that introduced one is the one isolated
// (spec/v1/40-composition.md#a-refused-project-is-isolated).
import type { Diagnostic, RefusalCode } from "../model/diagnostic.ts";
import type {
  EffectiveApplication,
  EffectiveProcess,
  EffectiveProject,
} from "../model/effective-intent.ts";
import type { PlatformIntentDocument } from "../model/platform-intent.ts";
import type {
  DependencyEdge,
  EnvVariable,
  ProjectIntentDocument,
} from "../model/project-intent.ts";
import { collectorEndpoint, exports } from "../model/runtime-profiles.ts";

export interface Fragment {
  readonly name: string;
  readonly document: ProjectIntentDocument;
  /** The same project lowered, where a rule reads what each Process holds. */
  readonly effective: EffectiveProject;
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
  message: string,
  hint: string,
): Diagnostic => ({ code, document, path, message, hint });

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
  // Stryker disable next-line ArrayDeclaration: an arc no Process names is
  // reached from nothing and reaches nothing.
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
    // Stryker disable next-line ArrayDeclaration: the start is visited once
    // either way, as the first entry of the queue or as an arc's end.
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

/** A lowered Process, where its authored self sits, and the Application holding it. */
interface Lowered {
  readonly document: string;
  readonly path: string;
  readonly application: EffectiveApplication;
  readonly process: EffectiveProcess;
}

const heldIn = ({ name, effective }: Fragment): Lowered[] =>
  effective.applications.flatMap((application, a) =>
    application.processes.map((process, p) => ({
      document: name,
      path: `/applications/${String(a)}/processes/${String(p)}`,
      application,
      process,
    })),
  );

/**
 * A Process's env files: read through its own key, which a lint reading
 * `process.env` as the ambient environment would mistake for it.
 */
const envOf = ({ env }: EffectiveProcess) => env;

type Placeholder = Exclude<EnvVariable["value"], { readonly text: string }>;

/** Every variable of every env file a Process holds whose value is a placeholder of `kind`. */
const placeholders = (
  process: EffectiveProcess,
  kind: Placeholder["kind"],
): { readonly name: string; readonly source: string }[] =>
  // Stryker disable next-line ArrayDeclaration: a Process with no env file
  // and one with an empty list hold no placeholder alike.
  (envOf(process) ?? []).flatMap(({ entries }) =>
    entries.flatMap(({ name, value }) =>
      "kind" in value && value.kind === kind
        ? [{ name, source: value.source }]
        : [],
    ),
  );

/** The env grants a Process holds, each by its path and keys. */
const envGrants = (process: EffectiveProcess) =>
  // Stryker disable next-line ArrayDeclaration: a Process with no grant and
  // one with an empty list hold none alike.
  (process.secrets ?? []).flatMap((grant) =>
    "path" in grant && grant.delivery === "env" ? [grant] : [],
  );

/** The source of a `${secret:<path>#<key>}`, split at its last `#`. */
const pathAndKey = (source: string): readonly [string, string] => {
  const cut = source.lastIndexOf("#");
  return [source.slice(0, cut), source.slice(cut + 1)];
};

/** Whether a fragment of the union declares the Application `id`. */
const inUnion = (union: readonly Fragment[], id: string): boolean =>
  union.some(({ document }) =>
    document.applications.some((application) => application.id === id),
  );

/** The coordinates an edge hands its consumer (spec/v1/10-project-intent.md#three-placeholder-sources). */
const COORDINATES: ReadonlySet<string> = new Set(["host", "port"]);

/** The fields of an exposure a placeholder may read. */
const FIELDS: ReadonlySet<string> = new Set(["url", "host", "scheme"]);

/** Why a placeholder names nothing, or nothing where it resolves; an Application nothing declares is not its to say. */
function unresolved(
  kind: "dependency" | "exposure",
  source: string,
  process: EffectiveProcess,
  union: readonly Fragment[],
): string | undefined {
  if (kind === "dependency") {
    const cut = source.lastIndexOf(".");
    const application = source.slice(0, cut);
    // Stryker disable next-line ArrayDeclaration: a Process with no edge and
    // one with an empty list hold no edge alike.
    const edges = (process.dependsOn ?? []).filter(
      (edge) => edge.application === application,
    );
    if (edges.length !== 1)
      return `the Process holds ${edges.length === 0 ? "no" : "more than one"} edge to ${application}`;
    return COORDINATES.has(source.slice(cut + 1))
      ? undefined
      : `an edge hands no coordinate ${source.slice(cut + 1)}`;
  }
  const hash = source.lastIndexOf("#");
  const dot = source.lastIndexOf(".", hash);
  const application = source.slice(0, dot);
  const name = source.slice(dot + 1, hash);
  const declared = union
    .flatMap(({ effective }) => effective.applications)
    .find(({ id }) => id === application);
  if (declared === undefined) return undefined;
  if (declared.exposure?.some((exposure) => exposure.name === name) !== true)
    return `${application} declares no exposure ${name}`;
  return FIELDS.has(source.slice(hash + 1))
    ? undefined
    : `an exposure has no field ${source.slice(hash + 1)}`;
}

/** The keys a Process's Runtime Profile injects, which no env file may write (spec/v1/10-project-intent.md#runtime-profiles). */
function profileKeys(
  process: EffectiveProcess,
  platform: PlatformIntentDocument,
  union: readonly Fragment[],
): ReadonlySet<string> {
  if (!exports(process.runtime)) return new Set();
  const collects =
    collectorEndpoint(
      platform,
      union.map(({ document }) => document),
    ) !== undefined;
  const injected: readonly (readonly [string, boolean])[] = [
    ["DEPLOYMENT_ENVIRONMENT", true],
    ["OTEL_SERVICE_NAME", true],
    ["OTEL_EXPORTER_OTLP_ENDPOINT", collects],
    ["PORT", Object.keys(process.provides ?? {}).length === 1],
  ];
  return new Set(injected.filter(([, is]) => is).map(([key]) => key));
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
          path: "",
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
          `more than one exposure claims the host ${exposure.value.host}`,
          "A host is unique across the estate: route the paths of one host from one exposure, or choose another host.",
        ),
      ),
  },
  {
    code: "E_UNRESOLVED_APPLICATION",
    needsPlatform: true,
    answer: (union, platform) => [
      ...union.flatMap(edgesOf).flatMap((placed) => {
        const { application } = placed.value.edge;
        const declared =
          inUnion(union, application) ||
          platform.providers?.some(({ name }) => name === application);
        return declared === true
          ? []
          : [
              refusal(
                "E_UNRESOLVED_APPLICATION",
                placed,
                `no fragment declares an Application ${application}, and the platform names no provider of that name`,
                "Name an Application a fragment declares, or a provider the Platform document lists.",
              ),
            ];
      }),
      // An exposure placeholder addresses an Application of the union; a
      // provider declares no exposure.
      ...union.flatMap(heldIn).flatMap((held) =>
        placeholders(held.process, "exposure").flatMap(
          ({ name, source }): Diagnostic[] => {
            const application = source.slice(
              0,
              source.lastIndexOf(".", source.lastIndexOf("#")),
            );
            return inUnion(union, application)
              ? []
              : [
                  {
                    code: "E_UNRESOLVED_APPLICATION",
                    document: held.document,
                    path: held.path,
                    message: `${name} reads an exposure of ${application}, and no fragment declares that Application`,
                    hint: "Name an Application a fragment declares, and an exposure it carries.",
                  },
                ];
          },
        ),
      ),
    ],
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
          `this required edge to ${placed.value.edge.application} closes a cycle of required edges, so no Process on it can start first`,
          "Mark one edge on the cycle `required: false`, if its Process starts without that peer, or remove it.",
        ),
      ),
  },
  {
    code: "E_UNAUTHORISED_SECRET_REFERENCE",
    needsPlatform: false,
    answer: (union) =>
      union.flatMap(heldIn).flatMap((held) =>
        placeholders(held.process, "secret").flatMap(({ name, source }) => {
          const [path, key] = pathAndKey(source);
          return envGrants(held.process).some(
            (grant) => grant.path === path && grant.keys.includes(key),
          )
            ? []
            : [
                {
                  code: "E_UNAUTHORISED_SECRET_REFERENCE",
                  document: held.document,
                  path: held.path,
                  message: `${name} reads ${source}, and no grant the Process holds delivers that key of that path to its environment`,
                  hint: "Grant the path to this Process with `delivery: env` and the key in `keys`, or read a path it is granted.",
                },
              ];
        }),
      ),
  },
  {
    code: "E_UNBOUND_SECRET_GRANT",
    needsPlatform: false,
    answer: (union) =>
      // A Process no env file reaches is undecided: its files may simply not
      // be among those read, as where a project file is checked alone.
      union.flatMap(heldIn).flatMap((held) => {
        if (envOf(held.process) === undefined) return [];
        const read = new Set(
          placeholders(held.process, "secret").map(
            ({ source }) => pathAndKey(source)[0],
          ),
        );
        return envGrants(held.process)
          .filter(({ path }) => !read.has(path))
          .map(({ path }) => ({
            code: "E_UNBOUND_SECRET_GRANT",
            document: held.document,
            path: held.path,
            message: `${held.process.name} is granted ${path} into its environment, and no env file reads it`,
            hint: "Read the path with a `${secret:…}` placeholder, or remove the grant: a grant nothing reads is a dead grant.",
          }));
      }),
  },
  {
    code: "E_UNRESOLVED_PLACEHOLDER",
    needsPlatform: false,
    answer: (union) =>
      union.flatMap(heldIn).flatMap((held) =>
        (["dependency", "exposure"] as const).flatMap((kind) =>
          placeholders(held.process, kind).flatMap(({ name, source }) => {
            const why = unresolved(kind, source, held.process, union);
            return why === undefined
              ? []
              : [
                  {
                    code: "E_UNRESOLVED_PLACEHOLDER",
                    document: held.document,
                    path: held.path,
                    message: `${name} reads \${${kind}:${source}}, and ${why}`,
                    hint: "A dependency placeholder names the Application of one edge the Process holds and `host` or `port`; an exposure placeholder names an exposure the Application declares and `url`, `host` or `scheme`.",
                  },
                ];
          }),
        ),
      ),
  },
  {
    code: "E_PROFILE_KEY_AUTHORED",
    needsPlatform: true,
    answer: (union, platform) =>
      union.flatMap(heldIn).flatMap((held) => {
        const injected = profileKeys(held.process, platform, union);
        return (envOf(held.process) ?? []).flatMap(({ entries }) =>
          entries
            .filter(({ name }) => injected.has(name))
            .map(({ name }) => ({
              code: "E_PROFILE_KEY_AUTHORED",
              document: held.document,
              path: held.path,
              message: `${name} is written in an env file, and the Runtime Profile injects it`,
              hint: "Delete the line: the model sets this variable for every Process of the runtime.",
            })),
        );
      }),
  },
  {
    code: "E_RELEASE_UNIT_NO_READINESS",
    needsPlatform: true,
    answer: (union, platform) =>
      union.flatMap(({ name, effective }) =>
        effective.applications.flatMap((application, a) => {
          // Machinery rolls rather than switches, so nothing gates it.
          if (platform.delivery?.machinery.includes(application.id) === true)
            return [];
          const gated = application.processes.filter(
            ({ lifecycle, cutover }) =>
              lifecycle === "application" && cutover === "continuous",
          );
          return gated.length > 0 &&
            gated.every(
              ({ probes }) =>
                typeof probes !== "object" || probes.readiness === undefined,
            )
            ? [
                {
                  code: "E_RELEASE_UNIT_NO_READINESS",
                  document: name,
                  path: `/applications/${String(a)}`,
                  message: `no Process of ${application.id} that switches blue/green publishes readiness, so nothing can gate its switch`,
                  hint: "Declare a readiness probe on a continuous Process of this Application.",
                },
              ]
            : [];
        }),
      ),
  },
  {
    code: "E_NO_SECRET_STORE",
    needsPlatform: true,
    answer: (union, platform) =>
      platform.secretStore !== undefined
        ? []
        : union.flatMap(({ name, effective }) =>
            effective.applications.flatMap((application, a) =>
              typeof application.migration === "object" ||
              application.processes.some(
                ({ secrets, volumes }) =>
                  (secrets?.length ?? 0) > 0 ||
                  volumes?.some(
                    ({ durability }) =>
                      platform.durability[durability]?.offCluster !== undefined,
                  ) === true,
              )
                ? [
                    {
                      code: "E_NO_SECRET_STORE",
                      document: name,
                      path: `/applications/${String(a)}`,
                      message: `${application.id} reads from the Secret Store, and the platform names none`,
                      hint: "Name the Secret Store in the Platform document's `secretStore`.",
                    },
                  ]
                : [],
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
