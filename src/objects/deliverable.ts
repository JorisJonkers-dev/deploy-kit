// A Deliverable (spec/v1/30-deliverables.md#attribution): one file of the
// render, the objects it holds, and the one adapter it is attributed to.
import type {
  Canary,
  IngressRoute,
  PodMonitor,
  ServiceMonitor,
  VaultAuth,
  VaultConnection,
  VaultPolicy,
  VaultRole,
  VaultStaticSecret,
} from "./custom.ts";
import type {
  ClusterRole,
  ClusterRoleBinding,
  ConfigMap,
  CronJob,
  Deployment,
  Job,
  Kustomization,
  Namespace,
  NetworkPolicy,
  PersistentVolumeClaim,
  Service,
  ServiceAccount,
} from "./kubernetes.ts";

export type RenderedObject =
  | Namespace
  | Kustomization
  | ServiceAccount
  | Deployment
  | NetworkPolicy
  | Service
  | PersistentVolumeClaim
  | Canary
  | PodMonitor
  | ServiceMonitor
  | IngressRoute
  | ConfigMap
  | ClusterRole
  | ClusterRoleBinding
  | CronJob
  | Job
  | VaultConnection
  | VaultAuth
  | VaultStaticSecret
  | VaultPolicy
  | VaultRole;

export interface Deliverable {
  /** Relative to the gitops root, assigned by the path plan. */
  readonly path: string;
  readonly adapter: string;
  readonly objects: readonly RenderedObject[];
}
