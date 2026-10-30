// The monitoring stack's Prometheus and Alertmanager as the operator's own
// objects (spec/v1/14-platform-intent.md#the-operators-objects): the pod the
// render would have run, handed to the operator whole, and what the Platform
// document says each selects and notifies.
import type {
  ResolvedApplicationDocument,
  ResolvedProcess,
} from "../../model/resolved-deployment.ts";
import type {
  Alertmanager,
  LabelSelection,
  OperatedContainer,
  OperatedSpec,
  Prometheus,
} from "../../objects/custom.ts";
import type { Labels, PodSpec } from "../../objects/kubernetes.ts";
import { notSupported } from "../../model/internal-failure.ts";
import { OPERATOR, flagOf, type Flag } from "../../model/operated.ts";
import { labelsOf, managedOnly } from "../shared/labels.ts";

type Operated = NonNullable<ResolvedProcess["operated"]>;
/** The pod a Process runs in, as the render writes its template. */
interface PodTemplate {
  readonly metadata: {
    readonly labels: Labels;
    readonly annotations?: Labels;
  };
  readonly spec: PodSpec;
}

/** Labels the operator sets on every pod it runs, which a pod's own may not. */
const RESERVED = [
  "app.kubernetes.io/name",
  "app.kubernetes.io/instance",
  "app.kubernetes.io/managed-by",
];

/** A Process the operator does not run as declared yet stops the render rather than losing what it declares. */
function notYet(process: ResolvedProcess): void {
  // Only an application Process carries an interrupted cutover of its own,
  // or E_OPERATED_PROCESS, E_SCHEDULED_PROCESS_SERVES or a prepare refusal
  // refused it.
  if (
    [
      process.sidecars,
      process.seeder,
      process.vpn,
      process.gpu,
      process.libraries,
      process.l4Exposure,
      process.spawns,
      process.move,
      process.command,
    ].some((held) => held !== undefined)
  )
    throw notSupported(
      `${process.name}: a Process the operator runs that holds a sidecar, a seeded Asset, a VPN, a GPU, a library, an L4 Address, a spawn template, a Move or a command, is not rendered yet`,
    );
}

/** Every label selector selects every object where it names no label. */
const selecting = (
  labels: Readonly<Record<string, string>> | undefined,
): LabelSelection =>
  // No labels and undefined ones render alike: YAML drops the key.
  // Stryker disable next-line ConditionalExpression
  labels === undefined ? {} : { matchLabels: labels };

/** The flags its arguments hold: E_OPERATED_PROCESS refused any other argument. */
const flagsOf = (process: ResolvedProcess): Flag[] =>
  // Stryker disable next-line ArrayDeclaration: no list and an empty one hold no flag alike.
  (process.args ?? []).map((argument) => flagOf(argument) as Flag);

/** The value of the last of a field's flags, as the binary reads a repeated one. */
const lastOf = (flags: readonly Flag[], name: string): string | undefined =>
  flags.findLast((flag) => flag.name === name)?.value;

function prometheusOf(
  operated: Extract<Operated, { kind: "Prometheus" }>,
  flags: readonly Flag[],
): Omit<Prometheus["spec"], keyof OperatedSpec> {
  const retention = lastOf(flags, "storage.tsdb.retention.time");
  const retentionSize = lastOf(flags, "storage.tsdb.retention.size");
  const features = flags
    .filter(({ name }) => name === "enable-feature")
    .flatMap(({ value }) => (value ?? "").split(","))
    .filter((feature) => feature !== "");
  const { alertmanager } = operated;
  const every = {};
  return {
    scrapeInterval: operated.interval,
    scrapeTimeout: operated.timeout,
    evaluationInterval: operated.interval,
    // The monitors of every namespace, by the labels the platform's monitors carry.
    serviceMonitorSelector: selecting(operated.monitors),
    serviceMonitorNamespaceSelector: every,
    podMonitorSelector: selecting(operated.monitors),
    podMonitorNamespaceSelector: every,
    // Every scrape of k3s the render writes, and only those.
    scrapeConfigSelector: selecting(managedOnly()),
    scrapeConfigNamespaceSelector: every,
    // Every rule group the render writes, and only those.
    ruleSelector: selecting(managedOnly()),
    ruleNamespaceSelector: every,
    ...(alertmanager === undefined
      ? {}
      : {
          alerting: {
            alertmanagers: [
              {
                namespace: alertmanager.namespace,
                name: alertmanager.service,
                port: alertmanager.port,
                apiVersion: "v2" as const,
              },
            ],
          },
        }),
    // An absent field and an undefined one render alike: YAML drops the key.
    // Stryker disable next-line ConditionalExpression
    ...(retention === undefined ? {} : { retention }),
    // Stryker disable next-line ConditionalExpression
    ...(retentionSize === undefined ? {} : { retentionSize }),
    ...(flags.some(({ name }) => name === "web.enable-remote-write-receiver")
      ? { enableRemoteWriteReceiver: true as const }
      : {}),
    ...(features.length === 0
      ? {}
      : { enableFeatures: [...new Set(features)] }),
  };
}

/**
 * The operator's object that runs `process`: its pod, from the template the
 * render would have run it in, with the operator's own container patched by
 * the Process's environment, posture, mounts and probes. A claim mounted
 * where the operator keeps its data replaces the operator's own scratch
 * volume there.
 */
export function operatedWorkloadOf(
  process: ResolvedProcess,
  application: ResolvedApplicationDocument,
  template: PodTemplate,
): Prometheus | Alertmanager {
  notYet(process);
  const operated = process.operated as Operated;
  const operator = OPERATOR[operated.kind];
  const { metadata, spec } = template;
  const [container] = spec.containers as [PodSpec["containers"][number]];
  const flags = flagsOf(process);
  const fields = new Set(operator.fields);
  const additionalArgs = flags.filter(({ name }) => !fields.has(name));
  // An absent field and an undefined one render alike: YAML drops the key, so
  // each optional field below is carried as the pod template holds it.
  // Stryker disable ConditionalExpression,EqualityOperator,ObjectLiteral
  const patched: OperatedContainer = {
    name: operator.container,
    ...(container.env === undefined ? {} : { env: container.env }),
    securityContext: container.securityContext,
    ...(container.volumeMounts === undefined
      ? {}
      : { volumeMounts: container.volumeMounts }),
    ...(container.readinessProbe === undefined
      ? {}
      : { readinessProbe: container.readinessProbe }),
    ...(container.livenessProbe === undefined
      ? {}
      : { livenessProbe: container.livenessProbe }),
    ...(container.startupProbe === undefined
      ? {}
      : { startupProbe: container.startupProbe }),
  };
  // E_OPERATED_PROCESS refused a Process with other than one surface.
  const [surface] = process.surfaces as [
    NonNullable<ResolvedProcess["surfaces"]>[number],
  ];
  const pod = {
    image: process.image,
    ...(process.imageVersion === undefined
      ? {}
      : { version: process.imageVersion }),
    replicas: process.replicas,
    serviceAccountName: spec.serviceAccountName,
    automountServiceAccountToken: spec.automountServiceAccountToken,
    ...(spec.priorityClassName === undefined
      ? {}
      : { priorityClassName: spec.priorityClassName }),
    podMetadata: {
      labels: Object.fromEntries(
        Object.entries(metadata.labels).filter(
          ([key]) => !RESERVED.includes(key),
        ),
      ),
      ...(metadata.annotations === undefined
        ? {}
        : { annotations: metadata.annotations }),
    },
    portName: surface.name,
    securityContext: spec.securityContext,
    ...(spec.affinity === undefined ? {} : { affinity: spec.affinity }),
    resources: container.resources as NonNullable<typeof container.resources>,
    containers: [patched],
    ...(spec.volumes === undefined ? {} : { volumes: spec.volumes }),
    ...(additionalArgs.length === 0 ? {} : { additionalArgs }),
  };
  // Stryker restore ConditionalExpression,EqualityOperator,ObjectLiteral
  const objectMetadata = {
    name: process.name,
    namespace: application.namespace,
    labels: labelsOf(process, application.id),
  };
  if (operated.kind === "Prometheus")
    return {
      apiVersion: "monitoring.coreos.com/v1",
      kind: "Prometheus",
      metadata: objectMetadata,
      spec: { ...pod, ...prometheusOf(operated, flags) },
    };
  const retention = lastOf(flags, "data.retention");
  return {
    apiVersion: "monitoring.coreos.com/v1",
    kind: "Alertmanager",
    metadata: objectMetadata,
    spec: {
      ...pod,
      // The one routing of every alert, from every namespace.
      alertmanagerConfigSelector: selecting(managedOnly()),
      alertmanagerConfigMatcherStrategy: { type: "None" },
      // An absent field and an undefined one render alike: YAML drops the key.
      // Stryker disable next-line ConditionalExpression
      ...(retention === undefined ? {} : { retention }),
    },
  };
}
