// The `grafana` adapter (spec/v1/30-deliverables.md#adapters): one
// GrafanaDashboard per dashboard file an Application ships, in its own
// namespace and its Project's folder, for the Grafana instance the Platform
// document names. A vendored file's data source inputs map to that Grafana's
// data source, so nothing is fetched or edited at run time.
import type { ResolvedProject } from "../../model/resolution.ts";
import type {
  GrafanaDashboard,
  GrafanaInstance,
} from "../../objects/custom.ts";
import type { Deliverable } from "../../objects/deliverable.ts";
import { managedOnly } from "../shared/labels.ts";
import { applicationDirectory } from "../shared/paths.ts";

export const ADAPTER = "grafana";

/** A uid as a Kubernetes name: lower case, a hyphen for anything else. */
const nameOf = (application: string, uid: string): string =>
  `${application}-${uid.toLowerCase().replaceAll(/[^a-z0-9-]/g, "-")}`;

export function renderGrafana(project: ResolvedProject): Deliverable[] {
  return [...instancesOf(project), ...dashboardsOf(project)];
}

/**
 * The monitoring stack's Grafana as the operator reaches it
 * (spec/v1/14-platform-intent.md#grafanas-instance-and-data-sources): an
 * external instance carrying the labels every dashboard selects it by.
 */
function instancesOf(project: ResolvedProject): Deliverable[] {
  return project.applications.flatMap((application): Deliverable[] => {
    const { grafana } = application;
    if (grafana === undefined) return [];
    const { secret, user, password } = grafana.credential;
    return [
      {
        path: `${applicationDirectory(project.project, application.id)}/grafana.yaml`,
        adapter: ADAPTER,
        objects: [
          {
            apiVersion: "grafana.integreatly.org/v1beta1",
            kind: "Grafana",
            metadata: {
              name: application.id,
              namespace: application.namespace,
              labels: {
                ...grafana.labels,
                "app.kubernetes.io/part-of": application.id,
                ...managedOnly(),
              },
            },
            spec: {
              external: {
                url: grafana.url,
                adminUser: { name: secret, key: user },
                adminPassword: { name: secret, key: password },
              },
            },
          } satisfies GrafanaInstance,
        ],
      },
    ];
  });
}

function dashboardsOf(project: ResolvedProject): Deliverable[] {
  return project.applications.flatMap((application): Deliverable[] => {
    const { dashboards } = application;
    if (dashboards === undefined) return [];
    return [
      {
        path: `${applicationDirectory(project.project, application.id)}/dashboards.yaml`,
        adapter: ADAPTER,
        objects: dashboards.files.map(
          ({ uid, content, inputs }): GrafanaDashboard => ({
            apiVersion: "grafana.integreatly.org/v1beta1",
            kind: "GrafanaDashboard",
            metadata: {
              name: nameOf(application.id, uid),
              namespace: application.namespace,
              labels: {
                "app.kubernetes.io/part-of": application.id,
                ...managedOnly(),
              },
            },
            spec: {
              instanceSelector: { matchLabels: dashboards.instance },
              // The Grafana runs in its own Project's namespace.
              allowCrossNamespaceImport: true,
              folder: dashboards.folder,
              json: content,
              ...(inputs.length === 0
                ? {}
                : {
                    datasources: inputs.map((inputName) => ({
                      inputName,
                      datasourceName: dashboards.datasource,
                    })),
                  }),
            },
          }),
        ),
      },
    ];
  });
}
