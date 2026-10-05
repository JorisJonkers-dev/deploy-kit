// The custom resources this estate renders, typed the same way: Flagger's
// Canary, the Prometheus Operator's PodMonitor, Traefik's IngressRoute. Only
// the fields the render sets.
import type { Labels, ObjectMeta } from "./kubernetes.ts";

export interface Webhook {
  readonly name: string;
  readonly type: "confirm-rollout" | "rollout" | "confirm-promotion";
  readonly url: string;
  readonly metadata: Readonly<Record<string, string>>;
}

export interface Canary {
  readonly apiVersion: "flagger.app/v1beta1";
  readonly kind: "Canary";
  readonly metadata: ObjectMeta;
  readonly spec: {
    readonly provider: "kubernetes";
    readonly targetRef: {
      readonly apiVersion: "apps/v1";
      readonly kind: "Deployment";
      readonly name: string;
    };
    readonly progressDeadlineSeconds: number;
    readonly service: {
      readonly port: number;
      readonly targetPort: string;
      readonly portName: string;
    };
    readonly analysis: {
      readonly interval: string;
      readonly iterations: number;
      readonly threshold: number;
      readonly webhooks: readonly Webhook[];
    };
  };
}

export interface PodMonitor {
  readonly apiVersion: "monitoring.coreos.com/v1";
  readonly kind: "PodMonitor";
  readonly metadata: ObjectMeta;
  readonly spec: {
    readonly jobLabel: string;
    readonly selector: { readonly matchLabels: Labels };
    readonly namespaceSelector: { readonly matchNames: readonly string[] };
    readonly podMetricsEndpoints: readonly {
      readonly port: string;
      readonly path: string;
      readonly interval: string;
      readonly scrapeTimeout: string;
    }[];
  };
}

export interface IngressRoute {
  readonly apiVersion: "traefik.io/v1alpha1";
  readonly kind: "IngressRoute";
  readonly metadata: ObjectMeta;
  readonly spec: {
    readonly entryPoints: readonly string[];
    readonly routes: readonly {
      readonly kind: "Rule";
      readonly match: string;
      readonly priority: number;
      readonly middlewares: readonly {
        readonly name: string;
        readonly namespace: string;
      }[];
      readonly services: readonly {
        readonly name: string;
        readonly namespace: string;
        readonly port: number;
      }[];
    }[];
    readonly tls?: { readonly certResolver?: string };
  };
}

export interface ServiceMonitor {
  readonly apiVersion: "monitoring.coreos.com/v1";
  readonly kind: "ServiceMonitor";
  readonly metadata: ObjectMeta;
  readonly spec: {
    readonly jobLabel: string;
    readonly selector: { readonly matchLabels: Labels };
    readonly namespaceSelector: { readonly matchNames: readonly string[] };
    readonly endpoints: readonly {
      readonly port: string;
      readonly path: string;
      readonly interval: string;
      readonly scrapeTimeout: string;
    }[];
  };
}

/**
 * A Project's pin (spec/v1/55-delivery.md#rendered-artifacts-and-pins): the
 * one artifact Flux fetches for it, by digest, and whose keyless signature it
 * accepts.
 */
export interface OciRepository {
  readonly apiVersion: "source.toolkit.fluxcd.io/v1";
  readonly kind: "OCIRepository";
  readonly metadata: ObjectMeta;
  readonly spec: {
    readonly interval: string;
    readonly url: string;
    readonly ref: { readonly digest: string };
    readonly verify: {
      readonly provider: "cosign";
      readonly matchOIDCIdentity: readonly {
        readonly issuer: string;
        readonly subject: string;
      }[];
    };
  };
}

/** One Reconcile Unit as Flux applies it: a path of a pinned artifact, after the units it follows. */
export interface FluxKustomization {
  readonly apiVersion: "kustomize.toolkit.fluxcd.io/v1";
  readonly kind: "Kustomization";
  readonly metadata: ObjectMeta;
  readonly spec: {
    readonly interval: string;
    readonly prune: true;
    readonly wait: true;
    readonly sourceRef: {
      readonly kind: "OCIRepository";
      readonly name: string;
    };
    readonly path: string;
    readonly dependsOn?: readonly { readonly name: string }[];
  };
}

/** The operator's connection to the Secret Store, one per project namespace. */
export interface VaultConnection {
  readonly apiVersion: "secrets.hashicorp.com/v1beta1";
  readonly kind: "VaultConnection";
  readonly metadata: ObjectMeta;
  readonly spec: { readonly address: string; readonly skipTLSVerify: false };
}

/** How the operator authenticates as one Process identity. */
export interface VaultAuth {
  readonly apiVersion: "secrets.hashicorp.com/v1beta1";
  readonly kind: "VaultAuth";
  readonly metadata: ObjectMeta;
  readonly spec: {
    readonly vaultConnectionRef: string;
    readonly method: "kubernetes";
    readonly mount: "kubernetes";
    readonly kubernetes: {
      readonly role: string;
      readonly serviceAccount: string;
    };
  };
}

/** One granted kv path, synced to the Secret the grant names. */
export interface VaultStaticSecret {
  readonly apiVersion: "secrets.hashicorp.com/v1beta1";
  readonly kind: "VaultStaticSecret";
  readonly metadata: ObjectMeta;
  readonly spec: {
    readonly vaultAuthRef: string;
    readonly mount: string;
    readonly type: "kv-v2";
    readonly path: string;
    readonly refreshAfter: string;
    readonly destination: {
      readonly name: string;
      readonly create: true;
      readonly annotations: Readonly<Record<string, string>>;
    };
    readonly rolloutRestartTargets?: readonly {
      readonly kind: "Deployment";
      readonly name: string;
    }[];
  };
}

/** A Vault policy in its JSON form: each path and what it may do there. */
export interface VaultPolicy {
  readonly path: Readonly<
    Record<string, { readonly capabilities: readonly string[] }>
  >;
}

/** A Kubernetes auth role, bound to one ServiceAccount and the one policy it holds. */
export interface VaultRole {
  readonly bound_service_account_names: readonly string[];
  readonly bound_service_account_namespaces: readonly string[];
  readonly token_policies: readonly string[];
}
