// k3s's own components, scraped by the metrics stack from its own namespace
// (spec/v1/14-platform-intent.md#k3ss-metrics): k3s is in the bootstrap set,
// so none of them is a Process a scrape surface names, and each is selected by
// what its install gives it. The scrape authenticates as the stack's own
// ServiceAccount, with the read the scrape takes and nothing more.
import type { ResolvedProject } from "../../model/resolution.ts";
import type {
  ApiServerMonitor,
  CoreDnsMonitor,
  Relabeling,
  ScrapeAuthorization,
  ScrapeConfig,
  ServiceAccountToken,
} from "../../objects/custom.ts";
import type { Deliverable, RenderedObject } from "../../objects/deliverable.ts";
import type {
  ClusterRole,
  ClusterRoleBinding,
} from "../../objects/kubernetes.ts";
import { managedOnly } from "../shared/labels.ts";
import { applicationDirectory } from "../shared/paths.ts";

type Scrape = NonNullable<ResolvedProject["applications"][number]["k3sScrape"]>;

/** The kubelet's three endpoints, and what each keeps. */
const KUBELET = [
  ["kubelet", "/metrics", []],
  [
    "kubelet-cadvisor",
    "/metrics/cadvisor",
    [
      "container_cpu_(cfs_throttled_seconds_total|load_average_10s|system_seconds_total|user_seconds_total)",
      "container_fs_(io_current|io_time_seconds_total|io_time_weighted_seconds_total|reads_merged_total|sector_reads_total|sector_writes_total|writes_merged_total)",
      "container_memory_(mapped_file|swap)",
      "container_(file_descriptors|tasks_state|threads_max)",
      "container_spec.*",
    ],
  ],
  ["kubelet-probes", "/metrics/probes", []],
] as const;

/** The API server's latency buckets no default rule reads. */
const API_SERVER_BUCKETS = String.raw`(etcd_request|apiserver_request_slo|apiserver_request_sli|apiserver_request)_duration_seconds_bucket;(0\.15|0\.2|0\.3|0\.35|0\.4|0\.45|0\.6|0\.7|0\.8|0\.9|1\.25|1\.5|1\.75|2|3|3\.5|4|4\.5|6|7|8|9|15|20|40|45|50)(\.0)?`;

/** The pods of the cluster's DNS, by the label k3s's install gives them. */
const CORE_DNS = { "k8s-app": "kube-dns" };

/** What the scrapes may read: every node, its kubelet's metrics, and the API server's. */
const RULES: ClusterRole["rules"] = [
  { apiGroups: [""], resources: ["nodes"], verbs: ["get", "list", "watch"] },
  { apiGroups: [""], resources: ["nodes/metrics"], verbs: ["get"] },
];

const dropping = (names: readonly string[]): Relabeling[] =>
  names.map((regex) => ({
    action: "drop" as const,
    sourceLabels: ["__name__"],
    regex,
  }));

function objectsOf(
  scrape: Scrape,
  namespace: string,
  part: string,
): RenderedObject[] {
  const token = `${scrape.identity}-token`;
  const name = `${namespace}-${scrape.identity}-k3s`;
  const labels = {
    ...scrape.labels,
    "app.kubernetes.io/part-of": part,
    ...managedOnly(),
  };
  const own = { "app.kubernetes.io/part-of": part, ...managedOnly() };
  const authorization: ScrapeAuthorization = {
    type: "Bearer",
    credentials: { name: token, key: "token" },
  };
  const cadence = {
    interval: scrape.interval,
    scrapeTimeout: scrape.timeout,
  };
  const { kubelet, apiServer, coreDns } = scrape;
  return [
    {
      apiVersion: "v1",
      kind: "Secret",
      metadata: {
        name: token,
        namespace,
        labels: own,
        annotations: { "kubernetes.io/service-account.name": scrape.identity },
      },
      type: "kubernetes.io/service-account-token",
    } satisfies ServiceAccountToken,
    {
      apiVersion: "rbac.authorization.k8s.io/v1",
      kind: "ClusterRole",
      metadata: { name, labels: own },
      rules: [
        ...RULES,
        // The API server's metrics are no object a resource rule names.
        { nonResourceURLs: ["/metrics"], verbs: ["get"] },
      ],
    } satisfies ClusterRole,
    {
      apiVersion: "rbac.authorization.k8s.io/v1",
      kind: "ClusterRoleBinding",
      metadata: { name, labels: own },
      roleRef: {
        apiGroup: "rbac.authorization.k8s.io",
        kind: "ClusterRole",
        name,
      },
      subjects: [{ kind: "ServiceAccount", name: scrape.identity, namespace }],
    } satisfies ClusterRoleBinding,
    ...(kubelet === undefined
      ? []
      : KUBELET.map(([object, path, dropped]): ScrapeConfig => ({
          apiVersion: "monitoring.coreos.com/v1alpha1",
          kind: "ScrapeConfig",
          metadata: { name: object, namespace, labels },
          spec: {
            jobName: "kubelet",
            kubernetesSDConfigs: [{ role: "Node" }],
            scheme: "HTTPS",
            metricsPath: path,
            scrapeInterval: scrape.interval,
            scrapeTimeout: scrape.timeout,
            honorLabels: true,
            honorTimestamps: true,
            authorization,
            // The kubelet's serving certificate is its own, signed by no
            // authority the pod holds.
            tlsConfig: { insecureSkipVerify: true },
            relabelings: [
              {
                sourceLabels: ["__address__"],
                regex: "(.+):\\d+",
                replacement: `$1:${String(kubelet.port)}`,
                targetLabel: "__address__",
              },
              {
                sourceLabels: ["__meta_kubernetes_node_name"],
                targetLabel: "node",
              },
              {
                sourceLabels: ["__metrics_path__"],
                targetLabel: "metrics_path",
              },
            ],
            ...(dropped.length === 0
              ? {}
              : { metricRelabelings: dropping(dropped) }),
          },
        }))),
    ...(apiServer === undefined
      ? []
      : [
          {
            apiVersion: "monitoring.coreos.com/v1",
            kind: "ServiceMonitor",
            metadata: { name: "apiserver", namespace, labels },
            spec: {
              jobLabel: "component",
              selector: {
                matchLabels: { component: "apiserver", provider: "kubernetes" },
              },
              namespaceSelector: { matchNames: [apiServer.namespace] },
              endpoints: [
                {
                  port: apiServer.port,
                  scheme: "https",
                  ...cadence,
                  authorization,
                  tlsConfig: {
                    ca: {
                      configMap: { name: "kube-root-ca.crt", key: "ca.crt" },
                    },
                    serverName: apiServer.service,
                  },
                  metricRelabelings: [
                    {
                      action: "drop",
                      sourceLabels: ["__name__", "le"],
                      regex: API_SERVER_BUCKETS,
                    },
                  ],
                },
              ],
            },
          } satisfies ApiServerMonitor,
        ]),
    ...(coreDns === undefined
      ? []
      : [
          {
            apiVersion: "monitoring.coreos.com/v1",
            kind: "PodMonitor",
            metadata: { name: "coredns", namespace, labels },
            spec: {
              jobLabel: "k8s-app",
              selector: { matchLabels: CORE_DNS },
              namespaceSelector: { matchNames: [coreDns.namespace] },
              podMetricsEndpoints: [
                {
                  portNumber: coreDns.port,
                  path: "/metrics",
                  ...cadence,
                  relabelings: [{ targetLabel: "job", replacement: "coredns" }],
                },
              ],
            },
          } satisfies CoreDnsMonitor,
        ]),
  ];
}

export function k3sMonitorsOf(
  project: ResolvedProject,
  adapter: string,
): Deliverable[] {
  return project.applications.flatMap((application): Deliverable[] => {
    const { k3sScrape } = application;
    if (k3sScrape === undefined) return [];
    return [
      {
        path: `${applicationDirectory(project.project, application.id)}/k3s-monitors.yaml`,
        adapter,
        objects: objectsOf(k3sScrape, application.namespace, application.id),
      },
    ];
  });
}
