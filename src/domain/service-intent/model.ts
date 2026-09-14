// Service Intent's abstract syntax: the classes chapter 10 draws, as domain
// types.
//
// This is not the authoring shape and deliberately does not mirror it
// (docs/architecture.md#the-wire-boundary). Three differences carry their
// weight:
//
//   - `provides` is a map from surface name to port in the file, because that
//     is the shortest thing to write; it is a `Surface[]` here, because a
//     surface is a class with a name and a port and a route resolves against
//     one.
//   - A Grant is one union on `engine` here. In the file `engine` may be
//     omitted and means `kv` (0085); by the time it reaches the domain the
//     discriminator is always present.
//   - Every node carries `at`, the document path it was read from. A rule
//     that refuses a value can therefore say where it is without the document
//     being re-walked, and a Diagnostic's address is a property of the model
//     rather than of the code that happened to find the defect.
//
// The domain imports nothing: no Zod, no YAML, no filesystem
// (.dependency-cruiser.cjs, `domain-is-pure`).

/**
 * A node of the abstract syntax, addressed by where it was authored.
 *
 * The field is `at` rather than `path` because two classes already carry a
 * `path` of their own that means something else entirely: a Route's URL path
 * and a Grant's Secret Store path. One word, two meanings, is the defect
 * CONTEXT.md exists to prevent, so the document address takes the other word
 * and matches the Diagnostic field it ends up in.
 */
export interface Node {
  /** This node's document path, e.g. `services[0].workloads[1]`. */
  readonly at: string;
}

export type Lifecycle = "service" | "job";
export type Runtime = "jvm" | "python" | "node" | "static" | "none";
export type Engine = "postgres" | "rabbitmq" | "valkey" | "files";
export type Cutover = "rolling" | "recreate";
export type DurabilityClass =
  "reconstructible" | "recoverable" | "irreplaceable";
export type Arch = "amd64" | "arm64";
export type Media = "nvme" | "ssd" | "hdd";
export type AlertClass = "business-hours" | "urgent" | "page";
export type Audience = "anonymous" | "authenticated" | "internal" | "lan";
export type ContentPolicy = "strict" | "admin" | "workflow";
export type Match = "prefix" | "exact";
export type SecretEngine = "kv" | "database" | "transit";
export type AccessTier = "read" | "self-renew" | "self-roll" | "custody";
export type TransitOp = "sign" | "verify" | "encrypt" | "decrypt" | "rotate";
export type Delivery = "env" | "file" | "self";
export type Tolerance = "restart" | "reload";
export type PlaceholderKind = "secret" | "dependency" | "exposure" | "identity";

/** One name from a Workload's `provides` map, with the port it declares. */
export interface Surface extends Node {
  readonly name: string;
  readonly port: number;
}

export interface Sidecar extends Node {
  readonly name: string;
  readonly image: string;
  readonly memory: string;
  readonly cpu: string;
}

export interface DependencyEdge extends Node {
  readonly service: string;
  readonly surface: string;
  readonly required: boolean;
}

/** An HTTP probe (`path` + `port`) or a TCP one (`tcp`), never both. */
export type Probe =
  | (Node & {
      readonly kind: "http";
      readonly path: string;
      readonly port: number;
    })
  | (Node & { readonly kind: "tcp"; readonly tcp: number });

/**
 * What a Workload says about probing. `none` is an authored value, not an
 * absence: a forgotten probe block is more dangerous than a forgotten alert,
 * so the opt-out is explicit (chapter 10, Probes).
 */
export type Probes =
  | { readonly kind: "none" }
  | {
      readonly kind: "declared";
      readonly readiness?: Probe;
      readonly liveness?: Probe;
    };

export interface Asset extends Node {
  readonly from: string;
  readonly mountAt: string;
}

export interface Volume extends Node {
  readonly claim: string;
  readonly mountAt: string;
  readonly size: string;
  readonly durability: DurabilityClass;
}

export interface DiskRequest extends Node {
  readonly media: readonly Media[];
}

export interface GpuRequest extends Node {
  readonly class: string;
  readonly memory: string;
}

export interface Placement extends Node {
  readonly memory: string;
  readonly cpu: string;
  readonly arch?: readonly Arch[];
  readonly site?: string;
  readonly disk?: DiskRequest;
  readonly gpu?: GpuRequest;
  readonly capabilities?: readonly string[];
}

export interface Capacity extends Node {
  readonly count: number;
  readonly reason: string;
}

export interface Rotation extends Node {
  readonly tolerates: Tolerance;
  readonly maxAge?: string;
}

/**
 * A grant, as a union on `engine` (0085). The three engines authorise
 * different things, so they are three shapes rather than one shape with seven
 * optional fields: a `kv` field on a `transit` grant is not a rule to check,
 * it is a document that is not an instance of this model at all.
 */
export type Grant = Node &
  Readonly<{ delivery: Delivery; rotation: Rotation }> &
  (
    | Readonly<{
        engine: "kv";
        path: string;
        keys: readonly string[];
        access: AccessTier;
        mountAt?: string;
        fileMode?: string;
      }>
    | Readonly<{
        engine: "database";
        role: string;
        mountAt?: string;
        fileMode?: string;
      }>
    | Readonly<{
        engine: "transit";
        key: string;
        operations: readonly TransitOp[];
      }>
  );

export interface Route extends Node {
  readonly path: string;
  readonly match: Match;
  readonly workload: string;
  readonly surface: string;
  readonly audience?: Audience;
  readonly redirectTo?: string;
}

export interface Exposure extends Node {
  readonly name: string;
  readonly host: string;
  readonly audience: Audience;
  readonly contentPolicy?: ContentPolicy;
  readonly routes: readonly Route[];
}

export interface Scrape extends Node {
  readonly workload: string;
  readonly surface: string;
  readonly path: string;
}

/**
 * Whole or absent, and a half-declared block is the one refusal chapter 10
 * makes about monitoring. The block is optional on a Service; `scrape` is
 * optional **here** so that the half-declared case is representable and can be
 * refused by name (`E_ALERT_CLASS_WITHOUT_SIGNAL`) rather than by the schema,
 * which would lose the code the fixture expects.
 */
export interface Observability extends Node {
  readonly alertClass: AlertClass;
  readonly scrape?: Scrape;
}

export interface Workload extends Node {
  readonly name: string;
  readonly lifecycle: Lifecycle;
  readonly image: string;
  readonly runtime: Runtime;
  readonly engine?: Engine;
  readonly startupBudget: string;
  readonly cutover: Cutover;
  readonly writablePaths: readonly string[];
  readonly provides: readonly Surface[];
  readonly sidecars: readonly Sidecar[];
  readonly dependsOn: readonly DependencyEdge[];
  readonly probes: Probes;
  readonly assets: readonly Asset[];
  readonly volumes: readonly Volume[];
  readonly placement: Placement;
  readonly replicas?: Capacity;
  readonly secrets: readonly Grant[];
}

export interface Service extends Node {
  readonly id: string;
  readonly observability?: Observability;
  readonly exposure: readonly Exposure[];
  readonly workloads: readonly Workload[];
  readonly secrets: readonly Grant[];
}

/** One authored file: one domain, one Intent Fragment (0063). */
export interface Domain extends Node {
  readonly schemaVersion: string;
  readonly domain: string;
  readonly owner: string;
  readonly services: readonly Service[];
}

/** A literal line of an env file: a key and the text that fills it. */
export interface Literal extends Node {
  readonly key: string;
  readonly value: string;
}

/**
 * A named-source reference inside an env file's value. It names a source and
 * resolves to exactly one value; it is never a template language, so it takes
 * no arguments, has no conditionals and has no arithmetic (chapter 10,
 * Configuration).
 */
export interface Placeholder extends Node {
  readonly kind: PlaceholderKind;
  /** The text between the kind and the closing brace, verbatim. */
  readonly source: string;
  /** The env key whose value carries this placeholder. */
  readonly key: string;
}

/** One `base.env`, or one `<cluster>.env` overlay, of one Workload (0011). */
export interface EnvFile extends Node {
  /** The Cluster Target an overlay is for; absent on `base.env`. */
  readonly cluster?: string;
  readonly literals: readonly Literal[];
  readonly placeholders: readonly Placeholder[];
}

/** Every Workload of a Domain, flattened, with the Service that holds it. */
export function workloadsOf(
  document: Domain,
): readonly { readonly service: Service; readonly workload: Workload }[] {
  return document.services.flatMap((service) =>
    service.workloads.map((workload) => ({ service, workload })),
  );
}

/** Whether a Durability Class derives a backup job (0077). */
export function derivesBackup(durability: DurabilityClass): boolean {
  return durability !== "reconstructible";
}

/** The grants a Workload effectively holds: its Service's, plus its own. */
export function grantsOf(
  service: Service,
  workload: Workload,
): readonly Grant[] {
  return [...service.secrets, ...workload.secrets];
}
