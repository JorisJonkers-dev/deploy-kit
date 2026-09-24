import type {
  Audience,
  DurabilityClass,
  Engine,
} from "../project-intent/vocabularies.ts";
import type {
  CertificateSource,
  Datastore,
  HardeningClass,
  Listener,
  PolicyController,
} from "./vocabularies.ts";

export interface Platform {
  readonly owner: string;
  readonly cluster: string;
  readonly nodeContract: string;
  readonly substrate: Substrate;
  readonly tiers: readonly Tier[];
  /** The policy for each Durability Class the platform backs, keyed by the class. */
  readonly durability: ReadonlyMap<DurabilityClass, DurabilityPolicy>;
  /** The backup image for each engine, keyed by the engine. */
  readonly engines: ReadonlyMap<Engine, string>;
  readonly hardening: HardeningClass;
  /** The runner every managed migration builds on, and its terms; absent where none is offered. */
  readonly migration?: MigrationPolicy;
  readonly providers: readonly Provider[];
}

export interface MigrationPolicy {
  readonly runner: string;
  readonly deadline: string;
  readonly memory: string;
  readonly cpu: string;
}

export interface Substrate {
  readonly kubernetesVersion: string;
  readonly datastore: Datastore;
  readonly serverCount: number;
  readonly secretsEncryption: boolean;
  readonly cni: string;
  readonly networkPolicyController: PolicyController;
}

export interface Tier {
  readonly name: string;
  readonly audiences: readonly Audience[];
  readonly listener: Listener;
  readonly certificates: CertificateSource;
  readonly forwardAuth?: string;
  /** The id of the Application whose proxy this tier is, linked over the set of documents. */
  readonly proxy: string;
}

export interface DurabilityPolicy {
  readonly schedule?: string;
  readonly retain?: number;
  readonly offCluster?: {
    readonly destination: string;
    readonly credential: string;
  };
}

export interface Provider {
  readonly name: string;
  readonly address: string;
  readonly surfaces: ReadonlyMap<string, number>;
}
