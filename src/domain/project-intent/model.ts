import type {
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
  Medium,
  PlaceholderKind,
  Runtime,
  Tolerance,
  TransitOperation,
} from "./vocabularies.ts";

/** The eight families of spec/v1/10-project-intent.md#shared-intent. */
export interface SharedIntent {
  readonly grants: readonly Grant[];
  readonly dependencies: readonly Dependency[];
  readonly assets: readonly Asset[];
  readonly writablePaths: readonly string[];
  readonly env: readonly EnvFile[];
  readonly placement?: Placement;
  readonly startupBudget?: string;
  readonly cutover?: Cutover;
}

export interface Project extends SharedIntent {
  readonly name: string;
  readonly owner: string;
  readonly applications: readonly Application[];
}

export interface Application extends SharedIntent {
  readonly id: string;
  readonly observability?: Observability;
  readonly exposures: readonly Exposure[];
  readonly processes: readonly Process[];
}

/** A port a Process listens on, named once, in its `provides`. */
export interface Surface {
  readonly name: string;
  readonly port: number;
}

/** A Process and one of its surfaces, resolved from the names a document writes. */
export interface SurfaceRef {
  readonly process: Process;
  readonly surface: Surface;
}

export interface Scrape extends SurfaceRef {
  readonly path: string;
}

export interface Observability {
  readonly alertClass: AlertClass;
  /** Whole or absent in the model: a document with a class and no signal is refused. */
  readonly scrape?: Scrape;
}

export interface Exposure {
  readonly name: string;
  readonly host: string;
  readonly audience: Audience;
  readonly contentPolicy?: ContentPolicy;
  readonly routes: readonly Route[];
}

export interface Route extends SurfaceRef {
  readonly path: string;
  readonly match: Match;
  readonly audience?: Audience;
  readonly redirectTo?: string;
}

export type Probe =
  { readonly path: string; readonly port: number } | { readonly tcp: number };

export type ProbePolicy =
  "none" | { readonly readiness?: Probe; readonly liveness?: Probe };

export interface Rotation {
  readonly tolerates: Tolerance;
  readonly maxAge?: string;
}

interface GrantDelivery {
  readonly delivery: Delivery;
  readonly mountAt?: string;
  readonly fileMode?: string;
  readonly rotation?: Rotation;
}

export interface KvGrant extends GrantDelivery {
  readonly path: string;
  readonly keys: readonly string[];
  readonly access: AccessTier;
}

export interface DatabaseGrant extends GrantDelivery {
  readonly engine: "database";
  readonly role: string;
}

export interface TransitGrant extends GrantDelivery {
  readonly engine: "transit";
  readonly key: string;
  readonly operations: readonly TransitOperation[];
}

export type Grant = KvGrant | DatabaseGrant | TransitGrant;

/** A quantity is optional here and required on an {@link EffectiveProcess}. */
export interface Placement {
  readonly memory?: string;
  readonly cpu?: string;
  readonly arch: readonly Arch[];
  readonly site?: string;
  readonly disk?: { readonly media: readonly Medium[] };
  readonly gpu?: { readonly class: string; readonly memory: string };
  readonly capabilities: readonly string[];
}

export interface Sidecar {
  readonly name: string;
  readonly image: string;
  readonly memory: string;
  readonly cpu: string;
}

export interface Dependency {
  readonly application: string;
  readonly surface: string;
  readonly required: boolean;
}

export interface Asset {
  readonly from: string;
  readonly mountAt: string;
}

/** One authored dotenv file. `cluster` absent is `base.env`, which does not vary. */
export interface EnvFile {
  readonly cluster?: string;
  readonly entries: readonly EnvVariable[];
}

export interface EnvVariable {
  readonly name: string;
  readonly value: EnvValue;
}

/** A value is a literal or one placeholder, never a literal holding one. */
export type EnvValue = EnvLiteral | Placeholder;

export interface EnvLiteral {
  readonly text: string;
}

export interface Placeholder {
  readonly kind: PlaceholderKind;
  readonly source: string;
}

export interface Volume {
  readonly claim: string;
  readonly mountAt: string;
  readonly size?: string;
  readonly durability: DurabilityClass;
}

export interface Capacity {
  readonly count: number;
  readonly reason: string;
}

export interface Process extends SharedIntent {
  readonly name: string;
  readonly lifecycle: Lifecycle;
  readonly image: string;
  readonly runtime: Runtime;
  readonly engine?: Engine;
  readonly surfaces: readonly Surface[];
  readonly sidecars: readonly Sidecar[];
  readonly probes: ProbePolicy;
  readonly volumes: readonly Volume[];
  readonly replicas?: Capacity;
}

export interface CompletePlacement extends Placement {
  readonly memory: string;
  readonly cpu: string;
}

/** The lowered shape, and the only layer-1 one anything downstream reads
 * (spec/v1/10-project-intent.md#the-effective-intent). */
export interface EffectiveProject {
  readonly name: string;
  readonly owner: string;
  readonly applications: readonly EffectiveApplication[];
}

export interface EffectiveApplication {
  readonly id: string;
  readonly observability?: Observability;
  readonly exposures: readonly Exposure[];
  readonly processes: readonly EffectiveProcess[];
}

export interface EffectiveProcess extends Process {
  readonly placement: CompletePlacement;
  readonly cutover: Cutover;
}
