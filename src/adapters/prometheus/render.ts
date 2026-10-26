// The `prometheus` adapter (spec/v1/30-deliverables.md#adapters): one monitor
// per Application that declares observability. A scraped blue-green Process is
// scraped by a PodMonitor, because its Services are Flagger's and the
// canary's pods must be scraped for the Release Gate's checks; a stop-start one
// by a ServiceMonitor over the Service the render gives it.
import type { ResolvedProject } from "../../model/resolution.ts";
import type {
  AlertmanagerConfig,
  PrometheusRule,
} from "../../objects/custom.ts";
import type { Deliverable } from "../../objects/deliverable.ts";
import { instanceOf, labelsOf, managedOnly } from "../shared/labels.ts";
import { applicationDirectory } from "../shared/paths.ts";
import { notSupported } from "../../model/internal-failure.ts";

export const ADAPTER = "prometheus";

/** A rule file's name as a Kubernetes name: its base name, lower case. */
export const ruleNameOf = (application: string, from: string): string =>
  `${application}-${(from.split("/").pop() as string)
    .replace(/\.ya?ml$/, "")
    .toLowerCase()
    .replaceAll(/[^a-z0-9-]/g, "-")}`;

/**
 * The monitoring stack's rule groups, one PrometheusRule per file, and the one
 * routing of every alert (spec/v1/14-platform-intent.md#monitoring): alerts
 * that match no severity route reach the `null` receiver, which delivers
 * nothing.
 */
function alertingOf(project: ResolvedProject): Deliverable[] {
  return project.applications.flatMap((application): Deliverable[] => {
    const directory = applicationDirectory(project.project, application.id);
    const labels = {
      "app.kubernetes.io/part-of": application.id,
      ...managedOnly(),
    };
    const { alertRules, alerting } = application;
    return [
      ...(alertRules === undefined
        ? []
        : [
            {
              path: `${directory}/alertrules.yaml`,
              adapter: ADAPTER,
              objects: alertRules.map(({ from, groups }): PrometheusRule => ({
                apiVersion: "monitoring.coreos.com/v1",
                kind: "PrometheusRule",
                metadata: {
                  name: ruleNameOf(application.id, from),
                  namespace: application.namespace,
                  labels,
                },
                spec: { groups },
              })),
            },
          ]),
      ...(alerting === undefined
        ? []
        : [
            {
              path: `${directory}/alertmanagerconfig.yaml`,
              adapter: ADAPTER,
              objects: [
                {
                  apiVersion: "monitoring.coreos.com/v1alpha1",
                  kind: "AlertmanagerConfig",
                  metadata: {
                    name: "estate-alerts",
                    namespace: application.namespace,
                    labels,
                  },
                  spec: {
                    route: {
                      receiver: "null",
                      groupBy: ["alertname", "namespace"],
                      groupWait: "1m",
                      groupInterval: "5m",
                      repeatInterval: "12h",
                      routes: alerting.routes.map(
                        ({ severity, receiver, repeat }) => ({
                          matchers: [{ name: "severity", value: severity }],
                          receiver,
                          repeatInterval: repeat,
                        }),
                      ),
                    },
                    receivers: [
                      { name: "null" },
                      ...alerting.receivers.map(({ name, discord }) => ({
                        name,
                        discordConfigs: [
                          {
                            apiURL: { name: discord.secret, key: discord.key },
                            sendResolved: true,
                          },
                        ],
                      })),
                    ],
                  },
                } satisfies AlertmanagerConfig,
              ],
            },
          ]),
    ];
  });
}

export function renderPrometheus(project: ResolvedProject): Deliverable[] {
  return [...monitorsOf(project), ...alertingOf(project)];
}

function monitorsOf(project: ResolvedProject): Deliverable[] {
  return project.applications.flatMap((application): Deliverable[] => {
    const { scrape } = application;
    if (scrape === undefined) return [];
    // The scrape names a Process of this Application, or E_UNKNOWN_PROCESS refused it.
    const process = application.processes.find(
      ({ name }) => name === scrape.process,
    ) as (typeof application.processes)[number];
    if (
      process.switchover !== "blue-green" &&
      process.switchover !== "stop-start"
    )
      throw notSupported(
        `${process.name}: a monitor for a Process that switches ${process.switchover ?? "nothing"} is not rendered yet`,
      );
    const metadata = {
      name: process.name,
      namespace: application.namespace,
      // The monitoring stack's selector, which the render's own labels never
      // give way to.
      labels: { ...scrape.labels, ...labelsOf(process, application.id) },
    };
    const endpoint = {
      port: scrape.surface,
      path: scrape.path,
      interval: scrape.interval,
      scrapeTimeout: scrape.timeout,
    };
    // Flagger copies `instance` unchanged, so a series keeps its job.
    const selection = {
      jobLabel: "app.kubernetes.io/instance",
      selector: { matchLabels: instanceOf(process.name) },
      namespaceSelector: { matchNames: [application.namespace] },
    };
    const directory = applicationDirectory(project.project, application.id);
    if (process.switchover === "stop-start")
      return [
        {
          path: `${directory}/servicemonitor.yaml`,
          adapter: ADAPTER,
          objects: [
            {
              apiVersion: "monitoring.coreos.com/v1",
              kind: "ServiceMonitor",
              metadata,
              spec: { ...selection, endpoints: [endpoint] },
            },
          ],
        },
      ];
    return [
      {
        path: `${directory}/podmonitor.yaml`,
        adapter: ADAPTER,
        objects: [
          {
            apiVersion: "monitoring.coreos.com/v1",
            kind: "PodMonitor",
            metadata,
            spec: { ...selection, podMetricsEndpoints: [endpoint] },
          },
        ],
      },
    ];
  });
}
