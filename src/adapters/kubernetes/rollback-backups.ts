// A Rollback's backup (spec/v1/55-delivery.md#pause-and-rollback): one
// one-shot Job per backed-up volume of the Project, run the way its scheduled
// backup is, at the render the Project is pinned to. Each is labelled with the
// request, so the Collector can report how it ended, and lands in the
// estate-scoped tree: the Project's own render, and its pin, do not move while
// it runs.
//
// The Job hands the method the request as `BACKUP_ROLLBACK`, which writes a
// copy under its own name that `retain` never counts and every method run
// deletes once it is 7 days old (spec/v1/14-platform-intent.md#engines).
import type { ResolvedProject } from "../../model/resolution.ts";
import type { Deliverable } from "../../objects/deliverable.ts";
import type { Job } from "../../objects/kubernetes.ts";
import { ROLLBACK_BACKUPS_DIRECTORY } from "../shared/paths.ts";
import { ADAPTER, backupPodOf, backupsToRun } from "./render.ts";

/** The label that names the request a one-shot backup Job runs for. */
export const BACKUP_REQUEST_LABEL = "estate.jorisjonkers.dev/rollback-backup";

/** As long as a method run may take: the method gives up at the same bound. */
const BACKUP_DEADLINE_SECONDS = 2 * 60 * 60;

export function renderRollbackBackups(
  project: ResolvedProject,
  request: string,
): Deliverable[] {
  const jobs = project.applications.flatMap((application) =>
    application.processes.flatMap((process) =>
      backupsToRun(process, application).map(({ volume, labels }): Job => {
        const marked = { ...labels, [BACKUP_REQUEST_LABEL]: request };
        return {
          apiVersion: "batch/v1",
          kind: "Job",
          metadata: {
            name: `${volume.backup.claim}-${request}`,
            namespace: application.namespace,
            labels: marked,
          },
          spec: {
            // A failed backup is the Rollback's answer, not a run to retry.
            backoffLimit: 0,
            activeDeadlineSeconds: BACKUP_DEADLINE_SECONDS,
            template: {
              metadata: { labels: marked },
              spec: {
                ...backupPodOf(volume, [
                  { name: "BACKUP_ROLLBACK", value: request },
                ]),
                restartPolicy: "Never",
              },
            },
          },
        };
      }),
    ),
  );
  return jobs.length === 0
    ? []
    : [
        {
          path: `${ROLLBACK_BACKUPS_DIRECTORY}/${project.project}.yaml`,
          adapter: ADAPTER,
          objects: jobs,
        },
      ];
}
