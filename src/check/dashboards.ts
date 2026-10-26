// A dashboard is a Grafana dashboard's JSON beside the project file
// (spec/v1/10-project-intent.md#dashboards): the set holds the file, the file
// names its `uid`, and no two dashboards of the estate share one, since
// Grafana keys a dashboard by it and the second would replace the first.
import type { Diagnostic } from "../model/diagnostic.ts";
import { dashboardUidOf } from "../model/dashboards.ts";
import type { ProjectIntentDocument } from "../model/project-intent.ts";

/** A dashboard file a project names, where it sits and what it says. */
export interface Placed {
  readonly document: string;
  readonly path: string;
  readonly uid: string;
}

/**
 * Every dashboard `document` names whose file `read` does not hold, or whose
 * JSON names no `uid`; and the uid of each that does, where it is written.
 */
export function dashboardDiagnostics(
  document: ProjectIntentDocument,
  read: (from: string) => string | undefined,
): {
  readonly refusals: Diagnostic[];
  readonly placed: Omit<Placed, "document">[];
} {
  const refusals: Diagnostic[] = [];
  const placed: Omit<Placed, "document">[] = [];
  for (const [a, application] of document.applications.entries())
    // A missing list and an empty one ship nothing alike.
    // Stryker disable next-line ArrayDeclaration
    for (const [d, { from }] of (application.dashboards ?? []).entries()) {
      const path = `/applications/${String(a)}/dashboards/${String(d)}/from`;
      const content = read(from);
      const uid = content === undefined ? undefined : dashboardUidOf(content);
      if (content === undefined)
        refusals.push({
          code: "E_DASHBOARD_NOT_FOUND",
          path,
          message: `no file ${from} is read beside the project file`,
          hint: "Commit the dashboard's JSON at that path beside the project file, or correct `from`.",
        });
      else if (uid === undefined)
        refusals.push({
          code: "E_DASHBOARD_WITHOUT_UID",
          path,
          message: `${from} names no uid, so Grafana would key it by a value of its own`,
          hint: "Give the dashboard's JSON a `uid` no other dashboard of the estate carries.",
        });
      else placed.push({ path, uid });
    }
  return { refusals, placed };
}

/** Every dashboard after the first that carries a uid already carried in the estate. */
export function duplicateUidDiagnostics(
  placed: readonly Placed[],
): Diagnostic[] {
  const seen = new Set<string>();
  return placed.flatMap(({ document, path, uid }): Diagnostic[] => {
    if (!seen.has(uid)) {
      seen.add(uid);
      return [];
    }
    return [
      {
        code: "E_DUPLICATE_DASHBOARD_UID",
        document,
        path,
        message: `another dashboard of the estate already carries the uid ${uid}`,
        hint: "Give one of the two dashboards another `uid`.",
      },
    ];
  });
}
