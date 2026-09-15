import type { Diagnostic, Result } from "../../domain/diagnostic.ts";
import type {
  Application,
  Dependency,
  Exposure,
  Observability,
  Placement,
  Process,
  Project,
} from "../../domain/project-intent/model.ts";
import { link, type Linked } from "./link.ts";
import { schemaDiagnostics } from "../schema-diagnostics.ts";
import { ruleDiagnostics } from "./rules.ts";
import { projectIntent, type ProjectIntentDocument } from "./schema.ts";

type WireApplication = ProjectIntentDocument["applications"][number];
type WireProcess = WireApplication["processes"][number];
type WirePlacement = WireProcess["placement"];
type WireDependency = NonNullable<WireProcess["dependsOn"]>[number];

/** A dependency is required unless the document says it is not. */
function toDependency(edge: WireDependency): Dependency {
  const { required, ...rest } = edge;
  return { ...rest, required: required ?? true };
}

function toPlacement(placement: WirePlacement): Placement {
  const { arch, capabilities, ...rest } = placement;
  return { ...rest, arch: arch ?? [], capabilities: capabilities ?? [] };
}

function toProcess(process: WireProcess): Process {
  const {
    provides,
    probes,
    writablePaths,
    sidecars,
    dependsOn,
    assets,
    volumes,
    secrets,
    placement,
    ...rest
  } = process;
  return {
    ...rest,
    surfaces: Object.entries(provides ?? {}).map(([name, port]) => ({
      name,
      port,
    })),
    placement: toPlacement(placement),
    writablePaths: writablePaths ?? [],
    sidecars: sidecars ?? [],
    dependencies: (dependsOn ?? []).map(toDependency),
    assets: assets ?? [],
    probes: probes ?? {},
    volumes: volumes ?? [],
    grants: secrets ?? [],
  };
}

type Resolved = Extract<Linked, { readonly ok: true }>;

/** An Application with its routes and scrape linked to its own Processes, or the refusals of what did not link. */
function toApplication(
  application: WireApplication,
  at: string,
):
  | { readonly application: Application; readonly refusals: readonly [] }
  | { readonly refusals: readonly Diagnostic[] } {
  const { exposure, processes, secrets, observability, ...rest } = application;
  const linked = processes.map(toProcess);
  const exposures = exposure ?? [];

  const linkedExposures = exposures.map((wire, index) => ({
    wire,
    routes: wire.routes.map(({ process, surface, ...fields }, position) => ({
      fields,
      result: link(
        { process, surface },
        linked,
        `${at}/exposure/${index}/routes/${position}`,
      ),
    })),
  }));
  const scrape = observability?.scrape;
  const scrapeLinks =
    scrape === undefined
      ? []
      : [link(scrape, linked, `${at}/observability/scrape`)];
  const refusals = [
    ...linkedExposures.flatMap(({ routes }) =>
      routes.map(({ result }) => result),
    ),
    ...scrapeLinks,
  ].flatMap((result) => (result.ok ? [] : [result.diagnostic]));
  if (refusals.length > 0) return { refusals };

  const resolved = (result: Linked | undefined): Resolved["value"] =>
    (result as Resolved).value;
  let monitoring: Observability | undefined;
  if (observability !== undefined) {
    const { scrape: _written, ...fields } = observability;
    monitoring =
      scrape === undefined
        ? fields
        : {
            ...fields,
            scrape: { ...resolved(scrapeLinks[0]), path: scrape.path },
          };
  }

  return {
    application: {
      ...rest,
      ...(monitoring === undefined ? {} : { observability: monitoring }),
      exposures: linkedExposures.map(({ wire, routes }): Exposure => ({
        ...wire,
        routes: routes.map(({ fields, result }) => ({
          ...fields,
          ...resolved(result),
        })),
      })),
      grants: secrets ?? [],
      processes: linked,
    },
    refusals: [],
  };
}

export interface ValidatedProjectIntent {
  readonly document: ProjectIntentDocument;
  readonly project: Project;
}

export function validateProjectIntent(
  value: unknown,
): Result<ValidatedProjectIntent> {
  const parsed = projectIntent.safeParse(value);
  if (!parsed.success)
    return {
      ok: false,
      diagnostics: schemaDiagnostics(
        parsed.error,
        "spec/v1/10-project-intent.md",
      ),
    };
  const { project, owner, applications } = parsed.data;
  const mapped = applications.map((application, index) =>
    toApplication(application, `/applications/${index}`),
  );
  const refusals = [
    ...ruleDiagnostics(parsed.data),
    ...mapped.flatMap(({ refusals: unlinked }) => unlinked),
  ];
  if (refusals.length > 0) return { ok: false, diagnostics: refusals };
  return {
    ok: true,
    value: {
      document: parsed.data,
      project: {
        name: project,
        owner,
        // With no refusal left, every Application linked.
        applications: mapped.map(
          (result) =>
            (result as { readonly application: Application }).application,
        ),
      },
    },
  };
}
