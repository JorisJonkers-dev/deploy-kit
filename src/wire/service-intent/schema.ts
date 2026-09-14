// The Service Intent metamodel, declared once.
//
// This file IS the language definition's first two parts. The Zod schemas
// below are the abstract syntax written as the authoring shape (the concrete
// syntax a human types in YAML), and they are the single declaration from
// which the runtime check, the TypeScript type, the generated JSON Schema,
// and, with issue #40, chapter 10's class diagram and its field and vocabulary
// tables are all produced. There is no second copy anywhere in this
// repository, and a test holds that true.
//
// One export per class chapter 10's class diagram draws, named exactly as the
// diagram names it, plus `METAMODEL` at the bottom, which is the enumerable
// record a generator walks.
//
// Three shapes are worth reading before the rest:
//
//   - **Unions are unions.** A Grant is a discriminated union on `engine`
//     (0085) and a Probe is http or tcp. That is what makes "a `kv` field on a
//     `transit` grant" a document that is not an instance of the model, rather
//     than a rule somebody has to remember to write.
//   - **Every object is strict.** An unrecognised key is a refusal, with the
//     document path of the object that carried it. Layer 1 has no
//     passthrough, no annotations map and no escape hatch shaped like one
//     (chapter 10, The authored proxy vocabulary is two fields), and
//     `strictObject` is where that closure is actually enforced.
//   - **A closed vocabulary is an enum and nowhere else.** The seventeen lists
//     live in vocabularies.ts, which this file is the only consumer of.
import { z } from "zod";
import {
  AccessTier,
  AlertClass,
  Arch,
  Audience,
  ContentPolicy,
  Cutover,
  Delivery,
  DurabilityClass,
  Engine,
  Lifecycle,
  Match,
  Media,
  PlaceholderKind,
  Runtime,
  Tolerance,
  TransitOp,
} from "./vocabularies.ts";

// ---------------------------------------------------------------- named types
//
// "Every other attribute type is either a primitive or a named string this
// chapter constrains" (chapter 10, The closed vocabularies). Each is declared
// once here so that the class diagram's type names and the JSON Schema's
// patterns come from the same place.

const nonEmpty = (what: string): z.ZodString =>
  z.string().min(1, `${what} may not be empty`);

/** A DNS label: the domain header, and what `<domain>-system` is built from. */
export const DomainName = z
  .string()
  .regex(/^[a-z][a-z0-9-]*[a-z0-9]$/, "a domain is a lowercase DNS label");
/** The one referencable identity, estate-unique (0010). */
export const ServiceId = z
  .string()
  .regex(/^[a-z][a-z0-9-]*[a-z0-9]$/, "a Service id is a lowercase DNS label");
/** A Workload or sidecar container name. */
export const ContainerName = z
  .string()
  .regex(/^[a-z][a-z0-9-]*[a-z0-9]$/, "a container name is a DNS label");
/** An alias the images lock resolves to a digest: never a tag, never a digest. */
export const ImageAlias = z
  .string()
  .regex(
    /^[a-z0-9][a-z0-9._-]*$/,
    "an image is an alias the lock resolves, never a tag and never a digest",
  )
  .refine(
    (value) => !value.includes(":") && !value.includes("@"),
    "an image alias carries no tag and no digest",
  );
/** A surface name: the key of a `provides` map, and what a route resolves to. */
export const SurfaceName = z
  .string()
  .regex(/^[a-z][a-z0-9-]*$/, "a surface name is a lowercase name");
/** The full FQDN a Service serves, written out. There is no zone rule. */
export const Fqdn = z
  .string()
  .regex(
    /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/,
    "a host is a full FQDN",
  );
/** Unique within the Service; the second half of `${exposure:<service>.<name>}`. */
export const ExposureName = z
  .string()
  .regex(/^[a-z][a-z0-9-]*$/, "an exposure name is a lowercase name");
/** A Secret Store path. The grant unit (0023). */
export const VaultPath = nonEmpty("a Secret Store path");
/** A cluster this estate targets, naming an env overlay. */
export const ClusterTarget = nonEmpty("a Cluster Target");
/** A site the node contract publishes. */
export const Site = nonEmpty("a site");
/** A capability a node advertises, as a flat string. */
export const Capability = z
  .string()
  .regex(/^[a-z][a-z0-9-]*$/, "a capability is a flat lowercase string");
/** A GPU class the node contract publishes as `gpus[].class`. */
export const GpuClassName = nonEmpty("a gpu class");
/** An absolute filesystem or URL path. */
export const AbsolutePath = z
  .string()
  .regex(/^\//, "a path is absolute, and starts with /");
/** A path relative to the authoring repository, for an Asset's source. */
export const RelativePath = z
  .string()
  .regex(/^[^/].*$/, "an asset source is relative to the repository");
/** A Kubernetes quantity: `768Mi`, `250m`, `2Gi`, `20Gi`. */
export const Quantity = z
  .string()
  .regex(
    /^\d+(\.\d+)?(m|k|Ki|M|Mi|G|Gi|T|Ti|P|Pi)?$/,
    "a quantity like 768Mi or 250m",
  );
/** A duration: `600s`, `168h`. */
export const Duration = z
  .string()
  .regex(/^\d+(s|m|h)$/, "a duration like 600s or 168h");
/** A projected file's mode, quoted so YAML does not read it as octal. */
export const FileMode = z
  .string()
  .regex(/^0[0-7]{3}$/, 'a file mode like "0400", quoted');
/** The data model's own semver, not the toolkit package's (0039). */
export const SemVer = z
  .string()
  .regex(/^\d+\.\d+\.\d+$/, "the data model's own semver");
/**
 * One key of a granted Secret Store path.
 *
 * `keys: ['*']` is refused here rather than by a rule, because "it is not in
 * the grammar: a document carrying it fails schema validation" (chapter 10,
 * Validation). A wildcard makes a reader set undecidable without reading live
 * Vault contents, which the pinned-input rule forbids.
 */
export const SecretKey = z
  .string()
  .regex(
    /^[A-Za-z0-9][A-Za-z0-9._-]*$/,
    "enumerate the keys; there is no wildcard",
  );
/** A TCP port. Above 1024 is a rule, not a type: see E_PRIVILEGED_PORT_UNDER_NONROOT. */
export const Port = z.int().min(1).max(65535);

// ------------------------------------------------------------------- classes

/** A sidecar container: no identity, no probes, no exposure, no release of its own. */
export const Sidecar = z.strictObject({
  name: ContainerName,
  image: ImageAlias,
  memory: Quantity,
  cpu: Quantity,
});

/** An edge to `{service, surface}`, declared per Workload (0020). */
export const DependencyEdge = z.strictObject({
  service: ServiceId,
  surface: SurfaceName,
  required: z.boolean().default(true),
});

/**
 * Readiness and liveness are siblings, each carrying its own endpoint, and
 * neither falls back to the other (0014). A service with no HTTP surface uses
 * `tcp`, which is a port and not a decoration.
 */
export const Probe = z.union([
  z.strictObject({ path: AbsolutePath, port: Port }),
  z.strictObject({ tcp: Port }),
]);

/**
 * `probes: none` is an authored value. A Workload with no listener declares the
 * absence, so a forgotten probe block is never mistaken for a deliberate one.
 */
export const Probes = z.union([
  z.literal("none"),
  z.strictObject({
    readiness: Probe.optional(),
    liveness: Probe.optional(),
  }),
]);

/** A declarative settings file in the consuming application's own format (0012). */
export const Asset = z.strictObject({
  from: RelativePath,
  mountAt: AbsolutePath,
});

/** A claim, what it is worth, and how much of it there is (0015, 0081). */
export const Volume = z.strictObject({
  claim: ContainerName,
  mountAt: AbsolutePath,
  size: Quantity,
  durability: DurabilityClass,
});

/** The media term of a placement. The capacity term is derived from `volumes`. */
export const DiskRequest = z.strictObject({ media: z.array(Media).min(1) });

/** `class` and `memory`, because a flat capability string cannot describe a GPU. */
export const GpuRequest = z.strictObject({
  class: GpuClassName,
  memory: Quantity,
});

/**
 * Six hard dimensions and a flat capability set (0061). `memory` and `cpu` are
 * required on every Workload; every other term defaults to any node. There is
 * no soft half: no weight, no ordering, and no second shape the scheduler is
 * free to discard.
 */
export const Placement = z.strictObject({
  memory: Quantity,
  cpu: Quantity,
  arch: z.array(Arch).min(1).optional(),
  site: Site.optional(),
  disk: DiskRequest.optional(),
  gpu: GpuRequest.optional(),
  capabilities: z.array(Capability).min(1).optional(),
});

/**
 * The only local exception to a derived value in layer 1, and narrow on
 * purpose: `count` must exceed one, so the field cannot become a verbose
 * spelling of the default, and `reason` is required, because a capacity
 * decision is data rather than a YAML comment no tool can read (0031, 0089).
 */
export const Capacity = z.strictObject({
  count: z
    .int()
    .min(2, "replicas derives as 1; the block is for a count above one"),
  reason: nonEmpty("a replicas block states its reason"),
});

/** What the consumer can survive when the value changes, and how stale it may get. */
export const Rotation = z.strictObject({
  tolerates: Tolerance,
  maxAge: Duration.optional(),
});

const grantCommon = {
  delivery: Delivery,
  rotation: Rotation,
};

const projected = {
  mountAt: AbsolutePath.optional(),
  fileMode: FileMode.optional(),
};

/**
 * A grant is a discriminated union on `engine`, because the estate uses three
 * and they authorise different things (0085). `engine` defaults to `kv`, so
 * every grant written before that decision stays valid.
 *
 * The four access tiers are KV intents and nothing else: a `transit` grant
 * declares `operations` instead, and a `database` grant declares a role and
 * takes no tier at all, because the engine issues the credential.
 */
export const Grant = z
  .discriminatedUnion("engine", [
    z.strictObject({
      engine: z.literal("kv").default("kv"),
      path: VaultPath,
      keys: z.array(SecretKey).min(1),
      access: AccessTier,
      ...projected,
      ...grantCommon,
    }),
    z.strictObject({
      engine: z.literal("database"),
      role: nonEmpty("a database role"),
      ...projected,
      ...grantCommon,
    }),
    z.strictObject({
      engine: z.literal("transit"),
      key: nonEmpty("a transit key name"),
      operations: z.array(TransitOp).min(1),
      ...grantCommon,
    }),
  ])
  .superRefine((grant, ctx) => {
    // "`mountAt`, `fileMode` | `file` only" (chapter 10, Secrets). A projected
    // file's landing place means nothing for a value that is never projected,
    // and a field that is quietly ignored is the shape this model exists to
    // remove.
    if (grant.delivery === "file" || grant.engine === "transit") return;
    for (const key of ["mountAt", "fileMode"] as const)
      if (grant[key] !== undefined)
        ctx.addIssue({
          code: "custom",
          path: [key],
          message: `${key} belongs to delivery: file, and this grant is delivery: ${grant.delivery}`,
        });
  });

/** One path of a host, and which of this Service's Workloads serves it. */
export const Route = z.strictObject({
  path: AbsolutePath,
  match: Match,
  workload: ContainerName,
  surface: SurfaceName,
  audience: Audience.optional(),
  redirectTo: AbsolutePath.optional(),
});

/**
 * This hostname routes here. It sits on the Service, because one hostname
 * fronts two processes in the live `auth` case, and it carries its own routing.
 */
export const Exposure = z.strictObject({
  name: ExposureName,
  host: Fqdn,
  audience: Audience,
  contentPolicy: ContentPolicy.optional(),
  routes: z.array(Route).min(1),
});

/** Which Workload publishes the signal, on which surface, at which path. */
export const Scrape = z.strictObject({
  workload: ContainerName,
  surface: SurfaceName,
  path: AbsolutePath,
});

/**
 * Whole or absent (0021). `scrape` is optional **in the schema** so that the
 * half-declared block is representable and can be refused by the name the
 * specification gives it, `E_ALERT_CLASS_WITHOUT_SIGNAL`. Making it required
 * here would refuse the same documents and report `schema`, losing the code a
 * refusal fixture expects and #44 registers.
 */
export const Observability = z.strictObject({
  alertClass: AlertClass,
  scrape: Scrape.optional(),
});

/**
 * One process. `provides` is a flat map of surface name to port, because a port
 * is an integer written where it is used and a port is a property of a process.
 */
export const Workload = z
  .strictObject({
    name: ContainerName,
    lifecycle: Lifecycle,
    image: ImageAlias,
    runtime: Runtime,
    engine: Engine.optional(),
    startupBudget: Duration,
    cutover: Cutover,
    writablePaths: z.array(AbsolutePath).min(1).optional(),
    provides: z.record(SurfaceName, Port).optional(),
    sidecars: z.array(Sidecar).min(1).optional(),
    dependsOn: z.array(DependencyEdge).min(1).optional(),
    probes: Probes,
    assets: z.array(Asset).min(1).optional(),
    volumes: z.array(Volume).min(1).optional(),
    placement: Placement,
    replicas: Capacity.optional(),
    secrets: z.array(Grant).min(1).optional(),
  })
  .superRefine((workload, ctx) => {
    // "Timings, thresholds and deadlines stay derived. A Workload that declares
    // ports but no probe declaration is refused" (chapter 10, Probes). The
    // chapter names no code for it, so it is a shape rule rather than a
    // registered rule, and it reports as `schema`.
    const listens = Object.keys(workload.provides ?? {}).length > 0;
    const declares =
      workload.probes !== "none" &&
      (workload.probes.readiness !== undefined ||
        workload.probes.liveness !== undefined);
    if (listens && !declares)
      ctx.addIssue({
        code: "custom",
        path: ["probes"],
        message:
          "a Workload that declares ports declares a probe; write `probes: none` " +
          "only where there is nothing to probe",
      });
    // A sidecar may not take the Workload's own name: the Workload is one of
    // the pod's containers.
    for (const [index, sidecar] of (workload.sidecars ?? []).entries())
      if (sidecar.name === workload.name)
        ctx.addIssue({
          code: "custom",
          path: ["sidecars", index, "name"],
          message: "a sidecar may not take the Workload's own container name",
        });
  });

/** A product: one or more Workloads that switch together (0062). */
export const Service = z.strictObject({
  id: ServiceId,
  observability: Observability.optional(),
  exposure: z.array(Exposure).min(1).optional(),
  workloads: z.array(Workload).min(1),
  secrets: z.array(Grant).min(1).optional(),
});

/**
 * One authored file: one domain, one Intent Fragment (0063).
 *
 * `apiVersion` and `kind` are the header chapter 10 states, and they are
 * required: the namespace `intent.jorisjonkers.dev` exists precisely because
 * three mutually incompatible documents shared one, which is the defect 0003
 * exists to fix. A document that does not say which language it is written in
 * cannot be held to one.
 */
export const Domain = z.strictObject({
  apiVersion: z.literal("intent.jorisjonkers.dev/v1"),
  kind: z.literal("Domain"),
  schemaVersion: SemVer,
  domain: DomainName,
  owner: nonEmpty("an owner"),
  services: z.array(Service).min(1),
});

/** The authoring shape: what a human writes, before defaults are filled. */
export type DomainInput = z.input<typeof Domain>;
/** The validated shape: what the mapper reads, with every default present. */
export type DomainOutput = z.output<typeof Domain>;
export type WorkloadOutput = z.output<typeof Workload>;
export type ServiceOutput = z.output<typeof Service>;
export type GrantOutput = z.output<typeof Grant>;
export type ProbeOutput = z.output<typeof Probe>;

/**
 * The metamodel, enumerable.
 *
 * `root` is the document class; `classes` is every class chapter 10's diagram
 * draws, keyed by the name the diagram uses. Issue #40 generates the mermaid
 * block, the drawio drawing and the chapter's field tables by walking this, and
 * issue #41 declares Platform Intent's own record beside it in the same shape.
 *
 * `EnvFile` and `Placeholder` are in the record and are not reachable from
 * `Domain`: layer 1 is authored as **two** artefacts (chapter 10, Two
 * artefacts), and the second one is a dotenv file rather than YAML. Its
 * grammar is in env-file.ts, and its classes are declared here so the drawing
 * and the tables cover the whole language rather than the half of it that
 * happens to be YAML.
 */
export const METAMODEL = {
  name: "Service Intent",
  document: "Domain",
  classes: {
    Domain,
    Service,
    Observability,
    Scrape,
    Workload,
    Capacity,
    Sidecar,
    DependencyEdge,
    Probe,
    Asset,
    Volume,
    Placement,
    DiskRequest,
    GpuRequest,
    Exposure,
    Route,
    Grant,
    Rotation,
    EnvFile: z.strictObject({
      cluster: ClusterTarget.optional(),
      entries: z.record(z.string(), z.string()),
    }),
    Placeholder: z.strictObject({
      kind: PlaceholderKind,
      source: z.string(),
    }),
    Surface: z.strictObject({ name: SurfaceName, port: Port }),
  },
} as const;
