// The `prometheus` adapter (spec/v1/30-deliverables.md#adapters): one monitor
// per Application that declares observability. A scraped blue-green Process is
// scraped by a PodMonitor, because its Services are Flagger's and the
// canary's pods must be scraped for the Release Gate's checks; a stop-start one
// by a ServiceMonitor over the Service the render gives it.
import type { ResolvedProject } from "../../model/resolution.ts";
import type { Deliverable } from "../../objects/deliverable.ts";
import { instanceOf, labelsOf } from "../shared/labels.ts";
import { applicationDirectory } from "../shared/paths.ts";
import { notSupported } from "../../model/internal-failure.ts";

export const ADAPTER = "prometheus";

export function renderPrometheus(project: ResolvedProject): Deliverable[] {
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
      labels: labelsOf(process, application.id),
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
