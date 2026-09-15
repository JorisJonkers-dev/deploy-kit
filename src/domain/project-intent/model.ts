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
  Runtime,
  Tolerance,
  TransitOperation,
} from "./vocabularies.ts";

export interface Project {
  readonly name: string;
  readonly owner: string;
  readonly applications: readonly Application[];
}

export interface Application {
  readonly id: string;
  readonly observability?: Observability;
  readonly exposures: readonly Exposure[];
  readonly grants: readonly Grant[];
  readonly processes: readonly Process[];
}

export interface SurfaceRef {
  readonly process: string;
  readonly surface: string;
}

export interface Observability {
  readonly alertClass: AlertClass;
  /** Whole or absent in the model: a document with a class and no signal is refused. */
  readonly scrape?: SurfaceRef & { readonly path: string };
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

export interface Placement {
  readonly memory: string;
  readonly cpu: string;
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

export interface Process {
  readonly name: string;
  readonly lifecycle: Lifecycle;
  readonly image: string;
  readonly runtime: Runtime;
  readonly engine?: Engine;
  readonly provides: ReadonlyMap<string, number>;
  readonly placement: Placement;
  readonly writablePaths: readonly string[];
  readonly sidecars: readonly Sidecar[];
  readonly dependencies: readonly Dependency[];
  readonly assets: readonly Asset[];
  readonly probes: ProbePolicy;
  readonly volumes: readonly Volume[];
  readonly replicas?: Capacity;
  readonly grants: readonly Grant[];
  readonly startupBudget?: string;
  readonly cutover: Cutover;
}
