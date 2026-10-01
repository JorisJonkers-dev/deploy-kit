// The typed object model (docs/architecture.md#serialization): only the
// fields this estate sets, so a field the model cannot express cannot be set by
// an adapter. A shape, not a participant: it imports nothing from the compiler.

export type Labels = Readonly<Record<string, string>>;

export interface ObjectMeta {
  readonly name: string;
  readonly namespace?: string;
  readonly labels: Labels;
  readonly annotations?: Readonly<Record<string, string>>;
}

export interface Namespace {
  readonly apiVersion: "v1";
  readonly kind: "Namespace";
  readonly metadata: ObjectMeta;
}

export interface Kustomization {
  readonly apiVersion: "kustomize.config.k8s.io/v1beta1";
  readonly kind: "Kustomization";
  readonly namespace?: string;
  readonly resources: readonly string[];
}

export interface ServiceAccount {
  readonly apiVersion: "v1";
  readonly kind: "ServiceAccount";
  readonly metadata: ObjectMeta;
}

export type Probe = (
  | { readonly httpGet: { readonly path: string; readonly port: number } }
  | { readonly tcpSocket: { readonly port: number } }
) & {
  readonly periodSeconds: number;
  readonly timeoutSeconds: number;
  readonly failureThreshold: number;
  readonly initialDelaySeconds?: number;
};

/** A variable is a value, or one key of a Secret the operator syncs. */
export type EnvVar =
  | { readonly name: string; readonly value: string }
  | {
      readonly name: string;
      readonly valueFrom: {
        readonly secretKeyRef: { readonly name: string; readonly key: string };
      };
    };

export interface VolumeMount {
  readonly name: string;
  readonly mountPath: string;
  readonly subPath?: string;
  readonly readOnly?: true;
}

export type Volume =
  | {
      readonly name: string;
      readonly persistentVolumeClaim: {
        readonly claimName: string;
        readonly readOnly?: true;
      };
    }
  | {
      readonly name: string;
      readonly configMap: {
        readonly name: string;
        readonly items: readonly {
          readonly key: string;
          readonly path: string;
        }[];
      };
    }
  | {
      readonly name: string;
      readonly emptyDir: { readonly sizeLimit: string };
    };

export interface PodSpec {
  readonly serviceAccountName: string;
  readonly automountServiceAccountToken: boolean;
  readonly restartPolicy?: "OnFailure";
  readonly securityContext: {
    readonly runAsNonRoot: true;
    readonly runAsUser: number;
    readonly runAsGroup: number;
    readonly fsGroup?: number;
    readonly seccompProfile: { readonly type: "RuntimeDefault" };
  };
  readonly containers: readonly Container[];
  readonly volumes?: readonly Volume[];
}

export interface Container {
  readonly name: string;
  readonly image: string;
  readonly ports?: readonly {
    readonly name: string;
    readonly containerPort: number;
  }[];
  readonly env?: readonly EnvVar[];
  readonly envFrom?: readonly {
    readonly secretRef: { readonly name: string };
  }[];
  // A backup's method image carries no quantity the model holds, so it asks
  // for none.
  readonly resources?: {
    readonly requests: { readonly memory: string; readonly cpu: string };
    readonly limits: { readonly memory: string };
  };
  readonly securityContext: {
    readonly readOnlyRootFilesystem: true;
    readonly capabilities: { readonly drop: readonly ["ALL"] };
  };
  readonly volumeMounts?: readonly VolumeMount[];
  readonly readinessProbe?: Probe;
  readonly livenessProbe?: Probe;
  readonly startupProbe?: Probe;
}

export interface Deployment {
  readonly apiVersion: "apps/v1";
  readonly kind: "Deployment";
  readonly metadata: ObjectMeta;
  readonly spec: {
    readonly replicas?: number;
    readonly strategy:
      | {
          readonly type: "RollingUpdate";
          readonly rollingUpdate: {
            readonly maxSurge: number;
            readonly maxUnavailable: number;
          };
        }
      | { readonly type: "Recreate" };
    readonly progressDeadlineSeconds: number;
    readonly selector: { readonly matchLabels: Labels };
    readonly template: {
      readonly metadata: { readonly labels: Labels };
      readonly spec: PodSpec;
    };
  };
}

export interface CronJob {
  readonly apiVersion: "batch/v1";
  readonly kind: "CronJob";
  readonly metadata: ObjectMeta;
  readonly spec: {
    readonly schedule: string;
    readonly concurrencyPolicy: "Forbid";
    readonly jobTemplate: {
      readonly spec: {
        readonly template: {
          readonly metadata: { readonly labels: Labels };
          readonly spec: PodSpec;
        };
      };
    };
  };
}

export interface ConfigMap {
  readonly apiVersion: "v1";
  readonly kind: "ConfigMap";
  readonly metadata: ObjectMeta;
  readonly immutable: true;
  readonly data: Readonly<Record<string, string>>;
}

export interface PolicyPeer {
  readonly namespaceSelector: { readonly matchLabels: Labels };
  readonly podSelector?: { readonly matchLabels: Labels };
}

export interface PolicyPort {
  readonly protocol: "TCP" | "UDP";
  readonly port: number;
}

export interface NetworkPolicy {
  readonly apiVersion: "networking.k8s.io/v1";
  readonly kind: "NetworkPolicy";
  readonly metadata: ObjectMeta;
  readonly spec: {
    readonly podSelector: { readonly matchLabels: Labels };
    readonly policyTypes: readonly ("Ingress" | "Egress")[];
    readonly ingress?: readonly {
      readonly from: readonly PolicyPeer[];
      readonly ports: readonly PolicyPort[];
    }[];
    readonly egress?: readonly {
      readonly to: readonly PolicyPeer[];
      readonly ports: readonly PolicyPort[];
    }[];
  };
}

export interface Service {
  readonly apiVersion: "v1";
  readonly kind: "Service";
  readonly metadata: ObjectMeta;
  readonly spec: {
    readonly selector: Labels;
    readonly ports: readonly {
      readonly name: string;
      readonly port: number;
      readonly targetPort: string;
    }[];
  };
}

export interface PersistentVolumeClaim {
  readonly apiVersion: "v1";
  readonly kind: "PersistentVolumeClaim";
  readonly metadata: ObjectMeta;
  readonly spec: {
    readonly accessModes: readonly ["ReadWriteOnce"];
    readonly resources: { readonly requests: { readonly storage: string } };
  };
}
