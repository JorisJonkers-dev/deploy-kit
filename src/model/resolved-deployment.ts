// The shape of the Resolved Deployment, schemaVersion 1, as
// spec/v1/20-resolved-deployment.md#the-model defines it. Two kinds share one
// schema family: a `ResolvedDeployment` covers the composed estate, and a
// `ResolvedApplication` is the projection published back to one repository
// (docs/adr/model/0032-the-resolved-deployment-is-a-versioned-artifact.md).
//
// No key here is a Kubernetes or Traefik field name. Layer 2 records the
// `cutover` a Process was granted and the `switchover` it derives, the
// `hardening` posture it takes and the
// capacity it needs; a rollout strategy, a security context and a resource
// block are the `kubernetes` adapter's spelling of those decisions
// (docs/adr/model/0011-authored-values-name-model-concepts.md).
import { z } from "zod";
import {
  CERTIFICATE_SOURCES,
  ERROR_RATE,
  HARDENING_CLASSES,
  LATENCY,
  LISTENERS,
} from "./platform-intent.ts";
import {
  ACCESS_TIERS,
  API_SCOPES,
  API_VERBS,
  AUDIENCES,
  CLIENT_CREDENTIALS,
  CONTENT_POLICIES,
  CUTOVERS,
  DATABASE_ENGINES,
  DELIVERIES,
  DURABILITY_CLASSES,
  KEY_ENCODINGS,
  L4_PROTOCOLS,
  LIBRARY_ACCESS,
  SPREADS,
  LIFECYCLES,
  MATCHES,
  RUNTIMES,
  SIGN_IN_MODES,
  TRANSIT_ENGINES,
} from "./vocabularies.ts";
import { stated, type ShapeRule } from "./shape-rule.ts";

// The closed vocabularies layer 2 adds, each declared here once. Layer 2
// records decisions in model words, so none of these names a Kubernetes or
// Traefik concept (docs/adr/model/0011-authored-values-name-model-concepts.md,
// normative in spec/v1/20-resolved-deployment.md#the-model).

/** Which pinned input a recorded digest is the digest of. */
export const PINNED_INPUTS = [
  "intent-fragment",
  "platform-intent",
  "node-contract",
  "images-lock",
  "cluster-state",
] as const;

/** How an Application's new version replaces the old one
 * (spec/v1/55-delivery.md#switchover): `continuous` derives `blue-green`, or
 * `rolling` on the delivery machinery, and `interrupted` derives `stop-start`. */
export const SWITCHOVERS = ["blue-green", "rolling", "stop-start"] as const;

/**
 * Which allow-set rule admits an inbound peer it names by namespace and
 * Process (spec/v1/16-dependencies.md#the-derived-allow-set). A consumer is
 * admitted by the label it carries instead, and names none.
 */
export const INGRESS_RULES = [
  "tier-proxy",
  "metrics-stack",
  "backup",
  "flux-events",
  "release-gate",
] as const;

/** Which rule admits an outbound peer beyond an edge: the baseline, or a grant. */
export const EGRESS_RULES = [
  "cluster-dns",
  "secret-store",
  "datastore",
] as const;

/** What a gate member is analysed on beyond readiness, from its Runtime Profile. */
export const ANALYSIS_CHECKS = ["error-rate", "latency"] as const;

/** A step of the middleware chain a route derives. */
export const MIDDLEWARE_KINDS = [
  "forward-auth",
  "security-headers",
  "redirect",
  "rate-limit",
] as const;

/** Which address a rate limit counts a client by: the connection's, or the one Cloudflare forwards. */
export const CLIENT_ADDRESSES = ["connection", "cloudflare"] as const;

/** Whose directory a path assignment belongs to. */
export const PATH_SCOPES = ["estate", "project", "application"] as const;

/** The registered Adapters, one per subsystem (spec/v1/30-deliverables.md#adapters). */
export const ADAPTERS = [
  "kubernetes",
  "networking",
  "prometheus",
  "traefik",
  "vault-policy",
  "vso",
] as const;

export type PinnedInput = (typeof PINNED_INPUTS)[number];
export type Switchover = (typeof SWITCHOVERS)[number];
export type AnalysisCheck = (typeof ANALYSIS_CHECKS)[number];
export type MiddlewareKind = (typeof MIDDLEWARE_KINDS)[number];
export type ClientAddress = (typeof CLIENT_ADDRESSES)[number];
export type PathScope = (typeof PATH_SCOPES)[number];
export type AdapterName = (typeof ADAPTERS)[number];

const text = z.string().min(1);
const count = z.int().min(0);
const port = z.int().min(1).max(65535);
/** A digest, always `<algorithm>:<hex>`; a tag is never a pinned input. */
const digest = z.string().regex(/^[a-z0-9]+:[a-f0-9]+$/);
/** A Duration, the way the Platform document writes one. */
const duration = z.string().regex(/^\d+(ms|s|m|h)$/);

const accessTier = z.enum(ACCESS_TIERS).meta({ id: "AccessTier" });
const audience = z.enum(AUDIENCES).meta({ id: "Audience" });
const contentPolicy = z.enum(CONTENT_POLICIES).meta({ id: "ContentPolicy" });
const cutover = z.enum(CUTOVERS).meta({ id: "Cutover" });
const delivery = z.enum(DELIVERIES).meta({ id: "Delivery" });
const durabilityClass = z
  .enum(DURABILITY_CLASSES)
  .meta({ id: "DurabilityClass" });
const hardeningClass = z.enum(HARDENING_CLASSES).meta({ id: "HardeningClass" });
const match = z.enum(MATCHES).meta({ id: "Match" });

const adapterName = z.enum(ADAPTERS).meta({ id: "AdapterName" });
const middlewareKind = z.enum(MIDDLEWARE_KINDS).meta({ id: "MiddlewareKind" });
const clientAddress = z.enum(CLIENT_ADDRESSES).meta({ id: "ClientAddress" });
const pathScope = z.enum(PATH_SCOPES).meta({ id: "PathScope" });
const pinnedInput = z.enum(PINNED_INPUTS).meta({ id: "PinnedInput" });
const switchover = z.enum(SWITCHOVERS).meta({ id: "Switchover" });

// ---------------------------------------------------------------- provenance

const inputDigest = z
  .strictObject({ input: pinnedInput, name: text, digest })
  .meta({ id: "InputDigest" });

const provenance = z
  .strictObject({
    renderHash: digest,
    schemaPackageIntegrity: digest,
    // One entry per pinned input, never one digest over their union: the claim
    // is that re-rendering from THESE inputs reproduces this tree, and a digest
    // over the union cannot say which fragment moved.
    inputDigests: z.array(inputDigest).min(1),
  })
  .meta({ id: "Provenance" });

// ------------------------------------------------------------------- a probe

const httpProbe = z
  .strictObject({ path: text, port })
  .meta({ id: "ResolvedHttpProbe" });
const tcpProbe = z.strictObject({ tcp: port }).meta({ id: "ResolvedTcpProbe" });
const probeTarget = z.union([httpProbe, tcpProbe]);

/** Readiness and liveness: the target, at the Platform document's cadence. */
const resolvedProbe = z
  .union([
    httpProbe.extend({ period: duration, timeout: duration, failures: count }),
    tcpProbe.extend({ period: duration, timeout: duration, failures: count }),
  ])
  .meta({ id: "ResolvedProbe" });

/**
 * The startup probe is its own class: its target is the liveness declaration
 * and its period and failure count derive from `startupBudget`, where readiness
 * and liveness take the Platform document's cadence
 * (docs/adr/model/0016-probes-are-siblings-and-startup-targets-liveness.md). Different input,
 * different derivation, different class.
 */
const startupProbe = z
  .union([
    httpProbe.extend({ period: duration, timeout: duration, failures: count }),
    tcpProbe.extend({ period: duration, timeout: duration, failures: count }),
  ])
  .meta({ id: "StartupProbe" });

// ----------------------------------------------------------------- a Process

const resolvedPlacement = z
  .strictObject({
    eligibleNodes: z.array(text).min(1),
    // A bound volume ties a Process to the node holding it. That is an
    // assignment like any other, a pure function of the digest `from` names.
    boundTo: text.exactOptional(),
    from: pinnedInput.exactOptional(),
  })
  .meta({ id: "ResolvedPlacement" });

const resolvedGrant = z
  .strictObject({
    path: text,
    keys: z.array(text).min(1).exactOptional(),
    // The keys the Vault policy job writes when absent, with what each defaults to.
    generated: z
      .array(
        z.strictObject({
          key: text,
          bytes: z.int(),
          encoding: z.enum(KEY_ENCODINGS),
          // Where the value starts from, copied once while the key is absent.
          adopt: z.strictObject({ path: text, key: text }).exactOptional(),
        }),
      )
      .min(1)
      .exactOptional(),
    access: accessTier,
    delivery,
    // The Secret the store's value is synced to, for a grant delivered `env`
    // or `file`; a `self` grant is read by the Process and synced nowhere.
    destination: text.exactOptional(),
    mountAt: text.exactOptional(),
    fileMode: text.exactOptional(),
    // A grant with `delivery: self` and `tolerates: reload` derives none, which
    // is what makes its rotation zero-downtime.
    restartTargets: z.array(text).exactOptional(),
  })
  .meta({ id: "ResolvedGrant" });

// A path a grant's policy covers, and what it may do there.
const policyPath = z
  .strictObject({ path: text, allows: z.array(text).min(1) })
  .meta({ id: "PolicyPath" });

// A `transit` or `database` grant: the paths its policy covers, derived from
// the engine (spec/v1/10-project-intent.md#secrets). Read by the Process itself,
// except a credential an edge derives, which may be synced to the environment
// or to files under a directory.
const resolvedEngineGrant = z
  .strictObject({
    engine: z.enum([...TRANSIT_ENGINES, ...DATABASE_ENGINES]),
    delivery: z.enum(["self", "env", "file"]),
    paths: z.array(policyPath).min(1),
    destination: text.exactOptional(),
    mountAt: text.exactOptional(),
    fileMode: text.exactOptional(),
    restartTargets: z.array(text).exactOptional(),
  })
  .meta({ id: "ResolvedEngineGrant" });

// The sign-in provider's write on one Client's derived credential
// (spec/v1/17-sign-in.md#credentials-and-placeholders): derived, never
// authored, for each Client holding a secret, and read by the provider's
// Process itself, which creates and rotates it.
const resolvedClientGrant = z
  .strictObject({
    client: text,
    delivery: z.literal("self"),
    paths: z.array(policyPath).min(1),
  })
  .meta({ id: "ResolvedClientGrant" });

// The backup a Durability Class derives: the platform's terms for the class,
// the engine's method image, the identity it runs as, the claim its copies
// land on, and for an off-cluster copy the credential only that identity holds.
const egressRule = z.enum(EGRESS_RULES).meta({ id: "EgressRule" });

// An outbound peer the policy admits beyond the dependency edges: a whole
// namespace where no single Process is the peer.
const egressPeer = z
  .strictObject({
    rule: egressRule,
    namespace: text,
    process: text.exactOptional(),
    port,
  })
  .meta({ id: "EgressPeer" });

// Every gate member's pods, wherever they run, on any port: what the Release
// Gate's own requests reach (spec/v1/16-dependencies.md#the-member-label). The
// member's own policy names the port it admits them on.
const gateMembersPeer = z
  .strictObject({ rule: z.literal("gate-members") })
  .meta({ id: "GateMembersPeer" });

// An address range a policy admits by address, on one port, because no
// namespace or pod is the peer: where an off-cluster copy goes
// (spec/v1/14-platform-intent.md#durability-policy), or where the Kubernetes
// API answers (spec/v1/14-platform-intent.md#kubernetes-api-access).
const destinationRange = z
  .strictObject({ cidr: text, port })
  .meta({ id: "DestinationRange" });

// The Process a method dumps over the network, and the credential it logs in
// with (spec/v1/20-resolved-deployment.md#derived-mechanics): the Process's
// Service on the port of the surface the platform names for its engine, and a
// path derived from the Process, held by the backup identity alone.
const backupPeer = z
  .strictObject({
    host: text,
    port,
    credential: resolvedGrant,
  })
  .meta({ id: "BackupPeer" });

const backupPlan = z
  .strictObject({
    schedule: text,
    // How many copies are kept: the method prunes to this count after a run.
    retain: count,
    // Where the off-cluster copy goes, who can read it, and where under the
    // destination this volume's copies are kept.
    offCluster: z
      .strictObject({ destination: text, recipient: text, path: text })
      .meta({ id: "OffClusterPlan" })
      .exactOptional(),
    method: text,
    // The software version the images lock records for the method's image.
    methodVersion: text.exactOptional(),
    uid: count,
    gid: count,
    identity: text,
    claim: text,
    credential: resolvedGrant.exactOptional(),
    // Where a method that dumps over the network connects; none for one that
    // reads the volume alone.
    peer: backupPeer.exactOptional(),
    // What the backup identity's own policy admits: the Process it dumps, on
    // the surface its engine's method connects to, and the cluster's DNS. Not
    // the Secret Store: the operator reads the credential for it.
    egress: z.array(egressPeer),
    // Where an off-cluster copy goes, as the durability policy states it.
    destinations: z.array(destinationRange).exactOptional(),
  })
  .meta({ id: "BackupPlan" });

// The Kubernetes API access a Process holds
// (spec/v1/16-dependencies.md#kubernetes-api-access-is-declared-and-admitted):
// its rules as declared, the reason its owner gave, and where the platform
// says the API answers, which its policy admits.
const resolvedApiRule = z
  .strictObject({
    group: text,
    objects: z.array(text).min(1),
    verbs: z.array(z.enum(API_VERBS).meta({ id: "ApiVerb" })).min(1),
    scope: z.enum(API_SCOPES).meta({ id: "ApiScope" }),
  })
  .meta({ id: "ResolvedApiRule" });

// Public IPv4 a Process reaches, and the reason its owner gave
// (spec/v1/16-dependencies.md#internet-egress).
const internetEgress = z
  .strictObject({ reason: text })
  .meta({ id: "InternetEgress" });

const resolvedApiAccess = z
  .strictObject({
    reason: text,
    // Empty where the Process holds nothing of its own and only reaches the API.
    rules: z.array(resolvedApiRule),
    server: z.array(destinationRange).min(1),
  })
  .meta({ id: "ResolvedApiAccess" });

const resolvedVolume = z
  .strictObject({
    claim: text,
    mountAt: text,
    size: text,
    durability: durabilityClass,
    // `reconstructible` earns none, which is the absence rather than a class.
    backup: backupPlan.exactOptional(),
  })
  .meta({ id: "ResolvedVolume" });

// A library the Process mounts (spec/v1/10-project-intent.md#libraries): the
// directory on its node, the group the Process runs with, and the volume and
// claim its project derives onto the directory, mounted at `mountAt` below
// `subPath`.
const resolvedLibraryMount = z
  .strictObject({
    library: text,
    claim: text,
    volume: text,
    node: text,
    path: text,
    gid: count,
    mountAt: text,
    subPath: text.exactOptional(),
    access: z.enum(LIBRARY_ACCESS).meta({ id: "LibraryAccess" }),
  })
  .meta({ id: "ResolvedLibraryMount" });

// The one GPU share a Process that requires a GPU requests, and the runtime
// class that exposes the card, both the Platform's for the card's vendor
// (spec/v1/20-resolved-deployment.md#the-gpu-request).
const resolvedGpu = z
  .strictObject({ resource: text, runtimeClass: text })
  .meta({ id: "ResolvedGpu" });

// The VPN container the render adds beside an attached Process
// (spec/v1/20-resolved-deployment.md#the-vpn-attachment): the platform's image,
// what it asks for, its whole environment, settings and derived values alike,
// and the credential only it reads.
const resolvedVpn = z
  .strictObject({
    image: text,
    imageVersion: text.exactOptional(),
    memory: text,
    cpu: text,
    forwardedPort: z.boolean(),
    environment: z
      .array(z.strictObject({ name: text, value: z.string() }))
      .min(1),
    credential: resolvedGrant,
  })
  .meta({ id: "ResolvedVpn" });

// A file-shaped settings file, by the content-hashed name an edit changes, so
// an edit restarts the Process (spec/v1/10-project-intent.md#assets).
const resolvedAsset = z
  .strictObject({ name: text, from: text, mountAt: text, content: z.string() })
  .meta({ id: "ResolvedAsset" });

// A container beside the Process in its pod, its image pinned by digest.
const resolvedSidecar = z
  .strictObject({
    name: text,
    image: text,
    imageVersion: text.exactOptional(),
    memory: text,
    cpu: text,
    // The Process's volumes it mounts, each at its own path.
    volumes: z
      .array(z.strictObject({ claim: text, mountAt: text }))
      .min(1)
      .exactOptional(),
    // Runs to completion before the Process starts.
    init: z.literal(true).exactOptional(),
  })
  .meta({ id: "ResolvedSidecar" });

const policyPeer = z
  .strictObject({ namespace: text, process: text, port })
  .meta({ id: "PolicyPeer" });

const resolvedEdge = z
  .strictObject({
    application: text,
    surface: text,
    address: text,
    // The name the consumer's alias points at, where one renders
    // (spec/v1/16-dependencies.md#the-alias).
    target: text.exactOptional(),
    peers: z.array(policyPeer).exactOptional(),
  })
  .meta({ id: "ResolvedEdge" });

// A port a Process provides, by the surface name that is what a route, a
// scrape and a policy name it by.
const resolvedSurface = z
  .strictObject({ name: text, port })
  .meta({ id: "ResolvedSurface" });

// A pod a Process creates from one of its spawn templates
// (spec/v1/20-resolved-deployment.md#derived-mechanics): the pinned image it
// runs, what it requests, the label every such pod carries and its policy
// selects, the surfaces it serves its Process, and what it reaches.
const resolvedSpawn = z
  .strictObject({
    name: text,
    image: text,
    imageVersion: text.exactOptional(),
    uid: count,
    gid: count,
    memory: text,
    cpu: text,
    selector: text,
    surfaces: z.array(resolvedSurface).exactOptional(),
    consumes: z.array(text).exactOptional(),
    dependencies: z.array(resolvedEdge).exactOptional(),
    // The baseline its policy carries: the cluster's DNS.
    egress: z.array(egressPeer),
    internetEgress: internetEgress.exactOptional(),
  })
  .meta({ id: "ResolvedSpawn" });

// A port a client off the cluster dials on an L4 Address, and the surface's
// port it reaches (spec/v1/20-resolved-deployment.md#l4-exposure): `name` is
// the protocol and the client's port, which no two ports of one Service share.
const resolvedL4Port = z
  .strictObject({
    name: text,
    port,
    protocol: z.enum(L4_PROTOCOLS).meta({ id: "L4Protocol" }),
    surface: text,
    targetPort: port,
  })
  .meta({ id: "ResolvedL4Port" });

// One L4 Address a Process is exposed on, as the Platform declares it. On a
// pool, the Service that requests it: a load balancer that keeps the client's
// address and sends a connection only to a pod on the node that announces it.
const resolvedPoolExposure = z
  .strictObject({
    address: text,
    kind: z.literal("pool"),
    site: text,
    range: text,
    service: text,
    ports: z.array(resolvedL4Port).min(1),
  })
  .meta({ id: "ResolvedPoolExposure" });

// On a node's own address, the node the Process is held to: each port is a
// host port there, so no Service stands between the client and the pod.
const resolvedNodeExposure = z
  .strictObject({
    address: text,
    kind: z.literal("node"),
    node: text,
    ports: z.array(resolvedL4Port).min(1),
  })
  .meta({ id: "ResolvedNodeExposure" });

const resolvedL4Exposure = z.union([
  resolvedPoolExposure,
  resolvedNodeExposure,
]);

const ingressRule = z.enum(INGRESS_RULES).meta({ id: "IngressRule" });

// An inbound peer the Process's policy admits, on one of its own ports: a
// named Process, or, for a consumer, every pod carrying the consumer label of
// the surface (spec/v1/16-dependencies.md#the-consumer-label).
const ingressPeer = z
  .union([
    z.strictObject({
      rule: ingressRule,
      namespace: text,
      process: text,
      port,
    }),
    z.strictObject({ rule: z.literal("consumer"), consumes: text, port }),
  ])
  .meta({ id: "IngressPeer" });

const writablePath = z
  .strictObject({ path: text, size: text })
  .meta({ id: "WritablePath" });

// A variable is a value, or one key of a granted Secret Store path, which the
// render reads from that grant's synced Secret
// (spec/v1/10-project-intent.md#secret-references).
const secretReference = z
  .strictObject({ path: text, key: text })
  .meta({ id: "SecretReference" });
const envEntry = z
  .union([
    z.strictObject({ name: text, value: z.string() }),
    z.strictObject({ name: text, secret: secretReference }),
  ])
  .meta({ id: "EnvEntry" });

const lifecycle = z.enum(LIFECYCLES).meta({ id: "Lifecycle" });
const runtime = z.enum(RUNTIMES).meta({ id: "Runtime" });

/** The switchovers each `cutover` may derive (spec/v1/55-delivery.md#switchover):
 * `rolling` is the delivery machinery's, which no gate switches. */
const SWITCHOVERS_OF = {
  continuous: ["blue-green", "rolling"],
  interrupted: ["stop-start"],
} as const satisfies Record<(typeof CUTOVERS)[number], readonly string[]>;

/**
 * What a derivation guarantees about one Process: its switchover is one its
 * cutover derives, and a Process with no cutover switches nothing.
 */
const switchoverFollowsCutover: ShapeRule<{
  readonly parked?: true;
  readonly cutover?: keyof typeof SWITCHOVERS_OF;
  readonly switchover?: string;
}> = {
  statement: {
    dependentRequired: { switchover: ["cutover"] },
    allOf: [
      ...Object.entries(SWITCHOVERS_OF).map(([cutover, switchovers]) => ({
        if: {
          required: ["cutover"],
          properties: { cutover: { const: cutover } },
          not: {
            required: ["parked"],
            properties: { parked: { const: true } },
          },
        },
        then: { properties: { switchover: { enum: [...switchovers] } } },
      })),
      // A parked Process stops and starts, whatever its cutover.
      {
        if: {
          required: ["parked"],
          properties: { parked: { const: true } },
        },
        then: { properties: { switchover: { const: "stop-start" } } },
      },
    ],
  },
  breaches: ({ cutover, switchover, parked }) => {
    if (switchover === undefined) return [];
    if (parked === true)
      return switchover === "stop-start"
        ? []
        : [
            {
              path: ["switchover"],
              message: "a parked Process stops and starts",
            },
          ];
    if (cutover === undefined)
      return [
        {
          path: ["switchover"],
          message: "a Process with no cutover switches nothing",
        },
      ];
    const allowed: readonly string[] = SWITCHOVERS_OF[cutover];
    return allowed.includes(switchover)
      ? []
      : [
          {
            path: ["switchover"],
            message: `a ${cutover} cutover derives the ${allowed.join(" or ")} switchover`,
          },
        ];
  },
};

const resolvedProcess = stated(
  z.strictObject({
    name: text,
    lifecycle,
    runtime,
    identity: text,
    image: text,
    // The software version the images lock records for the image, where it
    // records one: what the render writes on the pod, never what it selects on.
    imageVersion: text.exactOptional(),
    uid: count,
    gid: count,
    // Absent on a `lifecycle: prepare` Process: it runs once and cuts over
    // nothing (docs/adr/model/0027-prepare-processes-are-forward-only-setup.md).
    cutover: cutover.exactOptional(),
    // Present on a `lifecycle: application` Process; a job has no switchover.
    switchover: switchover.exactOptional(),
    // Present on a `lifecycle: scheduled` Process alone: the cron it runs at,
    // and how late a run may start before it is skipped.
    schedule: text.exactOptional(),
    startDeadline: duration.exactOptional(),
    deadline: duration,
    // None while the Process is parked.
    replicas: z.int().min(0),
    // A parked Process runs no pod and keeps everything it owns.
    parked: z.literal(true).exactOptional(),
    // The priority class it runs at, where the platform derives one.
    priorityClass: text.exactOptional(),
    // No two replicas of one revision share a node.
    spreadAcross: z.enum(SPREADS).meta({ id: "Spread" }).exactOptional(),
    // Where the Process is a tier's proxy: the class its routes carry, whether
    // the tier terminates TLS, and on an acme tier the resolver named for it,
    // with the account and where its state is kept
    // (spec/v1/30-deliverables.md#the-edge-proxy).
    edgeProxy: z
      .strictObject({
        ingressClass: text,
        tls: z.boolean(),
        resolver: z
          .strictObject({
            name: text,
            email: text,
            dnsProvider: text,
            storage: text,
          })
          .meta({ id: "ResolvedResolver" })
          .exactOptional(),
      })
      .meta({ id: "ResolvedEdgeProxy" })
      .exactOptional(),
    memory: text,
    cpu: text,
    gpu: resolvedGpu.exactOptional(),
    vpn: resolvedVpn.exactOptional(),
    hardening: hardeningClass,
    identityToken: z.boolean(),
    api: resolvedApiAccess.exactOptional(),
    internetEgress: internetEgress.exactOptional(),
    readiness: resolvedProbe.exactOptional(),
    liveness: resolvedProbe.exactOptional(),
    startup: startupProbe.exactOptional(),
    placement: resolvedPlacement,
    volumes: z.array(resolvedVolume).exactOptional(),
    libraries: z.array(resolvedLibraryMount).exactOptional(),
    secrets: z
      .array(z.union([resolvedGrant, resolvedEngineGrant, resolvedClientGrant]))
      .exactOptional(),
    assets: z.array(resolvedAsset).exactOptional(),
    sidecars: z.array(resolvedSidecar).exactOptional(),
    dependencies: z.array(resolvedEdge).exactOptional(),
    // The surface of every Application its edges reach, as the consumer
    // label its pods carry names it.
    consumes: z.array(text).exactOptional(),
    writablePaths: z.array(writablePath).exactOptional(),
    environment: z.array(envEntry).exactOptional(),
    surfaces: z.array(resolvedSurface).exactOptional(),
    l4Exposure: z.array(resolvedL4Exposure).exactOptional(),
    // The resolvers a Process that serves DNS resolves through, in place of
    // the cluster's DNS (spec/v1/20-resolved-deployment.md#derived-mechanics).
    nameservers: z.array(text).min(1).exactOptional(),
    spawns: z.array(resolvedSpawn).exactOptional(),
    ingress: z.array(ingressPeer).exactOptional(),
    egress: z.array(z.union([egressPeer, gateMembersPeer])).exactOptional(),
  }),
  "ResolvedProcess",
  switchoverFollowsCutover,
);

// ---------------------------------------------------------------- the edge

const middlewareStep = z
  .strictObject({
    kind: middlewareKind,
    // `security-headers` names a profile only where the Application chose one;
    // absent is the tier's baseline.
    contentPolicy: contentPolicy.exactOptional(),
    endpoint: text.exactOptional(),
    redirectTo: text.exactOptional(),
    // A `rate-limit` step: the route's limit, its derived burst, and the
    // address its tier counts a client by.
    allowance: z.int().min(1).exactOptional(),
    per: duration.exactOptional(),
    burst: z.int().min(1).exactOptional(),
    clientAddress: clientAddress.exactOptional(),
  })
  .meta({ id: "MiddlewareStep" });

const routeTerms = {
  path: text,
  match,
  audience,
  // Specificity alone, smallest evaluated first: exact before prefix, longer
  // prefix before shorter (docs/adr/model/0023-exposure-is-declared-by-audience.md).
  precedence: z.int().min(1),
  // The chain follows the audience, and a route may override the audience, so
  // it hangs off the route rather than off the host it is served on.
  middleware: z.array(middlewareStep).exactOptional(),
};

// Where the Gate's own route is served: the Service the tier's forward-auth
// endpoint names, in its namespace, on its port
// (spec/v1/17-sign-in.md#what-the-edge-derives).
const gateAddress = z
  .strictObject({ name: text, namespace: text, port })
  .meta({ id: "GateAddress" });

// A route to a Process of the Application, as authored, or the `/.auth/`
// route a gated Client derives, which is the Gate's and no Process's.
const resolvedRoute = z
  .union([
    z.strictObject({ ...routeTerms, process: text, surface: text }),
    z.strictObject({ ...routeTerms, gate: gateAddress }),
  ])
  .meta({ id: "ResolvedRoute" });

const listener = z.enum(LISTENERS).meta({ id: "Listener" });
const certificates = z
  .enum(CERTIFICATE_SOURCES)
  .meta({ id: "CertificateSource" });

// The proxy a tier is served by: its Application and the namespace it runs in.
const tierProxy = z
  .strictObject({ application: text, namespace: text })
  .meta({ id: "TierProxy" });

const resolvedExposure = z
  .strictObject({
    name: text,
    host: text,
    tier: text,
    // The ingress class the tier's proxy admits its routes by.
    ingressClass: text,
    // Where the tier's public names point, where it publishes them.
    dns: z
      .strictObject({ target: text, proxied: z.boolean() })
      .meta({ id: "ResolvedTierDns" })
      .exactOptional(),
    listener,
    certificates,
    proxy: tierProxy,
    routes: z.array(resolvedRoute).min(1),
  })
  .meta({ id: "ResolvedExposure" });

// ------------------------------------------------------------ an Application

// What a member is analysed on, beside its readiness: the checks its Runtime
// Profile's HTTP server metrics allow (spec/v1/55-delivery.md#the-release-gate).
const analysisCheck = z.enum(ANALYSIS_CHECKS).meta({ id: "AnalysisCheck" });

// A Process of another Application of the same Project that a member requires
// and that switches stop-start: the member's new version starts only once it
// has started its own (spec/v1/55-delivery.md#release-order). Named, never by
// revision, so a release of the provider does not release the member.
const gateProvider = z
  .strictObject({ application: text, process: text })
  .meta({ id: "GateProvider" });

const gateMember = z
  .strictObject({
    process: text,
    readiness: probeTarget,
    checks: z.array(analysisCheck).exactOptional(),
    waitsFor: z.array(gateProvider).min(1).exactOptional(),
  })
  .meta({ id: "GateMember" });

// The Platform document's cadence, carried so the projection is all the gate reads.
const gateAnalysis = z
  .strictObject({
    interval: duration,
    iterations: count,
    threshold: count,
    // What a check must stay under, the same for every Application.
    errorRate: z.string().regex(ERROR_RATE),
    latency: z.string().regex(LATENCY),
  })
  .meta({ id: "GateAnalysis" });

// What the gate needs of a migration to start it and to undo it
// (spec/v1/55-delivery.md#failure-and-undo): the identity its Jobs are named
// for, the serving revision the release was proven against, and whether a
// changeset of it cannot run in a transaction. The Jobs' names are not here:
// they carry the revision's tag, and the revision covers this element.
const gateMigration = z
  .strictObject({
    identity: text,
    testedAgainst: digest.exactOptional(),
    nonTransactional: z.boolean(),
  })
  .meta({ id: "GateMigration" });

const releaseGate = z
  .strictObject({
    // Where every Canary of the Application asks the Release Gate.
    endpoint: text,
    // `max` over the members: the unit waits for its slowest legitimate starter.
    deadline: duration,
    analysis: gateAnalysis,
    // A Process declaring `probes: none` publishes no readiness signal and is
    // no member. A continuous Application where every Process does is refused
    // at composition with E_RELEASE_UNIT_NO_READINESS.
    members: z.array(gateMember).min(1),
    // Present where the Application moves its schema with a changelog.
    migration: gateMigration.exactOptional(),
    // A native Client's protectedPath, which the gate requests anonymously
    // before it switches: a 2xx is E_CLIENT_OPEN
    // (spec/v1/17-sign-in.md#what-is-checked).
    protectedPath: text.exactOptional(),
    // The member the gate asks for it: the Process the longest Route of the
    // Client's exposure takes the path to.
    protectedBy: text.exactOptional(),
  })
  .meta({ id: "ReleaseGate" });

// The database a migration moves: where the project's datastore answers, and
// the one database of the project on it.
const migratedDatabase = z
  .strictObject({ host: text, port, name: text })
  .meta({ id: "MigratedDatabase" });

// The migration plan (spec/v1/20-resolved-deployment.md#the-migration): what
// the proof beside the project records about this release, and everything the
// Jobs of it run with. The runner image the Application's changelog was built
// into and the user it runs as; the serving revision its compatibility was
// proven against (absent on a first release, when nothing serves) and whether
// the release holds a changeset that cannot run in a transaction, which no
// automatic undo may touch (spec/v1/55-delivery.md#failure-and-undo); the
// identity it runs as, the platform's terms for a migration, the database it
// moves, the owner credential only that identity holds, and what its own
// policy admits.
const resolvedMigration = z
  .strictObject({
    runner: text,
    runnerVersion: text.exactOptional(),
    uid: count,
    gid: count,
    testedAgainst: digest.exactOptional(),
    nonTransactional: z.boolean(),
    identity: text,
    deadline: duration,
    memory: text,
    cpu: text,
    // The runner's one writable path, at the platform's ephemeral size.
    scratch: text,
    database: migratedDatabase,
    // The datastore's surface, as the consumer label the runner's pods carry
    // names it.
    consumes: z.array(text),
    credential: resolvedEngineGrant,
    // The datastore on the surface the Application's edge reaches, the Secret
    // Store the identity reads its credential from itself, and the cluster's DNS.
    egress: z.array(egressPeer),
  })
  .meta({ id: "ResolvedMigration" });

// The Client an Application's `client` block derives
// (spec/v1/17-sign-in.md#the-client): every path on the named exposure's host,
// the user role first, and the credential path a secret is held at.
const resolvedClient = z
  .strictObject({
    signIn: z.enum(SIGN_IN_MODES).meta({ id: "SignInMode" }),
    host: text,
    launchUrl: text.exactOptional(),
    iconUrl: text.exactOptional(),
    redirectUris: z.array(text).min(1).exactOptional(),
    credential: z
      .enum(CLIENT_CREDENTIALS)
      .meta({ id: "ClientCredential" })
      .exactOptional(),
    secretPath: text.exactOptional(),
    roles: z.array(text).min(1),
    label: text.exactOptional(),
    description: text.exactOptional(),
  })
  .meta({ id: "ResolvedClient" });

// What enrolment in the ambient mesh derives for an Application of an enrolled
// Project (spec/v1/20-resolved-deployment.md#the-mesh): its namespace's data-plane
// mode, the port an enrolled peer arrives and leaves on, and the address the
// kubelet's probes arrive from.
const resolvedMesh = z
  .strictObject({
    dataplane: z.literal("ambient"),
    tunnelPort: port,
    probeSource: text,
  })
  .meta({ id: "ResolvedMesh" });

// The monitor an Application's observability derives: which surface of which
// Process, at which path, at the platform's cadence, carrying the labels the
// monitoring stack selects it by.
const resolvedScrape = z
  .strictObject({
    process: text,
    surface: text,
    path: text,
    interval: duration,
    timeout: duration,
    // The labels the monitoring stack selects every monitor by, as the
    // Platform document's `monitors` names them.
    labels: z.record(text, text).exactOptional(),
  })
  .meta({ id: "ResolvedScrape" });

// A dashboard an Application ships, as Grafana keys it, with the data source
// inputs a vendored file declares (spec/v1/10-project-intent.md#dashboards).
const resolvedDashboard = z
  .strictObject({
    uid: text,
    from: text,
    content: z.string(),
    inputs: z.array(text),
  })
  .meta({ id: "ResolvedDashboard" });

// An Application's dashboards, in its Project's folder, for the Grafana the
// Platform document names.
const resolvedDashboards = z
  .strictObject({
    folder: text,
    instance: z.record(text, text),
    datasource: text,
    files: z.array(resolvedDashboard).min(1),
  })
  .meta({ id: "ResolvedDashboards" });
// A rule-group file the monitoring stack carries, as its groups
// (spec/v1/10-project-intent.md#alert-rules).
const resolvedAlertRules = z
  .strictObject({ from: text, groups: z.array(z.unknown()).min(1) })
  .meta({ id: "ResolvedAlertRules" });

// The one routing of every alert, on the Alertmanager's Application
// (spec/v1/14-platform-intent.md#monitoring): each receiver's webhook in the
// Secret its grant lands in, and a route per severity.
const resolvedAlerting = z
  .strictObject({
    receivers: z.array(
      z
        .strictObject({
          name: text,
          discord: z.strictObject({ secret: text, key: text }),
        })
        .meta({ id: "ResolvedReceiver" }),
    ),
    routes: z.array(
      z
        .strictObject({ severity: text, receiver: text, repeat: text })
        .meta({ id: "ResolvedSeverityRoute" }),
    ),
  })
  .meta({ id: "ResolvedAlerting" });

const application = {
  id: text,
  // The digest of this element, itself and the provenance excluded
  // (spec/v1/20-resolved-deployment.md#the-application-revision).
  revision: digest,
  project: text,
  namespace: text,
  reconcileUnit: text,
  reconcileAfter: z.array(text).exactOptional(),
  alertRules: z.array(resolvedAlertRules).min(1).exactOptional(),
  alerting: resolvedAlerting.exactOptional(),
  scrape: resolvedScrape.exactOptional(),
  dashboards: resolvedDashboards.exactOptional(),
  // Absent on an `interrupted` Application: it stops before it starts, so no
  // switch waits on a gate (docs/adr/model/0021-runtime-mechanics-derive-from-cutover.md).
  releaseGate: releaseGate.exactOptional(),
  // The Secret Store's endpoint, where a Process or its backup holds a grant:
  // what the operator connects through to sync every one of them.
  secretStore: text.exactOptional(),
  // Present where the Application moves its schema with a changelog.
  migration: resolvedMigration.exactOptional(),
  exposure: z.array(resolvedExposure).exactOptional(),
  // Present where the Application declares `client`.
  client: resolvedClient.exactOptional(),
  // Present where the Platform document enrols the Application's Project.
  mesh: resolvedMesh.exactOptional(),
  processes: z.array(resolvedProcess).min(1),
};

/**
 * What a derivation guarantees about one Application: it carries release-gate
 * inputs exactly when a Process of it switches blue/green.
 */
const gateFollowsSwitchover: ShapeRule<{
  readonly releaseGate?: unknown;
  readonly processes: readonly { readonly switchover?: string }[];
}> = {
  statement: {
    if: {
      properties: {
        processes: {
          type: "array",
          contains: {
            type: "object",
            required: ["switchover"],
            properties: { switchover: { const: "blue-green" } },
          },
        },
      },
    },
    // `releaseGate: true` restates the property the node already declares, so
    // a strict validator sees the required key defined where it is required.
    then: { required: ["releaseGate"], properties: { releaseGate: true } },
    else: { properties: { releaseGate: false } },
  },
  breaches: ({ releaseGate, processes }) =>
    processes.some((process) => process.switchover === "blue-green") ===
    (releaseGate !== undefined)
      ? []
      : [
          {
            path: ["releaseGate"],
            message:
              "an Application carries release-gate inputs exactly when a Process of it switches blue-green",
          },
        ],
};

const resolvedApplication = stated(
  z.strictObject(application),
  "ResolvedApplication",
  gateFollowsSwitchover,
);

// ------------------------------------------------------------ the documents

const reconcileUnit = z
  .strictObject({ name: text, after: z.array(text).exactOptional() })
  .meta({ id: "ReconcileUnit" });

const pathAssignment = z
  .strictObject({ path: text, adapter: adapterName, scope: pathScope })
  .meta({ id: "PathAssignment" });

const API_VERSION = "resolved.jorisjonkers.dev/v1";

/** The estate-wide document: every assignment, in one place. */
// The Vault policy job (spec/v1/30-deliverables.md#vault-configuration-is-rendered-not-applied):
// the one identity that writes the rendered policies and auth roles into the
// Secret Store, in the Secret Store's own namespace, with what its policy
// admits. Estate-wide, so it sits beside the Applications and in none.
const resolvedPolicyJob = z
  .strictObject({
    identity: text,
    namespace: text,
    image: text,
    imageVersion: text.exactOptional(),
    uid: count,
    gid: count,
    // The Vault role the job logs in as, a platform fixture.
    role: text,
    // The Secret Store's endpoint, where the job writes.
    address: text,
    memory: text,
    cpu: text,
    // How long one attempt may run; the Job retries until one succeeds.
    deadline: duration,
    // Every node it may land on, by name: none that holds an `sdcard` medium.
    eligibleNodes: z.array(text).min(1),
    egress: z.array(egressPeer),
    // Present where its namespace is an enrolled Project's.
    mesh: resolvedMesh.exactOptional(),
  })
  .meta({ id: "ResolvedPolicyJob" });

// One datastore's database catalog
// (spec/v1/16-dependencies.md#applying-the-catalog).
const resolvedDatabaseCatalog = z
  .strictObject({
    host: text,
    port,
    connection: text,
    admin: z
      .strictObject({ path: text, user: text, password: text })
      .meta({ id: "CatalogAdmin" }),
    databases: z
      .array(
        z
          .strictObject({ name: text, owner: text, data: text })
          .meta({ id: "CatalogDatabase" }),
      )
      .min(1),
  })
  .meta({ id: "ResolvedCatalog" });

// One object store's bucket catalog
// (spec/v1/16-dependencies.md#the-bucket-catalog): each consuming project's
// key, where it is written, and the buckets it may use.
const resolvedBucketCatalog = z
  .strictObject({
    host: text,
    port,
    admin: z
      .strictObject({ path: text, token: text })
      .meta({ id: "CatalogAdminToken" }),
    keys: z
      .array(
        z
          .strictObject({
            name: text,
            path: text,
            buckets: z.array(text).min(1),
          })
          .meta({ id: "CatalogKey" }),
      )
      .min(1),
  })
  .meta({ id: "ResolvedBucketCatalog" });

// The method that applies one datastore's catalog
// (spec/v1/16-dependencies.md#applying-the-catalog): its identity beside the
// datastore, the login it applies the catalog with, and the catalog itself.
const resolvedCatalogJob = z
  .strictObject({
    identity: text,
    namespace: text,
    image: text,
    imageVersion: text.exactOptional(),
    uid: count,
    gid: count,
    // The Vault role the method logs in as: its own, which the render writes.
    role: text,
    // The Secret Store's endpoint, where the method reads its login and
    // writes the database roles.
    address: text,
    memory: text,
    cpu: text,
    deadline: duration,
    // The policy job's own: the method runs where it may.
    eligibleNodes: z.array(text).min(1),
    catalog: z.union([resolvedDatabaseCatalog, resolvedBucketCatalog]),
    // The datastore's surface, as the consumer label the method's pods carry
    // names it (spec/v1/16-dependencies.md#the-consumer-label).
    consumes: z.array(text),
    egress: z.array(egressPeer),
    // Present where its namespace is an enrolled Project's.
    mesh: resolvedMesh.exactOptional(),
  })
  .meta({ id: "ResolvedCatalogJob" });

// Where Flux's events about every Project's unit go
// (spec/v1/55-delivery.md#rollouts): the namespace Flux's own objects live
// in, and the address of the Reporter's `http` surface that receives them.
const resolvedEvents = z
  .strictObject({ namespace: text, address: text })
  .meta({ id: "ResolvedEvents" });

export const resolvedDeployment = z
  .strictObject({
    apiVersion: z.literal(API_VERSION),
    kind: z.literal("ResolvedDeployment"),
    provenance,
    pathPlan: z.array(pathAssignment).min(1),
    reconcileUnits: z.array(reconcileUnit).min(1),
    applications: z.array(resolvedApplication).min(1),
    policyJob: resolvedPolicyJob.exactOptional(),
    catalogJobs: z.array(resolvedCatalogJob).min(1).exactOptional(),
    // Present where the platform names a Reporter.
    events: resolvedEvents.exactOptional(),
  })
  .meta({ id: "ResolvedDeployment" });

/**
 * The projection published back to one repository: the same element the
 * estate-wide document contains, standing alone with the provenance that
 * covers it. Obtained by filtering, never computed separately, so the two
 * cannot disagree about what was decided.
 */
export const resolvedApplicationDocument = stated(
  z.strictObject({
    apiVersion: z.literal(API_VERSION),
    kind: z.literal("ResolvedApplication"),
    provenance,
    ...application,
  }),
  "ResolvedApplicationDocument",
  gateFollowsSwitchover,
);

export type ResolvedDeploymentDocument = z.output<typeof resolvedDeployment>;
export type ResolvedPolicyJob = z.output<typeof resolvedPolicyJob>;
export type ResolvedDashboards = z.output<typeof resolvedDashboards>;
export type ResolvedCatalogJob = z.output<typeof resolvedCatalogJob>;
/** An outbound peer named by namespace, and by Process where one Process is the peer. */
export type EgressPeer = z.output<typeof egressPeer>;
export type ResolvedEvents = z.output<typeof resolvedEvents>;
export type ResolvedApplicationDocument = z.output<
  typeof resolvedApplicationDocument
>;
export type ResolvedProcess = ResolvedApplicationDocument["processes"][number];
export type ResolvedExposure = NonNullable<
  ResolvedApplicationDocument["exposure"]
>[number];
export type ResolvedRoute = ResolvedExposure["routes"][number];
export type ResolvedMigration = NonNullable<
  ResolvedApplicationDocument["migration"]
>;
export type ResolvedClient = NonNullable<ResolvedApplicationDocument["client"]>;
export type ReleaseGate = NonNullable<
  ResolvedApplicationDocument["releaseGate"]
>;
export type ResolvedProbe = NonNullable<ResolvedProcess["readiness"]>;
export type StartupProbe = NonNullable<ResolvedProcess["startup"]>;
export type EnvEntry = NonNullable<ResolvedProcess["environment"]>[number];
export type ResolvedL4Exposure = NonNullable<
  ResolvedProcess["l4Exposure"]
>[number];
