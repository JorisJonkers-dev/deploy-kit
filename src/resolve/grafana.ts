// The monitoring stack's Grafana, as the Grafana operator reaches it
// (spec/v1/14-platform-intent.md#grafanas-instance-and-data-sources): the admin
// credential the Vault policy job generates for it and both read, the
// instance every dashboard selects, and the data sources its edges into the
// monitoring stack derive.
import type {
  EffectiveApplication,
  EffectiveProcess,
} from "../model/effective-intent.ts";
import type { Hasher } from "../model/hasher.ts";
import {
  applicationOf,
  holds,
  type PlatformIntentDocument,
} from "../model/platform-intent.ts";
import { GENERATED_DEFAULTS } from "../model/project-intent-queries.ts";
import type {
  ResolvedApplicationDocument,
  ResolvedProcess,
} from "../model/resolved-deployment.ts";
import { namespaceOf } from "../model/runtime-profiles.ts";
import { destinationOf } from "./secrets.ts";

type ResolvedGrant = NonNullable<ResolvedProcess["secrets"]>[number];
type EnvEntry = NonNullable<ResolvedProcess["environment"]>[number];
type ResolvedAsset = NonNullable<ResolvedProcess["assets"]>[number];
type Instance = NonNullable<ResolvedApplicationDocument["grafana"]>;

/** The two keys of Grafana's admin credential, and the variables Grafana reads them from. */
const ADMIN = [
  { key: "user", variable: "GF_SECURITY_ADMIN_USER" },
  { key: "password", variable: "GF_SECURITY_ADMIN_PASSWORD" },
] as const;

/** Where the admin credential of a Project's Grafana is generated: under the Project's own prefix. */
export const adminPathOf = (project: string, application: string): string =>
  `secret/data/${namespaceOf(project)}/${application}-admin`;

/** Where Grafana provisions the data sources the render derives. */
export const DATASOURCES_AT =
  "/etc/grafana/provisioning/datasources/datasources.yaml";
const DATASOURCES_FILE = "datasources.yaml";
/** How many hex digits of an Asset's content digest its name carries. */
const CONTENT_DIGITS = 10;

interface Context {
  readonly platform: PlatformIntentDocument;
  readonly project: string;
}

/** Whether the Process is the one the operator reaches: the Grafana role's first. */
const isGrafana = (
  process: Pick<EffectiveProcess, "name">,
  application: EffectiveApplication,
  { platform, project }: Context,
): boolean =>
  holds(platform.monitoring?.grafana, project, application.id) &&
  (application.processes[0] as EffectiveProcess).name === process.name;

/**
 * The admin credential the Grafana role's Process holds: one generated
 * document under its Project's prefix, read into the two variables Grafana
 * creates its admin from.
 */
export function grafanaAdminOf(
  process: EffectiveProcess,
  application: EffectiveApplication,
  context: Context,
): {
  readonly grants: readonly ResolvedGrant[];
  readonly environment: readonly EnvEntry[];
} {
  if (!isGrafana(process, application, context))
    return { grants: [], environment: [] };
  const path = adminPathOf(context.project, application.id);
  return {
    grants: [
      {
        path,
        keys: ADMIN.map(({ key }) => key),
        generated: ADMIN.map(({ key }) => ({ key, ...GENERATED_DEFAULTS })),
        access: "read",
        delivery: "env",
        destination: destinationOf(process.name, path),
        restartTargets: [process.name],
      },
    ],
    environment: ADMIN.map(({ key, variable }) => ({
      name: variable,
      secret: { path, key },
    })),
  };
}

/** Each kind of data source, in the order Grafana lists them, its name and its type. */
const KINDS = [
  ["prometheus", "Prometheus", "prometheus"],
  ["loki", "Loki", "loki"],
  ["tempo", "Tempo", "tempo"],
  ["pyroscope", "Pyroscope", "grafana-pyroscope-datasource"],
  ["alertmanager", "Alertmanager", "alertmanager"],
] as const;
type Kind = (typeof KINDS)[number][0];

/** The Application each kind of data source is, as the Platform document names it. */
function rolesOf(platform: PlatformIntentDocument): ReadonlyMap<string, Kind> {
  const monitoring = platform.monitoring as NonNullable<
    PlatformIntentDocument["monitoring"]
  >;
  const named: [Kind, string | undefined][] = [
    ["prometheus", monitoring.prometheus],
    ["alertmanager", monitoring.alertmanager],
    ["loki", monitoring.stores?.loki],
    ["tempo", monitoring.stores?.tempo],
    ["pyroscope", monitoring.stores?.pyroscope],
  ];
  return new Map(
    named.flatMap(([kind, reference]): [string, Kind][] =>
      reference === undefined ? [] : [[applicationOf(reference), kind]],
    ),
  );
}

/** What links one data source to the others the set holds: traces to logs, metrics and profiles. */
function linksOf(kind: Kind, held: ReadonlySet<Kind>): Record<string, unknown> {
  const tags = [{ key: "service.name", value: "service_name" }];
  if (kind === "prometheus")
    return {
      httpMethod: "POST",
      ...(held.has("tempo")
        ? {
            exemplarTraceIdDestinations: [
              { name: "traceID", datasourceUid: "tempo" },
            ],
          }
        : {}),
    };
  if (kind === "loki")
    return held.has("tempo")
      ? {
          derivedFields: [
            {
              name: "trace_id",
              matcherRegex: String.raw`"trace_id"\s*:\s*"([0-9a-f]+)"`,
              datasourceUid: "tempo",
              url: "$${__value.raw}",
            },
          ],
        }
      : {};
  if (kind === "tempo")
    return {
      nodeGraph: { enabled: true },
      ...(held.has("loki")
        ? {
            tracesToLogsV2: {
              datasourceUid: "loki",
              filterByTraceID: true,
              tags,
            },
          }
        : {}),
      ...(held.has("prometheus")
        ? {
            tracesToMetrics: { datasourceUid: "prometheus", tags },
            serviceMap: { datasourceUid: "prometheus" },
          }
        : {}),
      ...(held.has("pyroscope")
        ? {
            tracesToProfilesV2: {
              datasourceUid: "pyroscope",
              profileTypeId: "process_cpu:cpu:nanoseconds:cpu:nanoseconds",
              tags,
            },
          }
        : {}),
    };
  if (kind === "alertmanager")
    return { implementation: "prometheus", handleGrafanaManagedAlerts: false };
  return {};
}

/**
 * The data sources the Grafana role's Process derives: one per edge it
 * declares into an Application the monitoring stack names, at that edge's
 * address, with the kind's own uid, linked to the others the set holds.
 */
export function datasourcesOf(
  resolved: ResolvedProcess,
  application: EffectiveApplication,
  context: Context & { readonly hash: Hasher },
): ResolvedAsset | undefined {
  if (!isGrafana(resolved, application, context)) return undefined;
  const roles = rolesOf(context.platform);
  const addresses = new Map<Kind, string>();
  // Stryker disable next-line ArrayDeclaration: no list and an empty one hold no edge alike.
  for (const { application: id, address } of resolved.dependencies ?? []) {
    const kind = roles.get(id);
    // A store reached twice is one data source, at the later edge's address.
    if (kind !== undefined) addresses.set(kind, address);
  }
  if (addresses.size === 0) return undefined;
  const held = new Set(addresses.keys());
  const datasources = KINDS.filter(([kind]) => held.has(kind)).map(
    ([kind, name, type]) => ({
      name,
      type,
      uid: kind,
      access: "proxy",
      url: `http://${addresses.get(kind) as string}`,
      isDefault: kind === "prometheus",
      editable: false,
      jsonData: linksOf(kind, held),
    }),
  );
  const content = `${JSON.stringify({ apiVersion: 1, datasources }, null, 2)}\n`;
  const digest = context.hash(content).split(":")[1] as string;
  return {
    name: `${resolved.name}-datasources-yaml-${digest.slice(0, CONTENT_DIGITS)}`,
    from: DATASOURCES_FILE,
    mountAt: DATASOURCES_AT,
    content,
  };
}

/**
 * The instance the Grafana operator imports every dashboard into: the Grafana
 * role's Application, where the Platform document says which labels its
 * dashboards select, reached at its Process's `http` surface and signed in to
 * with the credential it generates.
 */
export function grafanaInstanceOf(
  application: EffectiveApplication,
  processes: readonly ResolvedProcess[],
  context: Context,
): { readonly grafana?: Instance } {
  const instance = context.platform.telemetry?.dashboards?.instance;
  if (
    instance === undefined ||
    !holds(
      context.platform.monitoring?.grafana,
      context.project,
      application.id,
    )
  )
    return {};
  const process = processes[0] as ResolvedProcess;
  // Stryker disable next-line ArrayDeclaration: no list and an empty one hold no surface alike.
  const surface = (process.surfaces ?? []).find(({ name }) => name === "http");
  if (surface === undefined) return {};
  const path = adminPathOf(context.project, application.id);
  return {
    grafana: {
      labels: instance,
      url: `http://${process.name}.${namespaceOf(context.project)}:${String(surface.port)}`,
      credential: {
        secret: destinationOf(process.name, path),
        user: ADMIN[0].key,
        password: ADMIN[1].key,
      },
    },
  };
}
