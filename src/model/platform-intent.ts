// The authoring shape of the Platform document, schemaVersion 1, as
// spec/v1/14-platform-intent.md defines it. Class ids name what the descriptor
// and the generated JSON Schema call each block, and never collide with a
// Project Intent class: a policy keyed by a closed vocabulary is a class with
// one optional feature per literal, so a missing policy is an absent feature.
import { z } from "zod";
import { stated, type ShapeRule } from "./shape-rule.ts";
import { AUDIENCES, LIBRARY_ACCESS } from "./vocabularies.ts";

// The closed vocabularies of spec/v1/14-platform-intent.md, each declared once.

export const DATASTORES = ["sqlite", "etcd"] as const;
export const POLICY_CONTROLLERS = ["none", "embedded", "cni"] as const;
export const LISTENERS = ["tls", "plain"] as const;
export const CERTIFICATE_SOURCES = ["acme", "none"] as const;
export const HARDENING_CLASSES = ["restricted"] as const;
/** Who forwards clients' requests to a tier's edge, where anyone does. */
export const FORWARDERS = ["cloudflare"] as const;

export type Datastore = (typeof DATASTORES)[number];
export type PolicyController = (typeof POLICY_CONTROLLERS)[number];
export type Listener = (typeof LISTENERS)[number];
export type CertificateSource = (typeof CERTIFICATE_SOURCES)[number];
export type HardeningClass = (typeof HARDENING_CLASSES)[number];
export type Forwarder = (typeof FORWARDERS)[number];

const text = z.string().min(1);
const count = z.int().min(1);
/** A share of requests, as a percentage up to 100 with at most two decimals. */
export const ERROR_RATE = /^(100|\d{1,2}(\.\d{1,2})?)%$/;
/** A latency bound: whole milliseconds or seconds. */
export const LATENCY = /^[1-9]\d*(ms|s)$/;
const port = z.int().min(1).max(65535);

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

const bootstrap = z
  .strictObject({
    flux: z
      .strictObject({ sourceRef: text, artifacts: renderedArtifacts })
      .meta({ id: "FluxSource" }),
    vault: z.strictObject({ unsealed: z.boolean() }).meta({ id: "VaultState" }),
    crds: z.array(text).min(1),
  })
  .meta({ id: "Bootstrap" });

const tier = z
  .strictObject({
    name: text,
    audiences: z.array(audience).min(1),
    listener,
    certificates: certificateSource,
    forwardAuth: text.exactOptional(),
    // Absent where clients connect to the edge themselves.
    proxiedBy: forwarder.exactOptional(),
    // The platform Application whose proxy this tier is, declared in a project
    // file the platform owns: a reference into another document.
    traefik: text.meta({ reference: "Application" }),
  })
  .meta({ id: "Tier" });

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

// The method image, and the surface of the Process it connects to where it
// dumps over the network. An engine whose method reads the volume alone names
// none. An engine that owns databases may name the method that applies their
// catalog (spec/v1/14-platform-intent.md#catalog-methods).
const enginePolicy = z
  .strictObject({
    backup: text,
    surface: text.exactOptional(),
    catalog: text.exactOptional(),
  })
  .meta({ id: "EnginePolicy" });

const enginePolicies = z
  .strictObject({
    postgres: enginePolicy.exactOptional(),
    rabbitmq: enginePolicy.exactOptional(),
    valkey: enginePolicy.exactOptional(),
    files: enginePolicy.exactOptional(),
  })
  .meta({ id: "EnginePolicies" });

const monitorCadence = z
  .strictObject({ interval: text, timeout: text })
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
    machinery: z.array(text.meta({ reference: "Application" })).min(1),
    // The Release Gate every Canary asks, on its `http` surface
    // (spec/v1/55-delivery.md#the-release-gate).
    gate: text.meta({ reference: "Application" }),
    analysis: analysisPolicy,
    // The Reporter, which Flux's events about every Project's unit are sent
    // to, on its `http` surface (spec/v1/55-delivery.md#rollouts). A platform
    // that names none reports no Rollout past `pinned`.
    reporter: text.meta({ reference: "Application" }).exactOptional(),
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

// Who may hold Kubernetes API access, and where the API answers
// (spec/v1/14-platform-intent.md#kubernetes-api-access): the Applications whose
// Processes may declare `api`, and the ranges an egress policy admits for it.
const apiAccessPolicy = z
  .strictObject({
    holders: z.array(text.meta({ reference: "Application" })).min(1),
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
// login, and the keys of its user and password.
const adminLogin = z
  .strictObject({ path: text, user: text, password: text })
  .meta({ id: "AdminLogin" });

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

/** The namespace Flux's own objects live in: `sourceRef` names its source as `<namespace>/<name>`. */
export const fluxNamespaceOf = (platform: {
  readonly bootstrap: { readonly flux: { readonly sourceRef: string } };
}): string => platform.bootstrap.flux.sourceRef.split("/")[0] as string;

const telemetryPolicy = z
  .strictObject({
    collector: text.meta({ reference: "Application" }),
    // The metrics stack every declared scrape surface admits.
    metrics: text.meta({ reference: "Application" }),
  })
  .meta({ id: "TelemetryPolicy" });

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
    // The Secret Store every grant is read from, on its `http` surface: an
    // Application a project file the platform owns declares
    // (spec/v1/14-platform-intent.md#the-secret-store).
    secretStore: text.meta({ reference: "Application" }).exactOptional(),
    hardening: hardeningClass,
    probes: probeCadence,
    ephemeral: ephemeralPolicy,
    migration: migrationPolicy.exactOptional(),
    delivery: deliveryPolicy.exactOptional(),
    apiAccess: apiAccessPolicy.exactOptional(),
    policyJob: vaultPolicyJob.exactOptional(),
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
  })
  .meta({ id: "Platform" });

export type PlatformIntentDocument = z.output<typeof platformIntent>;
