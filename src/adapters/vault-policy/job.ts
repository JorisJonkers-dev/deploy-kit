// The Vault policy job (spec/v1/30-deliverables.md#vault-configuration-is-rendered-not-applied):
// the ServiceAccount it runs as, the ConfigMap that hands it every policy and
// auth role this render holds, and the Job that writes them into the Secret
// Store. The ConfigMap and the Job are named by the digest of those documents:
// a Job's template cannot change once created, so a changed policy set is a
// new Job, and the one it replaces leaves the render with it.
import type { ResolvedPolicyJob } from "../../model/resolved-deployment.ts";
import type { Deliverable } from "../../objects/deliverable.ts";
import type {
  ConfigMap,
  CronJob,
  Job,
  ServiceAccount,
} from "../../objects/kubernetes.ts";
import { wholeSeconds } from "../shared/durations.ts";
import { labelsOf, podMetadataOf } from "../shared/labels.ts";
import {
  nodeAffinityOf,
  RECREATED,
  UNTIL_SUCCEEDED,
  WITHIN_THE_HOUR,
} from "../shared/placement.ts";
import { ADAPTER } from "./render.ts";

/** How many hex digits of the documents' digest the job's name carries. */
const NAME_DIGITS = 12;
/** Where the job reads the documents, each under its own file name. */
const POLICIES = "/policies";
const VOLUME = "policies";

/** The last segment of a path: the name a document is mounted and written under. */
const fileOf = (path: string): string => path.split("/").pop() as string;

type Named = readonly [name: string, document: unknown];

// No two documents share a name, so `<=` would order the same list.
// Stryker disable next-line EqualityOperator
const byName = ([a]: Named, [b]: Named): number => (a < b ? -1 : 1);

/**
 * Every document by its file name, in name order whatever order the projects
 * were rendered in: what the job is handed, and what names it.
 */
export const documentsOf = (
  documents: readonly Deliverable[],
): Readonly<Record<string, unknown>> =>
  Object.fromEntries(
    documents
      .map(({ path, objects }): Named => [fileOf(path), objects[0]])
      .sort(byName),
  );

/**
 * The job's four files, in `directory`, for the documents it writes and their
 * digest. The digest is the caller's: an adapter spells what it is handed and
 * hashes nothing.
 */
export function renderPolicyJob(
  job: ResolvedPolicyJob,
  documents: readonly Deliverable[],
  digest: string,
  directory: string,
): Deliverable[] {
  const name = `${job.identity}-${(digest.split(":")[1] as string).slice(0, NAME_DIGITS)}`;
  const labels = labelsOf(
    { name: job.identity, runtime: "none" },
    job.identity,
  );
  const held = documentsOf(documents);
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
    data: Object.fromEntries(
      Object.entries(held).map(([file, json]) => [file, { json }]),
    ),
  };
  const pod: Job["spec"]["template"] = {
    metadata: podMetadataOf(labels, [[job.identity, job.imageVersion]]),
    spec: {
      serviceAccountName: job.identity,
      // The job logs in to the Secret Store with its own token.
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
            { name: "POLICIES_DIR", value: POLICIES },
          ],
          resources: {
            requests: { memory: job.memory, cpu: job.cpu },
            limits: { memory: job.memory },
          },
          securityContext: {
            allowPrivilegeEscalation: false,
            readOnlyRootFilesystem: true,
            capabilities: { drop: ["ALL"] },
          },
          volumeMounts: [{ name: VOLUME, mountPath: POLICIES, readOnly: true }],
        },
      ],
      volumes: [
        {
          name: VOLUME,
          configMap: {
            name,
            items: Object.keys(held).map((file) => ({
              key: file,
              path: file,
            })),
          },
        },
      ],
    },
  };
  const run: Job = {
    apiVersion: "batch/v1",
    kind: "Job",
    metadata: {
      name,
      namespace: job.namespace,
      labels,
      annotations: RECREATED,
    },
    // Its unit is Ready only once this run succeeds, so it retries until one
    // does rather than failing for good on one slow start.
    spec: { backoffLimit: UNTIL_SUCCEEDED, template: pod },
  };
  // The same run every hour, so a Vault restored without a generated key gets it back.
  const hourly: CronJob = {
    apiVersion: "batch/v1",
    kind: "CronJob",
    metadata: { name: job.identity, namespace: job.namespace, labels },
    spec: {
      schedule: "@hourly",
      concurrencyPolicy: "Forbid",
      jobTemplate: {
        metadata: { labels },
        spec: { ...WITHIN_THE_HOUR, template: pod },
      },
    },
  };
  return [
    {
      path: `${directory}/configmap.yaml`,
      adapter: ADAPTER,
      objects: [handed],
    },
    { path: `${directory}/job.yaml`, adapter: ADAPTER, objects: [run] },
    { path: `${directory}/cronjob.yaml`, adapter: ADAPTER, objects: [hourly] },
    {
      path: `${directory}/serviceaccount.yaml`,
      adapter: ADAPTER,
      objects: [account],
    },
  ];
}
