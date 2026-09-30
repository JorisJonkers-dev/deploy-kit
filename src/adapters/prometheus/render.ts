// The `prometheus` adapter (spec/v1/30-deliverables.md#adapters): one monitor
// per Application that declares observability. A scraped blue-green Process is
// scraped by a PodMonitor, because its Services are Flagger's and the
// canary's pods must be scraped for the Release Gate's checks.
import type { ResolvedProject } from "../../model/resolution.ts";
import type { Deliverable } from "../../objects/deliverable.ts";
import { instanceOf, labelsOf } from "../shared/labels.ts";
import { applicationDirectory } from "../shared/paths.ts";

export const ADAPTER = "prometheus";

export function renderPrometheus(project: ResolvedProject): Deliverable[] {
  return project.applications.flatMap((application) => {
    const { scrape } = application;
    if (scrape === undefined) return [];
    // The scrape names a Process of this Application, or E_UNKNOWN_PROCESS refused it.
    const process = application.processes.find(
      ({ name }) => name === scrape.process,
    ) as (typeof application.processes)[number];
    if (process.switchover !== "blue-green")
      throw new Error(
        `${process.name}: a ServiceMonitor for a Process that switches ${process.switchover ?? "nothing"} is not rendered yet`,
      );
    return [
      {
        path: `${applicationDirectory(project.project, application.id)}/podmonitor.yaml`,
        adapter: ADAPTER,
        objects: [
          {
            apiVersion: "monitoring.coreos.com/v1",
            kind: "PodMonitor",
            metadata: {
              name: process.name,
              namespace: application.namespace,
              labels: labelsOf(process, application.id),
            },
            spec: {
              // Flagger copies `instance` unchanged, so a series keeps its job.
              jobLabel: "app.kubernetes.io/instance",
              selector: { matchLabels: instanceOf(process.name) },
              namespaceSelector: { matchNames: [application.namespace] },
              podMetricsEndpoints: [
                {
                  port: scrape.surface,
                  path: scrape.path,
                  interval: scrape.interval,
                  scrapeTimeout: scrape.timeout,
                },
              ],
            },
          },
        ],
      },
    ];
  });
}
