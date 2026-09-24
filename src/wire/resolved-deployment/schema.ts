// The shape of the Resolved Deployment, schemaVersion 1, as
// spec/v1/20-resolved-deployment.md#the-model defines it. Two kinds share one
// schema family: a `ResolvedDeployment` covers the composed estate, and a
// `ResolvedApplication` is the projection published back to one repository
// (docs/adr/model/0033-assignments-published-back.md).
//
// No key here is a Kubernetes or Traefik field name. Layer 2 records the
// `cutover` a Process was granted and the `switchover` it derives, the
// `hardening` posture it takes and the
// capacity it needs; a rollout strategy, a security context and a resource
// block are the `kubernetes` adapter's spelling of those decisions
// (docs/adr/model/0097-authored-values-name-model-concepts.md).
import { z } from "zod";
import { HARDENING_CLASSES } from "../../domain/platform-intent/vocabularies.ts";
import {
  ACCESS_TIERS,
  ALERT_CLASSES,
  AUDIENCES,
  CONTENT_POLICIES,
  CUTOVERS,
  DELIVERIES,
  DURABILITY_CLASSES,
  MATCHES,
} from "../../domain/project-intent/vocabularies.ts";
import {
  ADAPTERS,
  MIDDLEWARE_KINDS,
  PATH_SCOPES,
  ANALYSIS_CHECKS,
  PINNED_INPUTS,
  SWITCHOVERS,
} from "../../domain/resolved-deployment/vocabularies.ts";

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
 * (docs/adr/model/0088-startup-probe-targets-liveness.md). Different input,
 * different derivation, different class.
 */
const startupProbe = z
  .union([
    httpProbe.extend({ period: duration, failures: count }),
    tcpProbe.extend({ period: duration, failures: count }),
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

const backupPlan = z
  .strictObject({
    schedule: text,
    retain: count,
    offCluster: text.exactOptional(),
    method: text,
  })
  .meta({ id: "BackupPlan" });

const resolvedVolume = z
  .strictObject({
    claim: text,
    size: text,
    durability: durabilityClass,
    // `reconstructible` earns none, which is the absence rather than a class.
    backup: backupPlan.exactOptional(),
  })
  .meta({ id: "ResolvedVolume" });

const resolvedGrant = z
  .strictObject({
    path: text,
    keys: z.array(text).min(1).exactOptional(),
    access: accessTier,
    delivery,
    // A grant with `delivery: self` and `tolerates: reload` derives none, which
    // is what makes its rotation zero-downtime.
    restartTargets: z.array(text).exactOptional(),
  })
  .meta({ id: "ResolvedGrant" });

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

const writablePath = z
  .strictObject({ path: text, size: text })
  .meta({ id: "WritablePath" });

const envEntry = z
  .strictObject({ name: text, value: z.string() })
  .meta({ id: "EnvEntry" });

const resolvedProcess = z
  .strictObject({
    name: text,
    identity: text,
    image: text,
    uid: count,
    gid: count,
    // Absent on a `lifecycle: prepare` Process: it runs once and cuts over
    // nothing (docs/adr/model/0131-prepare-processes-are-forward-only-setup.md).
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
    secrets: z.array(resolvedGrant).exactOptional(),
    dependencies: z.array(resolvedEdge).exactOptional(),
    writablePaths: z.array(writablePath).exactOptional(),
    environment: z.array(envEntry).exactOptional(),
  })
  .meta({ id: "ResolvedProcess" });

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
    // prefix before shorter (docs/adr/model/0093-route-precedence-is-derived.md).
    precedence: z.int().min(1),
    // The chain follows the audience, and a route may override the audience, so
    // it hangs off the route rather than off the host it is served on.
    middleware: z.array(middlewareStep).exactOptional(),
  })
  .meta({ id: "ResolvedRoute" });

const resolvedExposure = z
  .strictObject({
    name: text,
    host: text,
    tier: text,
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
// the runner image the Application's changelog was built into, and the serving
// revision its compatibility was proven against. Everything else about it is a
// fixed function of the Application id and the Platform document.
const resolvedMigration = z
  .strictObject({ runner: text, testedAgainst: digest.exactOptional() })
  .meta({ id: "ResolvedMigration" });

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
  // Absent on an `interrupted` Application: it stops before it starts, so no
  // switch waits on a gate (docs/adr/model/0128-cutover-names-the-promise.md).
  releaseGate: releaseGate.exactOptional(),
  // Present where the Application moves its schema with a changelog.
  migration: resolvedMigration.exactOptional(),
  exposure: z.array(resolvedExposure).exactOptional(),
  processes: z.array(resolvedProcess).min(1),
};

/** The switchovers each `cutover` may derive (spec/v1/55-delivery.md#switchover):
 * `rolling` is the delivery machinery's, which no gate switches. */
const SWITCHOVERS_OF = {
  continuous: ["blue-green", "rolling"],
  interrupted: ["stop-start"],
} as const satisfies Record<string, readonly string[]>;

/**
 * What a derivation guarantees and the shape alone cannot say: a Process's
 * switchover is one its cutover derives, and an Application carries
 * release-gate inputs exactly when a Process of it switches blue/green.
 */
function switchoverFollowsCutover(
  element: {
    readonly releaseGate?: unknown;
    readonly processes: readonly {
      readonly cutover?: keyof typeof SWITCHOVERS_OF;
      readonly switchover?: string;
    }[];
  },
  context: z.RefinementCtx,
): void {
  for (const [index, process] of element.processes.entries()) {
    if (process.switchover === undefined) continue;
    if (process.cutover === undefined) {
      context.addIssue({
        code: "custom",
        path: ["processes", index, "switchover"],
        message: "a Process with no cutover switches nothing",
      });
      continue;
    }
    const allowed: readonly string[] = SWITCHOVERS_OF[process.cutover];
    if (!allowed.includes(process.switchover))
      context.addIssue({
        code: "custom",
        path: ["processes", index, "switchover"],
        message: `a ${process.cutover} cutover derives the ${allowed.join(" or ")} switchover`,
      });
  }
  const gated = element.processes.some(
    (process) => process.switchover === "blue-green",
  );
  if (gated !== (element.releaseGate !== undefined))
    context.addIssue({
      code: "custom",
      path: ["releaseGate"],
      message:
        "an Application carries release-gate inputs exactly when a Process of it switches blue-green",
    });
}

const resolvedApplication = z
  .strictObject(application)
  .superRefine(switchoverFollowsCutover)
  .meta({ id: "ResolvedApplication" });

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
export const resolvedApplicationDocument = z
  .strictObject({
    apiVersion: z.literal(API_VERSION),
    kind: z.literal("ResolvedApplication"),
    provenance,
    ...application,
  })
  .superRefine(switchoverFollowsCutover)
  .meta({ id: "ResolvedApplicationDocument" });

export type ResolvedDeploymentDocument = z.output<typeof resolvedDeployment>;
export type ResolvedApplicationDocument = z.output<
  typeof resolvedApplicationDocument
>;
