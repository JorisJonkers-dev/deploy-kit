// The authoring shape of the Platform document, schemaVersion 1, as
// spec/v1/14-platform-intent.md defines it. Class ids name what the descriptor
// and the generated JSON Schema call each block, and never collide with a
// Project Intent class: a policy keyed by a closed vocabulary is a class with
// one optional feature per literal, so a missing policy is an absent feature.
import { z } from "zod";
import { stated, type ShapeRule } from "./shape-rule.ts";
import {
  AUDIENCES,
  LIBRARY_ACCESS,
  MOVE_BREAKS,
  MOVE_REVERSE,
} from "./vocabularies.ts";

// The closed vocabularies of spec/v1/14-platform-intent.md, each declared once.

export const DATASTORES = ["sqlite", "etcd"] as const;
export const POLICY_CONTROLLERS = ["none", "embedded", "cni"] as const;
export const LISTENERS = ["tls", "plain"] as const;
export const CERTIFICATE_SOURCES = ["acme", "none"] as const;
export const HARDENING_CLASSES = ["restricted"] as const;
/** Who forwards clients' requests to a tier's edge, where anyone does. */
export const FORWARDERS = ["cloudflare"] as const;
/** Who answers an ACME DNS challenge for a tier's names. */
export const DNS_PROVIDERS = ["cloudflare"] as const;
/** The built-in cluster roles a Human Grant may bind, and no other. */
export const HUMAN_GRANT_ROLES = [
  "cluster-admin",
  "admin",
  "edit",
  "view",
] as const;

export type Datastore = (typeof DATASTORES)[number];
export type PolicyController = (typeof POLICY_CONTROLLERS)[number];
export type Listener = (typeof LISTENERS)[number];
export type CertificateSource = (typeof CERTIFICATE_SOURCES)[number];
export type HardeningClass = (typeof HARDENING_CLASSES)[number];
export type Forwarder = (typeof FORWARDERS)[number];
export type DnsProvider = (typeof DNS_PROVIDERS)[number];
export type HumanGrantRole = (typeof HUMAN_GRANT_ROLES)[number];

const text = z.string().min(1);
const count = z.int().min(1);
/** A share of requests, as a percentage up to 100 with at most two decimals. */
export const ERROR_RATE = /^(100|\d{1,2}(\.\d{1,2})?)%$/;
/** A latency bound: whole milliseconds or seconds. */
export const LATENCY = /^[1-9]\d*(ms|s)$/;
const port = z.int().min(1).max(65535);
/**
 * An email address, as an ACME account is registered with: one `@` between a
 * local part and a dotted domain, written out here so the published schema
 * does not move with the validator's own default.
 */
export const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
/** One IPv4 address, as a resolver is named. */
export const IPV4 =
  /^((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/;
/** An IPv4 range in CIDR notation, `192.168.0.98/32` for one address. */
export const IPV4_CIDR =
  /^((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\/(3[0-2]|[12]?\d)$/;
/**
 * An L4 Address's name: a DNS label, since it names the Service an exposure on
 * it renders and the pool the Service asks its address from.
 */
export const L4_ADDRESS_NAME = /^[a-z]([a-z0-9-]{0,30}[a-z0-9])?$/;

/**
 * A privileged role's holder: the Project that may hold it and the Application
 * it declares, as `<project>/<application>`
 * (spec/v1/14-platform-intent.md#privileged-roles). The id alone binds nothing,
 * so a project file cannot claim a role by declaring an Application under it.
 */
export const HOLDER = /^[^/\s]+\/[^/\s]+$/;
const holder = z.string().regex(HOLDER).meta({ reference: "Application" });

/** Whether `reference` names the Application `id` that `project` declares. */
export const holds = (
  reference: string | undefined,
  project: string,
  id: string,
): boolean => reference === `${project}/${id}`;

/** The Application a holder names, without its Project. */
export const applicationOf = (reference: string): string =>
  reference.slice(reference.indexOf("/") + 1);

const audience = z.enum(AUDIENCES).meta({ id: "Audience" });
const datastore = z.enum(DATASTORES).meta({ id: "Datastore" });
const policyController = z
  .enum(POLICY_CONTROLLERS)
  .meta({ id: "PolicyController" });
const listener = z.enum(LISTENERS).meta({ id: "Listener" });
const certificateSource = z
  .enum(CERTIFICATE_SOURCES)
  .meta({ id: "CertificateSource" });
const hardeningClass = z.enum(HARDENING_CLASSES).meta({ id: "HardeningClass" });
const forwarder = z.enum(FORWARDERS).meta({ id: "ProxiedBy" });

const metadata = z
  .strictObject({ cluster: text, project: text, nodeContract: text })
  .meta({ id: "PlatformMetadata" });

const substrate = z
  .strictObject({
    kubernetesVersion: text,
    datastore,
    serverCount: count,
    secretsEncryption: z.boolean(),
    cni: text,
    networkPolicyController: policyController,
    // The namespace the cluster's DNS runs in, which every egress policy
    // admits on port 53 (spec/v1/16-dependencies.md#the-baseline).
    clusterDns: text,
    // The resolvers a Process that serves DNS resolves through instead of the
    // cluster's DNS, which it must not depend on
    // (spec/v1/14-platform-intent.md#substrate-facts).
    upstreamNameservers: z.array(z.string().regex(IPV4)).min(1).exactOptional(),
    // The longest an image pull takes on the slowest node a pod may land on,
    // which every derived deadline allows on top of the Process's own start
    // (spec/v1/14-platform-intent.md#substrate-facts).
    imagePull: text.exactOptional(),
  })
  .meta({ id: "Substrate" });

// Where each Project's render is published and who signs it
// (spec/v1/55-delivery.md#rendered-artifacts-and-pins): one artifact per
// Project under `repository`, verified keyless against the signer's identity,
// and pulled with the Secret `pullSecret` names where the repository is
// private.
const renderedArtifacts = z
  .strictObject({
    repository: text,
    signer: z
      .strictObject({ issuer: text, subject: text })
      .meta({ id: "ArtifactSigner" }),
    pullSecret: text.optional(),
  })
  .meta({ id: "RenderedArtifacts" });

// Where Flux's controllers serve their metrics, as Flux's own install sets
// them (spec/v1/14-platform-intent.md#fluxs-metrics): Flux is no Process, so
// no scrape surface can name it.
const fluxMetrics = z
  .strictObject({ port, path: text })
  .meta({ id: "FluxMetrics" });

const bootstrap = z
  .strictObject({
    flux: z
      .strictObject({
        sourceRef: text,
        artifacts: renderedArtifacts,
        metrics: fluxMetrics.exactOptional(),
      })
      .meta({ id: "FluxSource" }),
    vault: z.strictObject({ unsealed: z.boolean() }).meta({ id: "VaultState" }),
    crds: z.array(text).min(1),
  })
  .meta({ id: "Bootstrap" });

// Who answers a tier's forward-auth (spec/v1/14-platform-intent.md#tiers): a
// declared Application by reference, the surface it answers on and the path it
// answers at, never a URL, so the address follows the provider. The response
// headers are the ones the edge hands on to the route's Process.
const forwardAuth = z
  .strictObject({
    provider: holder,
    surface: text,
    path: z.string().regex(/^(\/[A-Za-z0-9._~!$&'()*+,;=:@%-]+)+\/?$/),
    responseHeaders: z
      .array(z.string().regex(/^[A-Za-z0-9-]+$/))
      .min(1)
      .exactOptional(),
  })
  .meta({ id: "ForwardAuth" });

export type ForwardAuth = z.output<typeof forwardAuth>;

const tier = z
  .strictObject({
    name: text,
    audiences: z.array(audience).min(1),
    listener,
    certificates: certificateSource,
    forwardAuth: forwardAuth.exactOptional(),
    // Absent where clients connect to the edge themselves.
    proxiedBy: forwarder.exactOptional(),
    // The platform Application whose proxy this tier is, declared in a project
    // file the platform owns: a reference into another document.
    traefik: holder,
    // The ingress class the tier's proxy admits routes of, and external-dns
    // filters records on (spec/v1/14-platform-intent.md#tiers): a Kubernetes
    // name, since it is written as an annotation's value.
    ingressClass: z
      .string()
      .regex(/^[a-z0-9]([-a-z0-9]{0,61}[a-z0-9])?$/)
      .exactOptional(),
    // Where the tier's public names point, and whether the DNS provider
    // proxies them (spec/v1/14-platform-intent.md#tiers), and where a name it
    // does not proxy points instead: the address a client dials the tier's
    // edge at. Absent where the tier's names are not published.
    dns: z
      .strictObject({
        target: text,
        proxied: z.boolean(),
        direct: text.exactOptional(),
      })
      .meta({ id: "TierDns" })
      .exactOptional(),
    // The L4 Address the proxy listens on, by its name in `l4Addresses`: its
    // ports follow from `listener`, and no project file writes them.
    address: z.string().regex(L4_ADDRESS_NAME).exactOptional(),
  })
  .meta({ id: "Tier" });

// How an `acme` tier's proxy registers and proves its names
// (spec/v1/14-platform-intent.md#tiers): the account's email, the DNS provider
// that answers the challenge, and the Secret Store path of its token, which
// the proxy alone reads.
const acmePolicy = z
  .strictObject({
    email: z.string().regex(EMAIL),
    dnsProvider: z.enum(DNS_PROVIDERS).meta({ id: "DnsProvider" }),
    token: text,
  })
  .meta({ id: "AcmePolicy" });

export type AcmePolicy = z.output<typeof acmePolicy>;

// Where an off-cluster copy's traffic goes, as a network policy can say it: a
// policy admits an address range and a port, never a hostname
// (spec/v1/14-platform-intent.md#durability-policy).
const destinationRange = z
  .strictObject({ cidr: text, port })
  .meta({ id: "DestinationRange" });

const offClusterCopy = z
  .strictObject({
    destination: text,
    credential: text,
    // The age public key every copy is encrypted to before it leaves the
    // cluster; the private key is kept off it
    // (spec/v1/14-platform-intent.md#durability-policy).
    recipient: z.string().regex(/^age1[02-9ac-hj-np-z]{58}$/),
    egress: z.array(destinationRange).min(1),
  })
  .meta({ id: "OffClusterCopy" });

const durabilityPolicy = z
  .strictObject({
    schedule: text.exactOptional(),
    retain: count.exactOptional(),
    offCluster: offClusterCopy.exactOptional(),
  })
  .meta({ id: "DurabilityPolicy" });

const durabilityPolicies = z
  .strictObject({
    reconstructible: durabilityPolicy.exactOptional(),
    recoverable: durabilityPolicy.exactOptional(),
    irreplaceable: durabilityPolicy.exactOptional(),
  })
  .meta({ id: "DurabilityPolicies" });

// How an engine's data is carried from one Instance to another
// (spec/v1/14-platform-intent.md#move-methods): the method's image, which
// change of the version needs a Move, and when it can replicate back.
const moveMethod = z
  .strictObject({
    image: text,
    breaksOn: z.enum(MOVE_BREAKS).meta({ id: "MoveBreak" }),
    reverse: z.enum(MOVE_REVERSE).meta({ id: "MoveReverse" }),
  })
  .meta({ id: "MoveMethod" });

// The method image, and the surface of the Process it connects to where it
// dumps over the network. An engine whose method reads the volume alone names
// none. An engine whose Processes own databases or buckets may name the method
// that applies their catalog, and the surface it applies it over where that is
// not `surface` (spec/v1/14-platform-intent.md#catalog-methods).
const enginePolicy = z
  .strictObject({
    backup: text,
    surface: text.exactOptional(),
    catalog: text.exactOptional(),
    catalogSurface: text.exactOptional(),
    move: moveMethod.exactOptional(),
  })
  .meta({ id: "EnginePolicy" });

const enginePolicies = z
  .strictObject({
    postgres: enginePolicy.exactOptional(),
    rabbitmq: enginePolicy.exactOptional(),
    valkey: enginePolicy.exactOptional(),
    mongo: enginePolicy.exactOptional(),
    files: enginePolicy.exactOptional(),
    s3: enginePolicy.exactOptional(),
  })
  .meta({ id: "EnginePolicies" });

// A Kubernetes label key and value: the monitoring stack selects its monitors
// by a label set the platform names, so a render never writes one the API
// server refuses.
const labelKey = z
  .string()
  .regex(
    /^([a-z0-9]([a-z0-9.-]{0,251}[a-z0-9])?\/)?[A-Za-z0-9]([A-Za-z0-9._-]{0,61}[A-Za-z0-9])?$/,
  );
const labelValue = z
  .string()
  .regex(/^([A-Za-z0-9]([A-Za-z0-9._-]{0,61}[A-Za-z0-9])?)?$/);

// One cadence for every monitor the estate renders, and the labels the
// monitoring stack selects every monitor by
// (spec/v1/14-platform-intent.md#monitor-cadence).
const monitorCadence = z
  .strictObject({
    interval: text,
    timeout: text,
    labels: z.record(labelKey, labelValue).exactOptional(),
  })
  .meta({ id: "MonitorCadence" });

const probeCadence = z
  .strictObject({ period: text, timeout: text, failures: count })
  .meta({ id: "ProbeCadence" });

const ephemeralPolicy = z
  .strictObject({ size: text })
  .meta({ id: "EphemeralPolicy" });

// The platform's migration runner and its terms (spec/v1/14-platform-intent.md#migration-policy):
// an image alias every managed changelog builds on, the deadline a migration
// has, and what its Job requests.
const migrationPolicy = z
  .strictObject({ runner: text, deadline: text, memory: text, cpu: text })
  .meta({ id: "MigrationPolicy" });

// How the platform switches a release (spec/v1/14-platform-intent.md#delivery-policy):
// the Applications that perform the switch and are never switched by it, and
// the cadence every analysis runs at, and what a check of the Release Gate
// must stay under: the share of its requests that may fail, and their p95
// latency.
const analysisPolicy = z
  .strictObject({
    interval: text,
    iterations: count,
    threshold: count,
    errorRate: z.string().regex(ERROR_RATE),
    latency: z.string().regex(LATENCY),
  })
  .meta({ id: "AnalysisPolicy" });

const deliveryPolicy = z
  .strictObject({
    machinery: z.array(holder).min(1),
    // The Release Gate every Canary asks, on its `http` surface
    // (spec/v1/55-delivery.md#the-release-gate).
    gate: holder,
    analysis: analysisPolicy,
    // The Reporter, which Flux's events about every Project's unit are sent
    // to, on its `http` surface (spec/v1/55-delivery.md#rollouts). A platform
    // that names none reports no Rollout past `pinned`.
    reporter: holder.exactOptional(),
    // How long a Move's write pause may last, how long its source is kept
    // once the flip has held, and what each of its step Jobs requests
    // (spec/v1/14-platform-intent.md#delivery-policy).
    move: z
      .strictObject({ timeout: text, retention: text, memory: text, cpu: text })
      .meta({ id: "MovePolicy" })
      .exactOptional(),
  })
  .meta({ id: "DeliveryPolicy" });

// The job that writes the rendered Vault policies and auth roles into the
// Secret Store (spec/v1/14-platform-intent.md#the-vault-policy-job): its image
// alias, the Vault role it logs in as, what it requests and how long it may
// take. The job itself is derived, never declared as a Process.
const vaultPolicyJob = z
  .strictObject({
    image: text,
    role: text,
    memory: text,
    cpu: text,
    deadline: text,
  })
  .meta({ id: "VaultPolicyJob" });

// The image the step that seeds a Process's Assets onto its volumes runs
// (spec/v1/14-platform-intent.md#the-seeder): one that can copy a file, pinned
// in the images lock, with what the step requests.
const seeder = z
  .strictObject({ image: text, memory: text, cpu: text })
  .meta({ id: "Seeder" });

// Who may hold Kubernetes API access, and where the API answers
// (spec/v1/14-platform-intent.md#kubernetes-api-access): the Applications whose
// Processes may declare `api`, and the ranges an egress policy admits for it.
const apiAccessPolicy = z
  .strictObject({
    // May hold rules at either scope: a cluster-wide grant is a privileged
    // role, so these are the foundation's.
    holders: z.array(holder).min(1),
    // May hold rules scoped to their own namespace alone: no privileged role,
    // so a tenant Application is admitted here.
    namespaceHolders: z.array(holder).min(1).exactOptional(),
    server: z.array(destinationRange).min(1),
  })
  .meta({ id: "ApiAccessPolicy" });

// Which delivery path each Project is on while the estate moves off the old
// one (spec/v1/60-setup.md#handing-over-one-project-at-a-time): `legacy` is
// still delivered by the old path, `estate` by its pin, and `retireBy` is the
// date after which the old path is removed. `serving` states where the old
// path runs a legacy Application the estate path reaches: the namespace its
// pods run in, and the instance label they and their Service carry where it is
// not the Process's own name.
// The KV document where the old path keeps a datastore's administrative
// login, and the keys of its user and password, or of the one token an object
// store's admin API takes.
const adminLogin = z.union([
  z
    .strictObject({ path: text, user: text, password: text })
    .meta({ id: "AdminLogin" }),
  z.strictObject({ path: text, token: text }).meta({ id: "AdminToken" }),
]);

const servingLocation = z
  .strictObject({
    // A name, not a reference: an Application no file read declares is not
    // refused, as the ledger's own Project names are not.
    application: text,
    namespace: text,
    instance: text.exactOptional(),
    admin: adminLogin.exactOptional(),
  })
  .meta({ id: "ServingLocation" });

const handoverLedger = z
  .strictObject({
    retireBy: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    legacy: z.array(text).min(1).exactOptional(),
    estate: z.array(text).min(1).exactOptional(),
    serving: z.array(servingLocation).min(1).exactOptional(),
  })
  .meta({ id: "HandoverLedger" });

// Where telemetry is sent (spec/v1/14-platform-intent.md#telemetry): the
// declared Application whose `otlp` surface every exporting Runtime Profile is
// handed, named as a tier names its proxy.
/** The surface a telemetry collector receives on. */
export const OTLP_SURFACE = "otlp";

/** The surface the Release Gate answers Flagger's webhooks on. */
export const GATE_SURFACE = "http";

/** The surface the Reporter receives Flux's events on. */
export const REPORTER_SURFACE = "http";

/**
 * Flux's notification controller, by the `app` label its own install gives
 * its pods: the one peer of the bootstrap set a policy names, since it is the
 * one that calls an Application.
 */
export const FLUX_NOTIFIER = "notification-controller";

/** The label Flux's own install gives every one of its controllers' pods. */
export const FLUX_CONTROLLERS = { "app.kubernetes.io/part-of": "flux" };

/** The namespace Flux's own objects live in: `sourceRef` names its source as `<namespace>/<name>`. */
export const fluxNamespaceOf = (platform: {
  readonly bootstrap: { readonly flux: { readonly sourceRef: string } };
}): string => platform.bootstrap.flux.sourceRef.split("/")[0] as string;

// The Grafana every Application's dashboards ship to
// (spec/v1/14-platform-intent.md#telemetry): the labels its instance carries,
// which a dashboard selects it by, and the data source a vendored dashboard's
// inputs map to.
const dashboardPolicy = z
  .strictObject({
    instance: z.record(z.string().min(1), z.string().min(1)),
    datasource: text,
  })
  .meta({ id: "DashboardPolicy" });

const telemetryPolicy = z
  .strictObject({
    collector: holder,
    // The metrics stack every declared scrape surface admits.
    metrics: holder,
    dashboards: dashboardPolicy.exactOptional(),
  })
  .meta({ id: "TelemetryPolicy" });

// Where an alert is delivered (spec/v1/14-platform-intent.md#monitoring): a
// named receiver of one kind, its credential read from Vault through the one
// secret delivery, never written here.
const vaultValue = z
  .strictObject({ path: text, key: text })
  .meta({ id: "VaultValue" });
const receiver = z
  .strictObject({
    name: z.string().regex(/^[a-z][a-z0-9-]*$/),
    discord: z
      .strictObject({ webhook: vaultValue })
      .meta({ id: "DiscordReceiver" }),
  })
  .meta({ id: "Receiver" });

// Which receiver an alert of one severity reaches, and how often it repeats.
const severityRoute = z
  .strictObject({
    severity: text,
    receiver: text,
    repeat: z.string().regex(/^[1-9][0-9]*[mh]$/),
  })
  .meta({ id: "SeverityRoute" });

// The monitoring stack by role, each a declared Application, and the one
// routing of every alert of the estate (spec/v1/14-platform-intent.md#monitoring).
const monitoring = z
  .strictObject({
    grafana: holder,
    prometheus: holder,
    alertmanager: holder,
    receivers: z.array(receiver).min(1),
    routes: z.array(severityRoute).min(1),
  })
  .meta({ id: "Monitoring" });

// A directory on one node the platform grants to projects
// (spec/v1/14-platform-intent.md#libraries): absolute, with no `.` or `..`
// segment, never `/`, and owned by a group a mount runs with.
export const LIBRARY_PATH = /^(\/(?!\.\.?(?:\/|$))[^/]+)+$/;

const libraryAccess = z.enum(LIBRARY_ACCESS).meta({ id: "LibraryAccess" });

/** A library grants at least one project, or nobody may mount it. */
const grantsSomeone: ShapeRule<{
  readonly grants: Readonly<Record<string, unknown>>;
}> = {
  statement: {
    allOf: [{ properties: { grants: { type: "object", minProperties: 1 } } }],
  },
  breaches: ({ grants }) =>
    Object.keys(grants).length > 0
      ? []
      : [
          {
            path: ["grants"],
            message: "a library grants at least one project",
          },
        ],
};

const libraryDeclaration = stated(
  z.strictObject({
    node: text,
    path: z.string().regex(LIBRARY_PATH),
    gid: count,
    grants: z.record(text, libraryAccess).meta({ entry: "LibraryGrant" }),
  }),
  "LibraryDeclaration",
  grantsSomeone,
);

// What a Process that requires a GPU of one vendor is handed
// (spec/v1/14-platform-intent.md#gpus): the device resource it requests one
// share of, and the runtime class that exposes the card to its container.
const gpuVendor = z
  .strictObject({ resource: text, runtimeClass: text })
  .meta({ id: "GpuVendorPolicy" });

// The variables the render sets on the VPN container itself
// (spec/v1/14-platform-intent.md#vpn): what is forwarded, and which ports the
// container's firewall admits, follow from the attached Process.
export const DERIVED_VPN_SETTINGS = [
  "FIREWALL_INPUT_PORTS",
  "VPN_PORT_FORWARDING",
  "VPN_PORT_FORWARDING_UP_COMMAND",
] as const;

/** A setting the render derives is never authored. */
const settingsUnderived: ShapeRule<{
  readonly settings?: Readonly<Record<string, string>> | undefined;
}> = {
  statement: {
    allOf: [
      {
        properties: {
          settings: {
            type: "object",
            propertyNames: { not: { enum: [...DERIVED_VPN_SETTINGS] } },
          },
        },
      },
    ],
  },
  breaches: ({ settings }) =>
    Object.keys(settings ?? {})
      .filter((name) =>
        (DERIVED_VPN_SETTINGS as readonly string[]).includes(name),
      )
      .map((name) => ({
        path: ["settings", name],
        message: `${name} is derived from the attached Process`,
      })),
};

// The VPN the platform runs beside every Process that attaches to it
// (spec/v1/14-platform-intent.md#vpn): its image, its settings, the credential
// only it reads, and what its container asks for.
const vpnPolicy = stated(
  z.strictObject({
    image: text,
    credential: text,
    memory: text,
    cpu: text,
    settings: z
      .record(z.string().regex(/^[A-Z_][A-Z0-9_]*$/), z.string())
      .meta({ entry: "VpnSetting" })
      .exactOptional(),
  }),
  "VpnPolicy",
  settingsUnderived,
);

/**
 * The API group and version of the Identity Provider's Client, which the
 * bootstrap set lists before any Client can apply
 * (spec/v1/17-sign-in.md#the-client).
 */
export const CLIENT_API_VERSION = "identity.jorisjonkers.dev/v1";

// Who issues sign-ins for the estate (spec/v1/14-platform-intent.md#sign-in):
// the Issuer every Client trusts, and the Application that is the Identity
// Provider, declared in a project file.
const signIn = z
  .strictObject({
    issuer: z.string().regex(/^https:\/\/[^\s/]+(\/[^\s]*)?$/),
    provider: holder,
    // The Principal contract version the provider serves, major.minor: what
    // every generated identity file says its application expects
    // (spec/v1/17-sign-in.md#generated-app-roles).
    contract: z
      .string()
      .regex(/^(0|[1-9]\d*)\.(0|[1-9]\d*)$/)
      .exactOptional(),
  })
  .meta({ id: "SignIn" });

// The Projects the ambient mesh enrols (spec/v1/14-platform-intent.md#the-mesh):
// each one's namespace and every Process in it, by name.
const mesh = z
  .strictObject({ enrolled: z.array(text).min(1) })
  .meta({ id: "Mesh" });

// A group of people granted a built-in cluster role, cluster-wide
// (spec/v1/14-platform-intent.md#human-grants). The group is written as the
// API server sees it, and names the binding, so it holds no character a
// Kubernetes name refuses: no `/` and no `%`.
export const HUMAN_GROUP = /^[^/%\s]+$/;

// The priority classes the platform declares and renders
// (spec/v1/14-platform-intent.md#priority): what a datastore runs at, and what
// the foundation and the Applications the platform names keep running at.
// Nothing is authored on a Process.
const priorityClass = z
  .strictObject({
    name: z.string().regex(/^[a-z0-9]([-a-z0-9]{0,61}[a-z0-9])?$/),
    value: z.int().min(1).max(1_000_000_000),
  })
  .meta({ id: "PriorityClass" });

const priorityPolicy = z
  .strictObject({
    data: priorityClass,
    critical: priorityClass,
    criticalApplications: z.array(holder).min(1).exactOptional(),
  })
  .meta({ id: "PriorityPolicy" });

/**
 * Every holder of a privileged role, as `<project>/<application>`
 * (spec/v1/14-platform-intent.md#privileged-roles): the foundation.
 */
export const foundationOf = (platform: PlatformIntentDocument): Set<string> =>
  new Set([
    ...platform.tiers.map(({ traefik }) => traefik),
    ...(platform.delivery?.machinery ?? []),
    ...(platform.delivery?.gate === undefined ? [] : [platform.delivery.gate]),
    ...(platform.delivery?.reporter === undefined
      ? []
      : [platform.delivery.reporter]),
    ...(platform.apiAccess?.holders ?? []),
    ...(platform.telemetry === undefined
      ? []
      : [platform.telemetry.collector, platform.telemetry.metrics]),
    ...(platform.secretStore === undefined ? [] : [platform.secretStore]),
    ...(platform.signIn === undefined ? [] : [platform.signIn.provider]),
  ]);

const humanGrant = z
  .strictObject({
    group: z.string().regex(HUMAN_GROUP),
    clusterRole: z.enum(HUMAN_GRANT_ROLES).meta({ id: "HumanGrantRole" }),
    reason: text,
  })
  .meta({ id: "HumanGrant" });

export type HumanGrant = z.output<typeof humanGrant>;
// An address a client off the cluster reaches a raw surface on
// (spec/v1/14-platform-intent.md#l4-addresses). A pool is a range of IPv4
// addresses announced on one site's network segment: it is the pool's site
// that holds every Process exposed on it, and its range that the address is
// taken from. `kind` names how the address is reached, so another kind adds a
// class beside this one rather than a field on it.
const poolAddress = z
  .strictObject({
    kind: z.literal("pool"),
    site: text,
    range: z.string().regex(IPV4_CIDR),
  })
  .meta({ id: "PoolAddress" });

// A node's own address, for a site with no pool: an exposure on it is a host
// port on the Process, which is held to that node, since no other node
// listens there. The node is named as the node contract names it.
const nodeAddress = z
  .strictObject({ kind: z.literal("node"), node: text })
  .meta({ id: "NodeAddress" });
// What one Node Agent's copy runs and requests
// (spec/v1/14-platform-intent.md#node-agents): its image alias, and its memory
// and cpu. Its privileges are the catalog's, so no entry names one.
const nodeAgentPolicy = z
  .strictObject({ image: text, memory: text, cpu: text })
  .meta({ id: "NodeAgentPolicy" });

// The speaker announces the pools from each node of their sites; its
// controller, which hands each Service its address, runs once.
const speakerPolicy = z
  .strictObject({
    image: text,
    memory: text,
    cpu: text,
    controller: nodeAgentPolicy,
  })
  .meta({ id: "SpeakerPolicy" });

// The closed Node Agent catalog: an agent the facts derive needs its entry
// here, or E_NO_NODE_AGENT_POLICY refuses the set.
const nodeAgents = z
  .strictObject({
    "gpu-device": nodeAgentPolicy.exactOptional(),
    "gpu-metrics": nodeAgentPolicy.exactOptional(),
    "node-metrics": nodeAgentPolicy.exactOptional(),
    "l4-speaker": speakerPolicy.exactOptional(),
  })
  .meta({ id: "NodeAgents" });

export type NodeAgentPolicy = z.output<typeof nodeAgentPolicy>;

const provider = z
  .strictObject({
    name: text,
    address: text,
    surfaces: z.record(text, port).meta({ entry: "ProviderSurface" }),
  })
  .meta({ id: "Provider" });

export const platformIntent = z
  .strictObject({
    apiVersion: z.literal("intent.jorisjonkers.dev/v1"),
    kind: z.literal("Platform"),
    schemaVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
    owner: text,
    metadata,
    substrate,
    bootstrap,
    tiers: z.array(tier).min(1),
    durability: durabilityPolicies,
    engines: enginePolicies,
    monitors: monitorCadence,
    telemetry: telemetryPolicy.exactOptional(),
    monitoring: monitoring.exactOptional(),
    // The Secret Store every grant is read from, on its `http` surface: an
    // Application a project file the platform owns declares
    // (spec/v1/14-platform-intent.md#the-secret-store).
    secretStore: holder.exactOptional(),
    signIn: signIn.exactOptional(),
    mesh: mesh.exactOptional(),
    hardening: hardeningClass,
    probes: probeCadence,
    ephemeral: ephemeralPolicy,
    migration: migrationPolicy.exactOptional(),
    delivery: deliveryPolicy.exactOptional(),
    apiAccess: apiAccessPolicy.exactOptional(),
    policyJob: vaultPolicyJob.exactOptional(),
    seeder: seeder.exactOptional(),
    handover: handoverLedger.exactOptional(),
    providers: z.array(provider).min(1).exactOptional(),
    libraries: z
      .record(text, libraryDeclaration)
      .meta({ entry: "Library" })
      .exactOptional(),
    gpus: z
      .record(text, gpuVendor)
      .meta({ entry: "GpuVendor" })
      .exactOptional(),
    vpn: vpnPolicy.exactOptional(),
    nodeAgents: nodeAgents.exactOptional(),
    acme: acmePolicy.exactOptional(),
    humanGrants: z.array(humanGrant).min(1).exactOptional(),
    priority: priorityPolicy.exactOptional(),
    l4Addresses: z
      .record(
        z.string().regex(L4_ADDRESS_NAME),
        z.union([poolAddress, nodeAddress]),
      )
      .meta({ entry: "L4Address" })
      .exactOptional(),
  })
  .meta({ id: "Platform" });

export type PlatformIntentDocument = z.output<typeof platformIntent>;
