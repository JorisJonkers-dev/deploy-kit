import type {
  AlertClass,
  Audience,
  ContentPolicy,
  Cutover,
  Lifecycle,
  Match,
  Runtime,
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
  readonly processes: readonly Process[];
}

export interface SurfaceRef {
  readonly process: string;
  readonly surface: string;
}

export interface Observability {
  readonly alertClass: AlertClass;
  readonly scrape: SurfaceRef & { readonly path: string };
}

export interface Exposure {
  readonly name: string;
  readonly host: string;
  readonly audience: Audience;
  readonly contentPolicy: ContentPolicy;
  readonly routes: readonly Route[];
}

export interface Route extends SurfaceRef {
  readonly path: string;
  readonly match: Match;
}

export interface Probe {
  readonly path: string;
  readonly port: number;
}

export interface Process {
  readonly name: string;
  readonly lifecycle: Lifecycle;
  readonly image: string;
  readonly runtime: Runtime;
  readonly provides: ReadonlyMap<string, number>;
  readonly placement: { readonly memory: string; readonly cpu: string };
  readonly probes: { readonly readiness?: Probe; readonly liveness?: Probe };
  readonly startupBudget?: string;
  readonly cutover: Cutover;
}
