// The migration of one Application
// (spec/v1/55-delivery.md#failure-and-undo): the identity it runs as, the Job
// that applies this revision's changelog and the Job that undoes it, both
// named by the revision's tag, rendered suspended and created once. Every
// value is read off the migration plan.
import type {
  ResolvedApplicationDocument,
  ResolvedMigration,
} from "../../model/resolved-deployment.ts";
import { tagOf } from "../../model/revision.ts";
import { vaultNameOf } from "../../model/runtime-profiles.ts";
import type { RenderedObject } from "../../objects/deliverable.ts";
import type { Job, Labels, ServiceAccount } from "../../objects/kubernetes.ts";
import { wholeSeconds } from "../shared/durations.ts";
import { labelsOf } from "../shared/labels.ts";

/**
 * The mark that makes the applier create a Job and never update it
 * (spec/v1/30-deliverables.md#flagger-ready-objects): the Release Gate alone
 * writes `suspend` afterwards.
 */
const CREATED_ONCE = { "kustomize.toolkit.fluxcd.io/ssa": "IfNotPresent" };

/** The runner's one writable path, and the volume it is mounted from. */
const SCRATCH = "/tmp";
const SCRATCH_VOLUME = "scratch";

/** One of the runner's two commands, as the Job that runs it against a tag. */
function jobOf(
  name: string,
  command: "up" | "down",
  tag: string,
  plan: ResolvedMigration,
  application: ResolvedApplicationDocument,
  labels: Labels,
): Job {
  return {
    apiVersion: "batch/v1",
    kind: "Job",
    metadata: {
      name,
      namespace: application.namespace,
      labels,
      annotations: CREATED_ONCE,
    },
    spec: {
      suspend: true,
      backoffLimit: 0,
      activeDeadlineSeconds: wholeSeconds(plan.deadline),
      template: {
        metadata: { labels },
        spec: {
          serviceAccountName: plan.identity,
          // The runner logs in to the Secret Store with its own token.
          automountServiceAccountToken: true,
          restartPolicy: "Never",
          securityContext: {
            runAsNonRoot: true,
            runAsUser: plan.uid,
            runAsGroup: plan.gid,
            seccompProfile: { type: "RuntimeDefault" },
          },
          containers: [
            {
              name: "migration",
              image: plan.runner,
              args: [command, tag],
              env: [
                { name: "DATABASE_HOST", value: plan.database.host },
                { name: "DATABASE_PORT", value: String(plan.database.port) },
                { name: "DATABASE_NAME", value: plan.database.name },
                // A migration reads the store, so its Application names one.
                {
                  name: "VAULT_ADDR",
                  value: application.secretStore as string,
                },
                {
                  name: "VAULT_ROLE",
                  value: vaultNameOf(application.namespace, plan.identity),
                },
                {
                  name: "VAULT_CREDENTIALS_PATH",
                  value: (plan.credential.paths[0] as { path: string }).path,
                },
              ],
              resources: {
                requests: { memory: plan.memory, cpu: plan.cpu },
                limits: { memory: plan.memory },
              },
              securityContext: {
                readOnlyRootFilesystem: true,
                capabilities: { drop: ["ALL"] },
              },
              volumeMounts: [{ name: SCRATCH_VOLUME, mountPath: SCRATCH }],
            },
          ],
          volumes: [
            { name: SCRATCH_VOLUME, emptyDir: { sizeLimit: plan.scratch } },
          ],
        },
      },
    },
  };
}

/**
 * The migration identity and its Jobs, where the Application moves its schema
 * with a changelog. The down returns to the tag of the revision the release
 * was proven against, so a first release, proven against nothing, has none.
 */
export function migrationOf(
  application: ResolvedApplicationDocument,
): RenderedObject[] {
  const plan = application.migration;
  if (plan === undefined) return [];
  const labels = labelsOf(
    { name: plan.identity, runtime: "none" },
    application.id,
  );
  const tag = tagOf(application.revision);
  const account: ServiceAccount = {
    apiVersion: "v1",
    kind: "ServiceAccount",
    metadata: { name: plan.identity, namespace: application.namespace, labels },
  };
  return [
    account,
    jobOf(`${plan.identity}-${tag}`, "up", tag, plan, application, labels),
    ...(plan.testedAgainst === undefined
      ? []
      : [
          jobOf(
            `${plan.identity}-down-${tag}`,
            "down",
            tagOf(plan.testedAgainst),
            plan,
            application,
            labels,
          ),
        ]),
  ];
}
