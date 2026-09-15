import type { Diagnostic, Result } from "../../domain/diagnostic.ts";
import type {
  Application,
  Process,
  Project,
} from "../../domain/project-intent/model.ts";
import { projectIntent, type ProjectIntentDocument } from "./schema.ts";

type WireApplication = ProjectIntentDocument["applications"][number];
type WireProcess = WireApplication["processes"][number];

const escape = (segment: PropertyKey): string =>
  String(segment).replaceAll("~", "~0").replaceAll("/", "~1");

function toProcess(process: WireProcess): Process {
  const { provides, probes, ...rest } = process;
  return {
    ...rest,
    provides: new Map(Object.entries(provides ?? {})),
    probes: probes ?? {},
  };
}

function toApplication(application: WireApplication): Application {
  const { exposure, processes, ...rest } = application;
  return {
    ...rest,
    exposures: exposure ?? [],
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
