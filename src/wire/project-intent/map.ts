import type { Diagnostic, Result } from "../../domain/diagnostic.ts";
import type {
  Application,
  Dependency,
  Placement,
  Process,
  Project,
} from "../../domain/project-intent/model.ts";
import { projectIntent, type ProjectIntentDocument } from "./schema.ts";

type WireApplication = ProjectIntentDocument["applications"][number];
type WireProcess = WireApplication["processes"][number];
type WirePlacement = WireProcess["placement"];
type WireDependency = NonNullable<WireProcess["dependsOn"]>[number];

const escape = (segment: PropertyKey): string =>
  String(segment).replaceAll("~", "~0").replaceAll("/", "~1");

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
    provides: new Map(Object.entries(provides ?? {})),
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

function toApplication(application: WireApplication): Application {
  const { exposure, processes, secrets, ...rest } = application;
  return {
    ...rest,
    exposures: exposure ?? [],
    grants: secrets ?? [],
    processes: processes.map(toProcess),
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
      diagnostics: parsed.error.issues.map((issue): Diagnostic => ({
        code: "schema",
        path: issue.path.map((segment) => `/${escape(segment)}`).join(""),
        message: issue.message,
        hint: "Correct the field against spec/v1/10-project-intent.md.",
      })),
    };
  const { project, owner, applications } = parsed.data;
  return {
    ok: true,
    value: {
      document: parsed.data,
      project: {
        name: project,
        owner,
        applications: applications.map(toApplication),
      },
    },
  };
}
