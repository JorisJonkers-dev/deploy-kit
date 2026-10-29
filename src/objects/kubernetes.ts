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

/** What a holder may ask of the Kubernetes API, cluster-wide. */
export interface ClusterRole {
  readonly apiVersion: "rbac.authorization.k8s.io/v1";
  readonly kind: "ClusterRole";
  readonly metadata: ObjectMeta;
  readonly rules: readonly {
    readonly apiGroups: readonly string[];
    readonly resources: readonly string[];
    /** The objects a rule is narrowed to, by name, where it is narrowed. */
    readonly resourceNames?: readonly string[];
    readonly verbs: readonly string[];
  }[];
}

/** A Process's namespace-scoped rules, in its own namespace. */
export interface Role {
  readonly apiVersion: "rbac.authorization.k8s.io/v1";
  readonly kind: "Role";
  readonly metadata: ObjectMeta;
  readonly rules: ClusterRole["rules"];
}

/** A Role bound, in its namespace, to the Process's one ServiceAccount. */
export interface RoleBinding {
  readonly apiVersion: "rbac.authorization.k8s.io/v1";
  readonly kind: "RoleBinding";
  readonly metadata: ObjectMeta;
  readonly roleRef: {
    readonly apiGroup: "rbac.authorization.k8s.io";
    readonly kind: "Role";
    readonly name: string;
  };
  readonly subjects: readonly BindingSubject[];
}

/** Who a ClusterRole is bound to: a holder's one ServiceAccount, or a Human Grant's group. */
export type BindingSubject =
  | {
      readonly kind: "ServiceAccount";
      readonly name: string;
      readonly namespace: string;
    }
  | {
      readonly apiGroup: "rbac.authorization.k8s.io";
      readonly kind: "Group";
      readonly name: string;
    };

/** A class a pod's priority names, cluster-wide. */
export interface PriorityClass {
  readonly apiVersion: "scheduling.k8s.io/v1";
  readonly kind: "PriorityClass";
  readonly metadata: {
    readonly name: string;
    readonly labels: Readonly<Record<string, string>>;
  };
  readonly value: number;
  readonly globalDefault: false;
  readonly preemptionPolicy: "PreemptLowerPriority";
  readonly description: string;
}

/** A ClusterRole bound, cluster-wide, to its subjects. */
export interface ClusterRoleBinding {
  readonly apiVersion: "rbac.authorization.k8s.io/v1";
  readonly kind: "ClusterRoleBinding";
  readonly metadata: ObjectMeta;
  readonly roleRef: {
    readonly apiGroup: "rbac.authorization.k8s.io";
    readonly kind: "ClusterRole";
    readonly name: string;
  };
  readonly subjects: readonly BindingSubject[];
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
      readonly emptyDir: {
        readonly medium?: "Memory";
        readonly sizeLimit: string;
      };
    }
  | {
      readonly name: string;
      readonly secret: {
        readonly secretName: string;
        readonly items: readonly {
          readonly key: string;
          readonly path: string;
        }[];
        readonly defaultMode: number;
      };
    };

export interface PodSpec {
  readonly serviceAccountName: string;
  readonly automountServiceAccountToken: boolean;
  /** `None` for a Process that resolves through its own nameservers. */
  readonly dnsPolicy?: "None";
  readonly dnsConfig?: { readonly nameservers: readonly string[] };
  /** The runtime class that exposes a GPU to the container that requests one. */
  readonly runtimeClassName?: string;
  readonly restartPolicy?: "OnFailure" | "Never";
  /** How long one attempt may run, where a Job retries rather than fails. */
  readonly activeDeadlineSeconds?: number;
  readonly securityContext: {
    readonly runAsNonRoot: true;
    readonly runAsUser: number;
    readonly runAsGroup: number;
    readonly fsGroup?: number;
    readonly supplementalGroups?: readonly number[];
    readonly seccompProfile: { readonly type: "RuntimeDefault" };
  };
  readonly priorityClassName?: string;
  readonly affinity?: NodeAffinity & Partial<PodAntiAffinity>;
  /** The VPN beside an attached Process, started before it and kept running. */
  /** The VPN, which runs beside the pod, and each step that runs to completion before it. */
  readonly initContainers?: readonly (VpnContainer | Container)[];
  readonly containers: readonly Container[];
  readonly volumes?: readonly Volume[];
}

/** The nodes a pod may be scheduled on, by name: required, never preferred. */
/** Pods of one revision of a Process kept on different nodes. */
export interface PodAntiAffinity {
  readonly podAntiAffinity: {
    readonly requiredDuringSchedulingIgnoredDuringExecution: readonly {
      readonly labelSelector: { readonly matchLabels: Labels };
      readonly matchLabelKeys: readonly ["pod-template-hash"];
      readonly topologyKey: "kubernetes.io/hostname";
    }[];
  };
}

export interface NodeAffinity {
  readonly nodeAffinity: {
    readonly requiredDuringSchedulingIgnoredDuringExecution: {
      readonly nodeSelectorTerms: readonly {
        readonly matchExpressions: readonly {
          readonly key: "kubernetes.io/hostname";
          readonly operator: "In";
          readonly values: readonly string[];
        }[];
      }[];
    };
  };
}

/** A port the container listens on, and the node's port that reaches it where it has one. */
export interface ContainerPort {
  readonly name: string;
  readonly containerPort: number;
  readonly hostPort?: number;
  readonly protocol?: "TCP" | "UDP";
}

export interface Container {
  readonly name: string;
  readonly image: string;
  readonly command?: readonly string[];
  readonly args?: readonly string[];
  readonly ports?: readonly ContainerPort[];
  readonly env?: readonly EnvVar[];
  readonly envFrom?: readonly {
    readonly secretRef: { readonly name: string };
  }[];
  // A backup's method image carries no quantity the model holds, so it asks
  // for none.
  readonly resources?: {
    readonly requests: { readonly memory: string; readonly cpu: string };
    // A device resource, a GPU's, is a limit the scheduler also requests.
    readonly limits: {
      readonly memory: string;
      readonly [device: string]: string;
    };
  };
  readonly securityContext: {
    readonly allowPrivilegeEscalation: false;
    readonly readOnlyRootFilesystem: true;
    readonly capabilities: { readonly drop: readonly ["ALL"] };
  };
  readonly volumeMounts?: readonly VolumeMount[];
  readonly readinessProbe?: Probe;
  readonly livenessProbe?: Probe;
  readonly startupProbe?: Probe;
}

/**
 * The platform's VPN beside an attached Process: a native sidecar, and the one
 * container that holds network privileges, as root, with its own credential.
 */
export interface VpnContainer {
  readonly name: "vpn";
  readonly image: string;
  readonly restartPolicy: "Always";
  readonly env: readonly { readonly name: string; readonly value: string }[];
  readonly envFrom: readonly {
    readonly secretRef: { readonly name: string };
  }[];
  readonly resources: NonNullable<Container["resources"]>;
  readonly securityContext: {
    readonly runAsNonRoot: false;
    readonly runAsUser: 0;
    readonly runAsGroup: 0;
    readonly capabilities: { readonly add: readonly ["NET_ADMIN", "NET_RAW"] };
  };
  readonly startupProbe: {
    readonly exec: { readonly command: readonly string[] };
    readonly periodSeconds: number;
    readonly timeoutSeconds: number;
    readonly failureThreshold: number;
  };
  readonly volumeMounts: readonly VolumeMount[];
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
    readonly suspend?: true;
    readonly concurrencyPolicy: "Forbid";
    /** How late a run may start before it is skipped. */
    readonly startingDeadlineSeconds?: number;
    readonly jobTemplate: {
      readonly metadata?: { readonly labels: Labels };
      readonly spec: {
        readonly backoffLimit?: number;
        readonly template: {
          readonly metadata: { readonly labels: Labels };
          readonly spec: PodSpec;
        };
      };
    };
  };
}

/** A run to completion, once: what a changed input replaces rather than edits. */
export interface Job {
  readonly apiVersion: "batch/v1";
  readonly kind: "Job";
  readonly metadata: ObjectMeta;
  readonly spec: {
    /** Set on a Job the Release Gate starts, which alone writes it afterwards. */
    readonly suspend?: true;
    /**
     * Zero on a Job that is never retried, whose failure is an answer; the
     * most the API holds on one that retries until it succeeds.
     */
    readonly backoffLimit?: number;
    /** The whole run's deadline, on a Job whose pod carries none. */
    readonly activeDeadlineSeconds?: number;
    readonly template: {
      readonly metadata: { readonly labels: Labels };
      readonly spec: PodSpec;
    };
  };
}

export interface HorizontalPodAutoscaler {
  readonly apiVersion: "autoscaling/v2";
  readonly kind: "HorizontalPodAutoscaler";
  readonly metadata: ObjectMeta;
  readonly spec: {
    readonly scaleTargetRef: {
      readonly apiVersion: "apps/v1";
      readonly kind: "Deployment";
      readonly name: string;
    };
    readonly minReplicas: number;
    readonly maxReplicas: number;
  };
}

export interface PodDisruptionBudget {
  readonly apiVersion: "policy/v1";
  readonly kind: "PodDisruptionBudget";
  readonly metadata: ObjectMeta;
  readonly spec: {
    readonly maxUnavailable: 1;
    readonly selector: { readonly matchLabels: Labels };
  };
}

/**
 * A JSON document a ConfigMap carries as one value. The adapter hands over the
 * value and the serializer writes its canonical form, so the bytes of an
 * embedded document are the serializer's like every other byte.
 */
export interface EmbeddedJson {
  readonly json: unknown;
}

export interface ConfigMap {
  readonly apiVersion: "v1";
  readonly kind: "ConfigMap";
  readonly metadata: ObjectMeta;
  /** Set on an Asset, whose name changes with its content; absent on one whose name stays. */
  readonly immutable?: true;
  readonly data: Readonly<Record<string, string | EmbeddedJson>>;
}

export interface PolicyPeer {
  readonly namespaceSelector: { readonly matchLabels: Labels };
  readonly podSelector?: { readonly matchLabels: Labels };
}

/** An address range outside the cluster: where no namespace or pod is the peer. */
export interface PolicyRange {
  readonly ipBlock: {
    readonly cidr: string;
    readonly except?: readonly string[];
  };
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
      readonly from: readonly (PolicyPeer | PolicyRange)[];
      readonly ports: readonly PolicyPort[];
    }[];
    readonly egress?: readonly {
      readonly to: readonly (PolicyPeer | PolicyRange)[];
      // Absent, the rule admits every port.
      readonly ports?: readonly PolicyPort[];
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

/**
 * A Service a client off the cluster reaches on an address a pool announces:
 * `Local` keeps the client's address and the connection on the announcing node.
 */
export interface LoadBalancerService {
  readonly apiVersion: "v1";
  readonly kind: "Service";
  readonly metadata: ObjectMeta;
  readonly spec: {
    readonly type: "LoadBalancer";
    readonly externalTrafficPolicy: "Local";
    readonly selector: Labels;
    readonly ports: readonly {
      readonly name: string;
      readonly port: number;
      readonly protocol: "TCP" | "UDP";
      readonly targetPort: number;
    }[];
  };
}

/** A name in one namespace for a host elsewhere: DNS alone, no selector and no port. */
export interface AliasService {
  readonly apiVersion: "v1";
  readonly kind: "Service";
  readonly metadata: ObjectMeta;
  readonly spec: {
    readonly type: "ExternalName";
    readonly externalName: string;
  };
}

export interface PersistentVolumeClaim {
  readonly apiVersion: "v1";
  readonly kind: "PersistentVolumeClaim";
  readonly metadata: ObjectMeta;
  readonly spec: {
    /** Empty for a claim bound to the one volume `volumeName` names. */
    readonly storageClassName?: "";
    readonly volumeName?: string;
    readonly accessModes: readonly ["ReadWriteOnce"];
    readonly resources: { readonly requests: { readonly storage: string } };
  };
}

/** A local volume onto a directory of one node, bound to the one claim it names. */
export interface PersistentVolume {
  readonly apiVersion: "v1";
  readonly kind: "PersistentVolume";
  readonly metadata: ObjectMeta;
  readonly spec: {
    readonly capacity: { readonly storage: string };
    readonly volumeMode: "Filesystem";
    readonly accessModes: readonly ["ReadWriteOnce"];
    readonly persistentVolumeReclaimPolicy: "Retain";
    readonly storageClassName: "";
    readonly claimRef: { readonly namespace: string; readonly name: string };
    readonly local: { readonly path: string };
    readonly nodeAffinity: {
      readonly required: NodeAffinity["nodeAffinity"]["requiredDuringSchedulingIgnoredDuringExecution"];
    };
  };
}
