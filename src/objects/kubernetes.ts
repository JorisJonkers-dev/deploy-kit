// The typed object model (docs/architecture.md#serialization): only the
// fields this estate sets, so a field the model cannot express cannot be set by
// an adapter. A shape, not a participant: it imports nothing from the compiler.

export type Labels = Readonly<Record<string, string>>;

export interface ObjectMeta {
  readonly name: string;
  readonly namespace?: string;
  readonly labels: Labels;
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

export interface Container {
  readonly name: string;
  readonly image: string;
  readonly ports: readonly {
    readonly name: string;
    readonly containerPort: number;
  }[];
  readonly env?: readonly { readonly name: string; readonly value: string }[];
  readonly resources: {
    readonly requests: { readonly memory: string; readonly cpu: string };
    readonly limits: { readonly memory: string };
  };
  readonly securityContext: {
    readonly readOnlyRootFilesystem: true;
    readonly capabilities: { readonly drop: readonly ["ALL"] };
  };
  readonly readinessProbe?: Probe;
  readonly livenessProbe?: Probe;
  readonly startupProbe?: Probe;
}

export interface Deployment {
  readonly apiVersion: "apps/v1";
  readonly kind: "Deployment";
  readonly metadata: ObjectMeta;
  readonly spec: {
    readonly strategy: {
      readonly type: "RollingUpdate";
      readonly rollingUpdate: {
        readonly maxSurge: number;
        readonly maxUnavailable: number;
      };
    };
    readonly progressDeadlineSeconds: number;
    readonly selector: { readonly matchLabels: Labels };
    readonly template: {
      readonly metadata: { readonly labels: Labels };
      readonly spec: {
        readonly serviceAccountName: string;
        readonly automountServiceAccountToken: boolean;
        readonly securityContext: {
          readonly runAsNonRoot: true;
          readonly runAsUser: number;
          readonly runAsGroup: number;
          readonly seccompProfile: { readonly type: "RuntimeDefault" };
        };
        readonly containers: readonly Container[];
      };
    };
  };
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
