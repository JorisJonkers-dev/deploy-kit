// A datastore's catalog method (spec/v1/16-dependencies.md#applying-the-catalog):
// the ServiceAccount it runs as, the ConfigMap that hands it the catalog, the
// Job that applies it and the CronJob that applies it again every hour, in one
// file beside the Vault policy job's. The ConfigMap and the Job are named by a
// digest of the catalog and the method, so a changed one is a new Job.
import type { ResolvedCatalogJob } from "../../model/resolved-deployment.ts";
import type { Deliverable } from "../../objects/deliverable.ts";
import type {
  ConfigMap,
  CronJob,
  Job,
  ServiceAccount,
} from "../../objects/kubernetes.ts";
import { wholeSeconds } from "../shared/durations.ts";
import { labelsOf } from "../shared/labels.ts";
import { SECRETS_DIRECTORY } from "../shared/paths.ts";
import { nodeAffinityOf, UNTIL_SUCCEEDED } from "../shared/placement.ts";
import { ADAPTER } from "./render.ts";

/** How many hex digits of the digest the method's name carries. */
const NAME_DIGITS = 12;
const CATALOG = "/catalog";
const FILE = "catalog.json";
const VOLUME = "catalog";

/** What names a catalog's Job: the catalog, and everything its pod runs with. */
export const catalogDigestOf = (job: ResolvedCatalogJob): unknown => ({
  catalog: job.catalog,
  image: job.image,
  uid: job.uid,
  gid: job.gid,
  memory: job.memory,
  cpu: job.cpu,
  deadline: job.deadline,
  eligibleNodes: job.eligibleNodes,
});

export function renderCatalogJob(
  job: ResolvedCatalogJob,
  digest: string,
): Deliverable {
  const name = `${job.identity}-${(digest.split(":")[1] as string).slice(0, NAME_DIGITS)}`;
  const labels = labelsOf(
    { name: job.identity, runtime: "none" },
    job.identity,
  );
  const account: ServiceAccount = {
    apiVersion: "v1",
    kind: "ServiceAccount",
    metadata: { name: job.identity, namespace: job.namespace, labels },
  };
  const handed: ConfigMap = {
    apiVersion: "v1",
    kind: "ConfigMap",
    metadata: { name, namespace: job.namespace, labels },
    immutable: true,
    data: { [FILE]: { json: job.catalog } },
  };
  const pod: Job["spec"]["template"] = {
    metadata: { labels },
    spec: {
      serviceAccountName: job.identity,
      // The method logs in to the Secret Store with its own token.
      automountServiceAccountToken: true,
      restartPolicy: "OnFailure",
      // One attempt's deadline: a start too slow or a run that hangs fails the
      // pod, and the Job starts another.
      activeDeadlineSeconds: wholeSeconds(job.deadline),
      securityContext: {
        runAsNonRoot: true,
        runAsUser: job.uid,
        runAsGroup: job.gid,
        seccompProfile: { type: "RuntimeDefault" },
      },
      affinity: nodeAffinityOf(job.eligibleNodes),
      containers: [
        {
          name: job.identity,
          image: job.image,
          env: [
            { name: "VAULT_ADDR", value: job.address },
            { name: "VAULT_ROLE", value: job.role },
            { name: "CATALOG_FILE", value: `${CATALOG}/${FILE}` },
          ],
          resources: {
            requests: { memory: job.memory, cpu: job.cpu },
            limits: { memory: job.memory },
          },
          securityContext: {
            readOnlyRootFilesystem: true,
            capabilities: { drop: ["ALL"] },
          },
          volumeMounts: [{ name: VOLUME, mountPath: CATALOG, readOnly: true }],
        },
      ],
      volumes: [
        {
          name: VOLUME,
          configMap: { name, items: [{ key: FILE, path: FILE }] },
        },
      ],
    },
  };
  const run: Job = {
    apiVersion: "batch/v1",
    kind: "Job",
    metadata: { name, namespace: job.namespace, labels },
    // Every Reconcile Unit that holds a grant waits on this run, so it retries
    // until it succeeds rather than failing for good on one slow start.
    spec: { backoffLimit: UNTIL_SUCCEEDED, template: pod },
  };
  // The same run every hour, so what an adopted role created since is reassigned.
  const hourly: CronJob = {
    apiVersion: "batch/v1",
    kind: "CronJob",
    metadata: { name: job.identity, namespace: job.namespace, labels },
    spec: {
      schedule: "@hourly",
      concurrencyPolicy: "Forbid",
      jobTemplate: {
        metadata: { labels },
        spec: { backoffLimit: UNTIL_SUCCEEDED, template: pod },
      },
    },
  };
  return {
    path: `${SECRETS_DIRECTORY}/${job.identity}.yaml`,
    adapter: ADAPTER,
    objects: [account, handed, run, hourly],
  };
}
