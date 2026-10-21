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
//
// Where the Project holds a database, one more Job dumps it, as the identity
// that holds its credential, into the Project's rollback claim, which this
// tree creates and Flux then keeps.
import type { ResolvedProject } from "../../model/resolution.ts";
import type { Deliverable } from "../../objects/deliverable.ts";
import type { Job, PersistentVolumeClaim } from "../../objects/kubernetes.ts";
import { labelsOf, podMetadataOf } from "../shared/labels.ts";
import { ROLLBACK_BACKUPS_DIRECTORY } from "../shared/paths.ts";
import type { RollbackDump } from "../shared/rollback-dump.ts";
import {
  ADAPTER,
  BACKUP_CONTAINER,
  BACKUP_TARGET,
  NEVER_PRUNED,
  RESTRICTED,
  backupMetadataOf,
  backupPodOf,
  backupsToRun,
} from "./render.ts";

/** The label that names the request a one-shot backup Job runs for. */
export const BACKUP_REQUEST_LABEL = "estate.jorisjonkers.dev/rollback-backup";

/** As long as a method run may take: the method gives up at the same bound. */
const BACKUP_DEADLINE_SECONDS = 2 * 60 * 60;

/** The dump's copy is the request's alone: `retain` never counts it. */
const DUMP_RETAIN = "1";

/** The Project's rollback claim, and the one-shot Job that dumps its database into it. */
function dumpOf(
  dump: RollbackDump,
  request: string,
): [PersistentVolumeClaim, Job] {
  const labels = {
    ...labelsOf({ name: dump.instance, runtime: "none" }, dump.application),
    [BACKUP_REQUEST_LABEL]: request,
  };
  const secret = (key: string) => ({
    secretKeyRef: { name: dump.name, key },
  });
  return [
    {
      apiVersion: "v1",
      kind: "PersistentVolumeClaim",
      metadata: {
        name: dump.claim,
        namespace: dump.namespace,
        labels: labelsOf(
          { name: dump.instance, runtime: "none" },
          dump.application,
        ),
        annotations: NEVER_PRUNED,
      },
      spec: {
        accessModes: ["ReadWriteOnce"],
        resources: { requests: { storage: dump.size } },
      },
    },
    {
      apiVersion: "batch/v1",
      kind: "Job",
      metadata: { name: dump.name, namespace: dump.namespace, labels },
      spec: {
        backoffLimit: 0,
        activeDeadlineSeconds: BACKUP_DEADLINE_SECONDS,
        template: {
          metadata: podMetadataOf(labels, [
            [BACKUP_CONTAINER, dump.methodVersion],
          ]),
          spec: {
            // The identity that holds the credential, though only the operator
            // reads the Secret Store as it: the pod mounts no token.
            serviceAccountName: dump.identity,
            automountServiceAccountToken: false,
            restartPolicy: "Never",
            securityContext: {
              runAsNonRoot: true,
              runAsUser: dump.uid,
              runAsGroup: dump.gid,
              fsGroup: dump.gid,
              seccompProfile: { type: "RuntimeDefault" },
            },
            containers: [
              {
                name: BACKUP_CONTAINER,
                image: dump.method,
                env: [
                  { name: "BACKUP_RETAIN", value: DUMP_RETAIN },
                  { name: "BACKUP_ROLLBACK", value: request },
                  { name: "BACKUP_DATABASE", value: dump.database },
                  { name: "BACKUP_HOST", value: dump.host },
                  { name: "BACKUP_PORT", value: String(dump.port) },
                  { name: "PGUSER", valueFrom: secret("username") },
                  { name: "PGPASSWORD", valueFrom: secret("password") },
                ],
                securityContext: RESTRICTED,
                volumeMounts: [{ name: "backup", mountPath: BACKUP_TARGET }],
              },
            ],
            volumes: [
              {
                name: "backup",
                persistentVolumeClaim: { claimName: dump.claim },
              },
            ],
          },
        },
      },
    },
  ];
}

export function renderRollbackBackups(
  project: ResolvedProject,
  request: string,
  dump?: RollbackDump,
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
              metadata: backupMetadataOf(marked, volume),
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
  const objects = [
    ...jobs,
    ...(dump === undefined ? [] : dumpOf(dump, request)),
  ];
  return objects.length === 0
    ? []
    : [
        {
          path: `${ROLLBACK_BACKUPS_DIRECTORY}/${project.project}.yaml`,
          adapter: ADAPTER,
          objects,
        },
      ];
}
