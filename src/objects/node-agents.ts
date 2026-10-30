// The objects a Node Agent renders to (spec/v1/14-platform-intent.md#node-agents).
// An agent holds the host privileges its catalog entry fixes, so its pod is no
// restricted Process's: these shapes are its own, and only the catalog fills
// them.
import type { Labels, NodeAffinity, ObjectMeta } from "./kubernetes.ts";

/** An environment variable an agent reads, set or taken from its pod. */
export type AgentEnvVar =
  | { readonly name: string; readonly value: string }
  | {
      readonly name: string;
      readonly valueFrom: { readonly fieldRef: { readonly fieldPath: string } };
    };

export interface AgentContainer {
  readonly name: string;
  readonly image: string;
  readonly args?: readonly string[];
  readonly env?: readonly AgentEnvVar[];
  readonly ports?: readonly {
    readonly name: string;
    readonly containerPort: number;
  }[];
  readonly resources: {
    readonly requests: { readonly memory: string; readonly cpu: string };
    readonly limits: {
      readonly memory: string;
      readonly [device: string]: string;
    };
  };
  readonly securityContext: {
    readonly privileged?: true;
    readonly runAsNonRoot?: boolean;
    readonly runAsUser?: number;
    readonly runAsGroup?: number;
    readonly allowPrivilegeEscalation?: boolean;
    readonly readOnlyRootFilesystem?: true;
    readonly capabilities?: {
      readonly add?: readonly string[];
      readonly drop?: readonly ["ALL"];
    };
  };
  readonly volumeMounts?: readonly {
    readonly name: string;
    readonly mountPath: string;
    readonly readOnly?: true;
    readonly mountPropagation?: "HostToContainer";
  }[];
}

export type AgentVolume =
  | {
      readonly name: string;
      readonly hostPath: { readonly path: string; readonly type?: string };
    }
  | { readonly name: string; readonly configMap: { readonly name: string } }
  | { readonly name: string; readonly secret: { readonly secretName: string } };

export interface AgentPodSpec {
  readonly serviceAccountName: string;
  readonly automountServiceAccountToken: boolean;
  readonly priorityClassName:
    "system-node-critical" | "system-cluster-critical";
  readonly securityContext: {
    readonly seccompProfile: { readonly type: "RuntimeDefault" };
  };
  readonly hostNetwork?: true;
  readonly hostPID?: true;
  readonly runtimeClassName?: string;
  readonly affinity: NodeAffinity;
  readonly containers: readonly AgentContainer[];
  readonly volumes?: readonly AgentVolume[];
}

interface AgentTemplate {
  readonly selector: { readonly matchLabels: Labels };
  readonly template: {
    readonly metadata: { readonly labels: Labels };
    readonly spec: AgentPodSpec;
  };
}

/** An agent that runs one copy on each node its facts name. */
export interface AgentDaemonSet {
  readonly apiVersion: "apps/v1";
  readonly kind: "DaemonSet";
  readonly metadata: ObjectMeta;
  readonly spec: AgentTemplate & {
    readonly updateStrategy: {
      readonly type: "RollingUpdate";
      readonly rollingUpdate: { readonly maxUnavailable: number };
    };
  };
}

/** The speaker's controller, which runs once. */
export interface AgentDeployment {
  readonly apiVersion: "apps/v1";
  readonly kind: "Deployment";
  readonly metadata: ObjectMeta;
  readonly spec: AgentTemplate & {
    readonly replicas: 1;
    readonly strategy: { readonly type: "Recreate" };
  };
}

/** A pool-kind L4 Address, as the load balancer hands out its range. */
export interface AddressPool {
  readonly apiVersion: "metallb.io/v1beta1";
  readonly kind: "IPAddressPool";
  readonly metadata: ObjectMeta;
  readonly spec: {
    readonly addresses: readonly string[];
    readonly autoAssign: false;
  };
}

/** Which nodes announce a pool's addresses on their segment. */
export interface L2Advertisement {
  readonly apiVersion: "metallb.io/v1beta1";
  readonly kind: "L2Advertisement";
  readonly metadata: ObjectMeta;
  readonly spec: {
    readonly ipAddressPools: readonly string[];
    readonly nodeSelectors: readonly {
      readonly matchExpressions: readonly {
        readonly key: "kubernetes.io/hostname";
        readonly operator: "In";
        readonly values: readonly string[];
      }[];
    }[];
  };
}
