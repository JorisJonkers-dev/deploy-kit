// The authoring shape of a Project Intent document, schemaVersion 1, as
// spec/v1/10-project-intent.md defines it. Every class carries the id the
// descriptor and the generated JSON Schema name it by, and a union in the
// language is a union here.
import { z } from "zod";
import {
  ACCESS_TIERS,
  DATABASE_ENGINES,
  TRANSIT_ENGINES,
  ALERT_CLASSES,
  ARCHITECTURES,
  AUDIENCES,
  CONTENT_POLICIES,
  CUTOVERS,
  DELIVERIES,
  DURABILITY_CLASSES,
  ENGINES,
  LIFECYCLES,
  MATCHES,
  MEDIA,
  RUNTIMES,
  TOLERANCES,
  TRANSIT_OPERATIONS,
} from "../../domain/project-intent/vocabularies.ts";

// Every closed vocabulary is named, because the descriptor and the generated
// JSON Schema name it.
const accessTier = z.enum(ACCESS_TIERS).meta({ id: "AccessTier" });
const databaseEngine = z.enum(DATABASE_ENGINES).meta({ id: "DatabaseEngine" });
const transitEngine = z.enum(TRANSIT_ENGINES).meta({ id: "TransitEngine" });
const alertClass = z.enum(ALERT_CLASSES).meta({ id: "AlertClass" });
const arch = z.enum(ARCHITECTURES).meta({ id: "Arch" });
const audience = z.enum(AUDIENCES).meta({ id: "Audience" });
const contentPolicy = z.enum(CONTENT_POLICIES).meta({ id: "ContentPolicy" });
const cutover = z.enum(CUTOVERS).meta({ id: "Cutover" });
const delivery = z.enum(DELIVERIES).meta({ id: "Delivery" });
const durabilityClass = z
  .enum(DURABILITY_CLASSES)
  .meta({ id: "DurabilityClass" });
const engine = z.enum(ENGINES).meta({ id: "Engine" });
const lifecycle = z.enum(LIFECYCLES).meta({ id: "Lifecycle" });
const match = z.enum(MATCHES).meta({ id: "Match" });
const media = z.enum(MEDIA).meta({ id: "Media" });
const runtime = z.enum(RUNTIMES).meta({ id: "Runtime" });
const tolerance = z.enum(TOLERANCES).meta({ id: "Tolerance" });
const transitOp = z.enum(TRANSIT_OPERATIONS).meta({ id: "TransitOp" });

const text = z.string().min(1);
const port = z.int().min(1).max(65535);

const httpProbe = z
  .strictObject({ path: text, port })
  .meta({ id: "HttpProbe" });
const tcpProbe = z.strictObject({ tcp: port }).meta({ id: "TcpProbe" });
const probe = z.union([httpProbe, tcpProbe]);

const probes = z
  .strictObject({
    readiness: probe.exactOptional(),
    liveness: probe.exactOptional(),
  })
  .meta({ id: "Probes" });
const noProbes = z.literal("none").meta({ id: "NoProbes" });

const rotation = z
  .strictObject({
    tolerates: tolerance,
    maxAge: text.exactOptional(),
  })
  .meta({ id: "Rotation" });

const grantDelivery = {
  delivery: delivery,
  mountAt: text.exactOptional(),
  fileMode: text.exactOptional(),
  rotation: rotation.exactOptional(),
};

const kvGrant = z
  .strictObject({
    path: text,
    keys: z.array(text).min(1),
    access: accessTier,
    ...grantDelivery,
  })
  .meta({ id: "KvGrant" });

const databaseGrant = z
  .strictObject({
    engine: databaseEngine,
    role: text,
    ...grantDelivery,
  })
  .meta({ id: "DatabaseGrant" });

const transitGrant = z
  .strictObject({
    engine: transitEngine,
    key: text,
    operations: z.array(transitOp).min(1),
    ...grantDelivery,
  })
  .meta({ id: "TransitGrant" });

const grant = z.union([kvGrant, databaseGrant, transitGrant]);

const diskRequest = z
  .strictObject({ media: z.array(media).min(1) })
  .meta({ id: "DiskRequest" });

const gpuRequest = z
  .strictObject({ class: text, memory: text })
  .meta({ id: "GpuRequest" });

const placement = z
  .strictObject({
    memory: text,
    cpu: text,
    arch: z.array(arch).min(1).exactOptional(),
    site: text.exactOptional(),
    disk: diskRequest.exactOptional(),
    gpu: gpuRequest.exactOptional(),
    capabilities: z.array(text).min(1).exactOptional(),
  })
  .meta({ id: "Placement" });

const sidecar = z
  .strictObject({ name: text, image: text, memory: text, cpu: text })
  .meta({ id: "Sidecar" });

const dependencyEdge = z
  .strictObject({
    application: text,
    surface: text,
    required: z.boolean().exactOptional(),
  })
  .meta({ id: "DependencyEdge" });

const asset = z
  .strictObject({ from: text, mountAt: text })
  .meta({ id: "Asset" });

const volume = z
  .strictObject({
    claim: text,
    mountAt: text,
    size: text.exactOptional(),
    durability: durabilityClass,
  })
  .meta({ id: "Volume" });

const capacity = z
  .strictObject({ count: z.int().min(2), reason: text })
  .meta({ id: "Capacity" });

const process = z
  .strictObject({
    name: text,
    lifecycle: lifecycle,
    image: text,
    runtime: runtime,
    engine: engine.exactOptional(),
    provides: z.record(text, port).exactOptional(),
    placement,
    writablePaths: z.array(text).min(1).exactOptional(),
    sidecars: z.array(sidecar).min(1).exactOptional(),
    dependsOn: z.array(dependencyEdge).min(1).exactOptional(),
    assets: z.array(asset).min(1).exactOptional(),
    probes: z.union([noProbes, probes]).exactOptional(),
    volumes: z.array(volume).min(1).exactOptional(),
    replicas: capacity.exactOptional(),
    secrets: z.array(grant).min(1).exactOptional(),
    startupBudget: text.exactOptional(),
    cutover: cutover,
  })
  .meta({ id: "Process" });

const route = z
  .strictObject({
    path: text,
    match: match,
    process: text,
    surface: text,
    audience: audience.exactOptional(),
    redirectTo: text.exactOptional(),
  })
  .meta({ id: "Route" });

const exposure = z
  .strictObject({
    name: text,
    host: text,
    audience: audience,
    contentPolicy: contentPolicy.exactOptional(),
    routes: z.array(route).min(1),
  })
  .meta({ id: "Exposure" });

const scrape = z
  .strictObject({ process: text, surface: text, path: text })
  .meta({ id: "Scrape" });

// `scrape` is optional in the shape, not in the model: a block carrying a class
// and no signal is refused by a rule with its own code, not by the schema.
const observability = z
  .strictObject({ alertClass: alertClass, scrape: scrape.exactOptional() })
  .meta({ id: "Observability" });

const application = z
  .strictObject({
    id: text,
    observability: observability.exactOptional(),
    exposure: z.array(exposure).min(1).exactOptional(),
    secrets: z.array(grant).min(1).exactOptional(),
    processes: z.array(process).min(1),
  })
  .meta({ id: "Application" });

export const projectIntent = z
  .strictObject({
    apiVersion: z.literal("intent.jorisjonkers.dev/v1"),
    kind: z.literal("Project"),
    schemaVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
    project: text,
    owner: text,
    applications: z.array(application).min(1),
  })
  .meta({ id: "Project" });

export type ProjectIntentDocument = z.output<typeof projectIntent>;
