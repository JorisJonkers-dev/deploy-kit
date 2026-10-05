// A Deliverable (spec/v1/30-deliverables.md#attribution): one file of the
// render, the objects it holds, and the one adapter it is attributed to.
import type {
  Canary,
  FluxKustomization,
  IngressRoute,
  OciRepository,
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
  HorizontalPodAutoscaler,
  Job,
  Kustomization,
  Namespace,
  NetworkPolicy,
  PersistentVolumeClaim,
  PodDisruptionBudget,
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
  | HorizontalPodAutoscaler
  | PodDisruptionBudget
  | OciRepository
  | FluxKustomization
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
