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
  HARDENING_CLASSES,
  LISTENERS,
} from "./platform-intent.ts";
import {
  ACCESS_TIERS,
  ALERT_CLASSES,
  AUDIENCES,
  CONTENT_POLICIES,
  CUTOVERS,
  DATABASE_ENGINES,
  DELIVERIES,
  DURABILITY_CLASSES,
  LIFECYCLES,
  MATCHES,
  RUNTIMES,
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

/** Which allow-set rule admits an inbound peer (spec/v1/16-dependencies.md#the-derived-allow-set). */
export const INGRESS_RULES = [
  "tier-proxy",
  "metrics-stack",
  "consumer",
  "backup",
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
] as const;

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
const alertClass = z.enum(ALERT_CLASSES).meta({ id: "AlertClass" });
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

// A `transit` or `database` grant: read by the Process itself and synced
// nowhere, so what the projection holds is the paths its policy covers,
// derived from the engine (spec/v1/10-project-intent.md#secrets).
const resolvedEngineGrant = z
  .strictObject({
    engine: z.enum([...TRANSIT_ENGINES, ...DATABASE_ENGINES]),
    delivery: z.literal("self"),
    paths: z.array(policyPath).min(1),
    restartTargets: z.array(text).exactOptional(),
  })
  .meta({ id: "ResolvedEngineGrant" });

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

// An address range outside the cluster a policy admits, on one port: where an
// off-cluster copy goes (spec/v1/14-platform-intent.md#durability-policy).
const destinationRange = z
  .strictObject({ cidr: text, port })
  .meta({ id: "DestinationRange" });

const backupPlan = z
  .strictObject({
    schedule: text,
    // How many copies are kept: the method prunes to this count after a run.
    retain: count,
    offCluster: text.exactOptional(),
    method: text,
    uid: count,
    gid: count,
    identity: text,
    claim: text,
    credential: resolvedGrant.exactOptional(),
    // What the backup identity's own policy admits: the Process it dumps, on
    // the surface its engine's method connects to, and the cluster's DNS. Not
    // the Secret Store: the operator reads the credential for it.
    egress: z.array(egressPeer),
    // Where an off-cluster copy goes, as the durability policy states it.
    destinations: z.array(destinationRange).exactOptional(),
  })
  .meta({ id: "BackupPlan" });

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

// A file-shaped settings file, by the content-hashed name an edit changes, so
// an edit restarts the Process (spec/v1/10-project-intent.md#assets).
const resolvedAsset = z
  .strictObject({ name: text, from: text, mountAt: text, content: z.string() })
  .meta({ id: "ResolvedAsset" });

// A container beside the Process in its pod, its image pinned by digest.
const resolvedSidecar = z
  .strictObject({ name: text, image: text, memory: text, cpu: text })
  .meta({ id: "ResolvedSidecar" });

const policyPeer = z
  .strictObject({ namespace: text, process: text, port })
  .meta({ id: "PolicyPeer" });

const resolvedEdge = z
  .strictObject({
    application: text,
    surface: text,
    address: text,
    peers: z.array(policyPeer).exactOptional(),
  })
  .meta({ id: "ResolvedEdge" });

// A port a Process provides, by the surface name that is what a route, a
// scrape and a policy name it by.
const resolvedSurface = z
  .strictObject({ name: text, port })
  .meta({ id: "ResolvedSurface" });

const ingressRule = z.enum(INGRESS_RULES).meta({ id: "IngressRule" });

// An inbound peer the Process's policy admits, on one of its own ports.
const ingressPeer = z
  .strictObject({ rule: ingressRule, namespace: text, process: text, port })
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
        },
        then: { properties: { switchover: { enum: [...switchovers] } } },
      })),
    ],
  },
  breaches: ({ cutover, switchover }) => {
    if (switchover === undefined) return [];
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
    uid: count,
    gid: count,
    // Absent on a `lifecycle: prepare` Process: it runs once and cuts over
    // nothing (docs/adr/model/0027-prepare-processes-are-forward-only-setup.md).
    cutover: cutover.exactOptional(),
    // Present on a `lifecycle: application` Process; a job has no switchover.
    switchover: switchover.exactOptional(),
    deadline: duration,
    replicas: z.int().min(1),
    memory: text,
    cpu: text,
    hardening: hardeningClass,
    identityToken: z.boolean(),
    readiness: resolvedProbe.exactOptional(),
    liveness: resolvedProbe.exactOptional(),
    startup: startupProbe.exactOptional(),
    placement: resolvedPlacement,
    volumes: z.array(resolvedVolume).exactOptional(),
    secrets: z
      .array(z.union([resolvedGrant, resolvedEngineGrant]))
      .exactOptional(),
    assets: z.array(resolvedAsset).exactOptional(),
    sidecars: z.array(resolvedSidecar).exactOptional(),
    dependencies: z.array(resolvedEdge).exactOptional(),
    writablePaths: z.array(writablePath).exactOptional(),
    environment: z.array(envEntry).exactOptional(),
    surfaces: z.array(resolvedSurface).exactOptional(),
    ingress: z.array(ingressPeer).exactOptional(),
    egress: z.array(egressPeer).exactOptional(),
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
  })
  .meta({ id: "MiddlewareStep" });

const resolvedRoute = z
  .strictObject({
    path: text,
    match,
    process: text,
    surface: text,
    audience,
    // Specificity alone, smallest evaluated first: exact before prefix, longer
    // prefix before shorter (docs/adr/model/0023-exposure-is-declared-by-audience.md).
    precedence: z.int().min(1),
    // The chain follows the audience, and a route may override the audience, so
    // it hangs off the route rather than off the host it is served on.
    middleware: z.array(middlewareStep).exactOptional(),
  })
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

const gateMember = z
  .strictObject({
    process: text,
    readiness: probeTarget,
    checks: z.array(analysisCheck).exactOptional(),
  })
  .meta({ id: "GateMember" });

// The Platform document's cadence, carried so the projection is all the gate reads.
const gateAnalysis = z
  .strictObject({ interval: duration, iterations: count, threshold: count })
  .meta({ id: "GateAnalysis" });

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
  })
  .meta({ id: "ReleaseGate" });

// What layer 2 records of a migration (spec/v1/20-resolved-deployment.md#the-migration):
// the runner image the Application's changelog was built into, the serving
// revision its compatibility was proven against (absent on a first release,
// when nothing serves), and whether the release holds a changeset that cannot
// run in a transaction, which no automatic undo may touch
// (spec/v1/55-delivery.md#failure-and-undo). Everything else about it is a
// fixed function of the Application id and the Platform document.
const resolvedMigration = z
  .strictObject({
    runner: text,
    testedAgainst: digest.exactOptional(),
    nonTransactional: z.boolean(),
  })
  .meta({ id: "ResolvedMigration" });

// The monitor an Application's observability derives: which surface of which
// Process, at which path, at the platform's cadence.
const resolvedScrape = z
  .strictObject({
    process: text,
    surface: text,
    path: text,
    interval: duration,
    timeout: duration,
  })
  .meta({ id: "ResolvedScrape" });

const application = {
  id: text,
  // The digest of this element, itself and the provenance excluded
  // (spec/v1/20-resolved-deployment.md#the-application-revision).
  revision: digest,
  project: text,
  namespace: text,
  reconcileUnit: text,
  reconcileAfter: z.array(text).exactOptional(),
  alertClass: alertClass.exactOptional(),
  scrape: resolvedScrape.exactOptional(),
  // Absent on an `interrupted` Application: it stops before it starts, so no
  // switch waits on a gate (docs/adr/model/0021-runtime-mechanics-derive-from-cutover.md).
  releaseGate: releaseGate.exactOptional(),
  // The Secret Store's endpoint, where a Process or its backup holds a grant:
  // what the operator connects through to sync every one of them.
  secretStore: text.exactOptional(),
  // Present where the Application moves its schema with a changelog.
  migration: resolvedMigration.exactOptional(),
  exposure: z.array(resolvedExposure).exactOptional(),
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
export const resolvedDeployment = z
  .strictObject({
    apiVersion: z.literal(API_VERSION),
    kind: z.literal("ResolvedDeployment"),
    provenance,
    pathPlan: z.array(pathAssignment).min(1),
    reconcileUnits: z.array(reconcileUnit).min(1),
    applications: z.array(resolvedApplication).min(1),
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
export type ReleaseGate = NonNullable<
  ResolvedApplicationDocument["releaseGate"]
>;
export type ResolvedProbe = NonNullable<ResolvedProcess["readiness"]>;
export type StartupProbe = NonNullable<ResolvedProcess["startup"]>;
export type EnvEntry = NonNullable<ResolvedProcess["environment"]>[number];
