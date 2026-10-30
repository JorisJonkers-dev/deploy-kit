// The custom resources this estate renders, typed the same way: Flagger's
// Canary, the Identity Provider's Client, the Prometheus Operator's
// PodMonitor, Traefik's IngressRoute. Only the fields the render sets.
import type { Container, Labels, ObjectMeta, PodSpec } from "./kubernetes.ts";

export interface Webhook {
  readonly name: string;
  readonly type:
    "confirm-rollout" | "rollout" | "confirm-promotion" | "rollback";
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
    /** The autoscaler holding the count, where the Process declares one above one. */
    readonly autoscalerRef?: {
      readonly apiVersion: "autoscaling/v2";
      readonly kind: "HorizontalPodAutoscaler";
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

/**
 * The Identity Provider's Client (spec/v1/17-sign-in.md#the-client):
 * cluster-scoped, named by the Application Id, every field derived from the
 * Application's `client` block and the exposure it names.
 */
export interface Client {
  readonly apiVersion: "identity.jorisjonkers.dev/v1";
  readonly kind: "Client";
  readonly metadata: Omit<ObjectMeta, "namespace">;
  readonly spec: {
    readonly signIn: "native" | "gated" | "token";
    readonly host: string;
    readonly launchUrl?: string;
    readonly iconUrl?: string;
    readonly redirectUris?: readonly string[];
    readonly backChannelLogoutUri?: string;
    readonly credential?: "secret" | "pkce";
    readonly secretPath?: string;
    readonly roles: readonly string[];
    readonly label?: string;
    readonly description?: string;
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
    // A port by its name where the model names it, and by number for a pod
    // the render does not write, such as Flux's.
    readonly podMetricsEndpoints: readonly ((
      { readonly port: string } | { readonly portNumber: number }
    ) & {
      readonly path: string;
      readonly interval: string;
      readonly scrapeTimeout: string;
    })[];
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

/** Traefik's Middleware, as a route's own `rateLimit` or `redirectRegex`, or a shared `headers` one. */
export interface Middleware {
  readonly apiVersion: "traefik.io/v1alpha1";
  readonly kind: "Middleware";
  readonly metadata: ObjectMeta;
  readonly spec:
    | {
        readonly rateLimit: {
          readonly average: number;
          readonly period: string;
          readonly burst: number;
          readonly sourceCriterion?: { readonly requestHeaderName: string };
        };
      }
    | {
        readonly forwardAuth: {
          readonly address: string;
          readonly trustForwardHeader: boolean;
          readonly authResponseHeaders?: readonly string[];
        };
      }
    | {
        readonly headers: {
          readonly contentTypeNosniff: boolean;
          readonly frameDeny: boolean;
          readonly referrerPolicy: string;
          readonly permissionsPolicy: string;
          readonly stsSeconds: number;
          readonly stsIncludeSubdomains: boolean;
          readonly contentSecurityPolicy?: string;
        };
      }
    | {
        readonly redirectRegex: {
          readonly regex: string;
          readonly replacement: string;
          readonly permanent: boolean;
        };
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
    readonly secretRef?: { readonly name: string };
    readonly verify: {
      readonly provider: "cosign";
      readonly matchOIDCIdentity: readonly {
        readonly issuer: string;
        readonly subject: string;
      }[];
    };
  };
}

/** Where Flux posts its events: a generic webhook, named by its address. */
export interface FluxProvider {
  readonly apiVersion: "notification.toolkit.fluxcd.io/v1beta3";
  readonly kind: "Provider";
  readonly metadata: ObjectMeta;
  readonly spec: { readonly type: "generic"; readonly address: string };
}

/** Which of Flux's events go to a Provider: every event of the objects it selects. */
export interface FluxAlert {
  readonly apiVersion: "notification.toolkit.fluxcd.io/v1beta3";
  readonly kind: "Alert";
  readonly metadata: ObjectMeta;
  readonly spec: {
    readonly providerRef: { readonly name: string };
    readonly eventSeverity: "info";
    readonly eventSources: readonly {
      readonly kind: "Kustomization";
      readonly name: string;
      readonly matchLabels: Labels;
    }[];
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
    readonly healthCheckExprs: readonly {
      readonly apiVersion: string;
      readonly kind: string;
      readonly current: string;
    }[];
    readonly sourceRef: {
      readonly kind: "OCIRepository";
      readonly name: string;
    };
    readonly path: string;
    readonly dependsOn?: readonly { readonly name: string }[];
    readonly patches?: readonly {
      readonly patch: string;
      readonly target: { readonly kind: string };
    }[];
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
    readonly hmacSecretData: true;
    readonly destination: {
      readonly name: string;
      readonly create: true;
      readonly annotations: Readonly<Record<string, string>>;
    };
    readonly rolloutRestartTargets?: readonly {
      readonly kind: "Deployment" | "DaemonSet" | "StatefulSet";
      readonly name: string;
    }[];
  };
}

/** A credential the Secret Store issues and renews, synced to a Secret. */
export interface VaultDynamicSecret {
  readonly apiVersion: "secrets.hashicorp.com/v1beta1";
  readonly kind: "VaultDynamicSecret";
  readonly metadata: ObjectMeta;
  readonly spec: {
    readonly vaultAuthRef: string;
    readonly mount: string;
    readonly path: string;
    readonly destination: {
      readonly name: string;
      readonly create: true;
      readonly annotations: Readonly<Record<string, string>>;
    };
    readonly rolloutRestartTargets?: readonly {
      readonly kind: "Deployment" | "StatefulSet";
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

/** A Project's generated keys, which the Vault policy job writes where Vault lacks them. */
export interface GeneratedKey {
  readonly path: string;
  readonly key: string;
  readonly bytes: number;
  readonly encoding: "hex" | "base64" | "base64url";
  readonly adopt?: { readonly path: string; readonly key: string };
}

export interface GeneratedKeys {
  readonly keys: readonly GeneratedKey[];
}

/** A Kubernetes auth role, bound to one ServiceAccount and the one policy it holds. */
export interface VaultRole {
  readonly bound_service_account_names: readonly string[];
  readonly bound_service_account_namespaces: readonly string[];
  readonly token_policies: readonly string[];
}

/** grafana-operator's dashboard: one Grafana dashboard's JSON, for one instance. */
export interface GrafanaDashboard {
  readonly apiVersion: "grafana.integreatly.org/v1beta1";
  readonly kind: "GrafanaDashboard";
  readonly metadata: ObjectMeta;
  readonly spec: {
    readonly instanceSelector: {
      readonly matchLabels: Readonly<Record<string, string>>;
    };
    readonly allowCrossNamespaceImport: true;
    readonly folder: string;
    readonly json: string;
    readonly datasources?: readonly {
      readonly inputName: string;
      readonly datasourceName: string;
    }[];
  };
}

/** The Prometheus operator's rule groups, as a rule-group file holds them. */
export interface PrometheusRule {
  readonly apiVersion: "monitoring.coreos.com/v1";
  readonly kind: "PrometheusRule";
  readonly metadata: ObjectMeta;
  readonly spec: { readonly groups: readonly unknown[] };
}

/** The Prometheus operator's alert routing: one route per severity, and the receivers. */
export interface AlertmanagerConfig {
  readonly apiVersion: "monitoring.coreos.com/v1alpha1";
  readonly kind: "AlertmanagerConfig";
  readonly metadata: ObjectMeta;
  readonly spec: {
    readonly route: {
      readonly receiver: string;
      readonly groupBy: readonly string[];
      readonly groupWait: string;
      readonly groupInterval: string;
      readonly repeatInterval: string;
      readonly routes: readonly {
        readonly matchers: readonly {
          readonly name: string;
          readonly value: string;
        }[];
        readonly receiver: string;
        readonly repeatInterval: string;
      }[];
    };
    readonly receivers: readonly {
      readonly name: string;
      readonly discordConfigs?: readonly {
        readonly apiURL: { readonly name: string; readonly key: string };
        readonly sendResolved: boolean;
      }[];
    }[];
  };
}

/** A selector the operator matches objects by: every one where it names no label. */
export interface LabelSelection {
  readonly matchLabels?: Readonly<Record<string, string>>;
}

/** The container the operator generates, as the render patches it. */
export interface OperatedContainer {
  readonly name: string;
  readonly env?: Container["env"];
  readonly securityContext: Container["securityContext"];
  readonly volumeMounts?: Container["volumeMounts"];
  readonly readinessProbe?: Container["readinessProbe"];
  readonly livenessProbe?: Container["livenessProbe"];
  readonly startupProbe?: Container["startupProbe"];
}

/** What the Prometheus operator's Prometheus and Alertmanager share: the pod the operator runs. */
export interface OperatedSpec {
  readonly image: string;
  readonly version?: string;
  readonly replicas: number;
  readonly serviceAccountName: string;
  readonly automountServiceAccountToken: boolean;
  readonly priorityClassName?: string;
  readonly podMetadata: {
    readonly labels: Labels;
    readonly annotations?: Readonly<Record<string, string>>;
  };
  readonly portName: string;
  readonly securityContext: PodSpec["securityContext"];
  readonly affinity?: PodSpec["affinity"];
  readonly resources: NonNullable<Container["resources"]>;
  readonly containers: readonly OperatedContainer[];
  readonly volumes?: PodSpec["volumes"];
  readonly additionalArgs?: readonly {
    readonly name: string;
    readonly value?: string;
  }[];
}

/** The monitoring stack's Prometheus, which the operator runs and configures. */
export interface Prometheus {
  readonly apiVersion: "monitoring.coreos.com/v1";
  readonly kind: "Prometheus";
  readonly metadata: ObjectMeta;
  readonly spec: OperatedSpec & {
    readonly scrapeInterval: string;
    readonly scrapeTimeout: string;
    readonly evaluationInterval: string;
    readonly serviceMonitorSelector: LabelSelection;
    readonly serviceMonitorNamespaceSelector: LabelSelection;
    readonly podMonitorSelector: LabelSelection;
    readonly podMonitorNamespaceSelector: LabelSelection;
    readonly scrapeConfigSelector: LabelSelection;
    readonly scrapeConfigNamespaceSelector: LabelSelection;
    readonly ruleSelector: LabelSelection;
    readonly ruleNamespaceSelector: LabelSelection;
    readonly alerting?: {
      readonly alertmanagers: readonly {
        readonly namespace: string;
        readonly name: string;
        readonly port: string;
        readonly apiVersion: "v2";
      }[];
    };
    readonly retention?: string;
    readonly retentionSize?: string;
    readonly enableRemoteWriteReceiver?: true;
    readonly enableFeatures?: readonly string[];
  };
}

/** The monitoring stack's Alertmanager, which the operator runs and configures. */
export interface Alertmanager {
  readonly apiVersion: "monitoring.coreos.com/v1";
  readonly kind: "Alertmanager";
  readonly metadata: ObjectMeta;
  readonly spec: OperatedSpec & {
    readonly alertmanagerConfigSelector: LabelSelection;
    readonly alertmanagerConfigMatcherStrategy: { readonly type: "None" };
    readonly retention?: string;
  };
}

/** A relabelling step of a scrape, as the Prometheus operator spells it. */
export interface Relabeling {
  readonly action?: "replace" | "drop";
  readonly sourceLabels?: readonly string[];
  readonly regex?: string;
  readonly targetLabel?: string;
  readonly replacement?: string;
}

/** How a scrape of a k3s component authenticates: as the metrics stack's ServiceAccount, by its token. */
export interface ScrapeAuthorization {
  readonly type: "Bearer";
  readonly credentials: { readonly name: string; readonly key: "token" };
}

/** A scrape of something no Service or pod label names: here, every node's kubelet. */
export interface ScrapeConfig {
  readonly apiVersion: "monitoring.coreos.com/v1alpha1";
  readonly kind: "ScrapeConfig";
  readonly metadata: ObjectMeta;
  readonly spec: {
    readonly jobName: string;
    readonly kubernetesSDConfigs: readonly { readonly role: "Node" }[];
    readonly scheme: "HTTPS";
    readonly metricsPath: string;
    readonly scrapeInterval: string;
    readonly scrapeTimeout: string;
    readonly honorLabels: true;
    readonly honorTimestamps: true;
    readonly authorization: ScrapeAuthorization;
    readonly tlsConfig: { readonly insecureSkipVerify: true };
    readonly relabelings: readonly Relabeling[];
    readonly metricRelabelings?: readonly Relabeling[];
  };
}

/** The API server, scraped through its own Service over TLS. */
export interface ApiServerMonitor {
  readonly apiVersion: "monitoring.coreos.com/v1";
  readonly kind: "ServiceMonitor";
  readonly metadata: ObjectMeta;
  readonly spec: {
    readonly jobLabel: string;
    readonly selector: { readonly matchLabels: Labels };
    readonly namespaceSelector: { readonly matchNames: readonly string[] };
    readonly endpoints: readonly {
      readonly port: string;
      readonly scheme: "https";
      readonly interval: string;
      readonly scrapeTimeout: string;
      readonly authorization: ScrapeAuthorization;
      readonly tlsConfig: {
        readonly ca: {
          readonly configMap: { readonly name: string; readonly key: string };
        };
        readonly serverName: string;
      };
      readonly metricRelabelings: readonly Relabeling[];
    }[];
  };
}

/** The cluster's DNS, scraped from its pods by port number under a job of its own. */
export interface CoreDnsMonitor {
  readonly apiVersion: "monitoring.coreos.com/v1";
  readonly kind: "PodMonitor";
  readonly metadata: ObjectMeta;
  readonly spec: {
    readonly jobLabel: string;
    readonly selector: { readonly matchLabels: Labels };
    readonly namespaceSelector: { readonly matchNames: readonly string[] };
    readonly podMetricsEndpoints: readonly {
      readonly portNumber: number;
      readonly path: string;
      readonly interval: string;
      readonly scrapeTimeout: string;
      readonly relabelings: readonly Relabeling[];
    }[];
  };
}

/** The long-lived token of a ServiceAccount, which Kubernetes fills in itself. */
export interface ServiceAccountToken {
  readonly apiVersion: "v1";
  readonly kind: "Secret";
  readonly metadata: ObjectMeta & {
    readonly annotations: {
      readonly "kubernetes.io/service-account.name": string;
    };
  };
  readonly type: "kubernetes.io/service-account-token";
}
