// The authoring shape of the Platform document, schemaVersion 1, as
// spec/v1/14-platform-intent.md defines it. Class ids name what the descriptor
// and the generated JSON Schema call each block, and never collide with a
// Project Intent class: a policy keyed by a closed vocabulary is a class with
// one optional feature per literal, so a missing policy is an absent feature.
import { z } from "zod";
import { AUDIENCES } from "../../domain/project-intent/vocabularies.ts";
import {
  CERTIFICATE_SOURCES,
  DATASTORES,
  HARDENING_CLASSES,
  LISTENERS,
  POLICY_CONTROLLERS,
} from "../../domain/platform-intent/vocabularies.ts";

const text = z.string().min(1);
const count = z.int().min(1);
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
  })
  .meta({ id: "Substrate" });

// Where each Project's render is published and who signs it
// (spec/v1/55-delivery.md#rendered-artifacts-and-pins): one artifact per
// Project under `repository`, verified keyless against the signer's identity.
const renderedArtifacts = z
  .strictObject({
    repository: text,
    signer: z
      .strictObject({ issuer: text, subject: text })
      .meta({ id: "ArtifactSigner" }),
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
    // The platform Application whose proxy this tier is, declared in a project
    // file the platform owns: a reference into another document.
    traefik: text.meta({ reference: "Application" }),
  })
  .meta({ id: "Tier" });

const offClusterCopy = z
  .strictObject({ destination: text, credential: text })
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

const enginePolicy = z
  .strictObject({ backup: text })
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
// the cadence every analysis runs at.
const analysisPolicy = z
  .strictObject({ interval: text, iterations: count, threshold: count })
  .meta({ id: "AnalysisPolicy" });

const deliveryPolicy = z
  .strictObject({
    machinery: z.array(text.meta({ reference: "Application" })).min(1),
    analysis: analysisPolicy,
  })
  .meta({ id: "DeliveryPolicy" });

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
    hardening: hardeningClass,
    probes: probeCadence,
    ephemeral: ephemeralPolicy,
    migration: migrationPolicy.exactOptional(),
    delivery: deliveryPolicy.exactOptional(),
    providers: z.array(provider).min(1).exactOptional(),
  })
  .meta({ id: "Platform" });

export type PlatformIntentDocument = z.output<typeof platformIntent>;
