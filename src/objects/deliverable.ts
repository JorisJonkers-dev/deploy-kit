// A Deliverable (spec/v1/30-deliverables.md#attribution): one file of the
// render, the objects it holds, and the one adapter it is attributed to.
import type {
  Canary,
  Client,
  FluxAlert,
  FluxKustomization,
  FluxProvider,
  IngressRoute,
  Middleware,
  OciRepository,
  PodMonitor,
  ServiceMonitor,
  VaultAuth,
  VaultConnection,
  GeneratedKeys,
  VaultPolicy,
  VaultRole,
  VaultDynamicSecret,
  VaultStaticSecret,
} from "./custom.ts";
import type {
  AliasService,
  LoadBalancerService,
  ClusterRole,
  ClusterRoleBinding,
  PriorityClass,
  ConfigMap,
  CronJob,
  Deployment,
  HorizontalPodAutoscaler,
  Job,
  Kustomization,
  Namespace,
  NetworkPolicy,
  PersistentVolume,
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
  | AliasService
  | LoadBalancerService
  | PersistentVolumeClaim
  | PersistentVolume
  | Canary
  | Client
  | PodMonitor
  | ServiceMonitor
  | IngressRoute
  | Middleware
  | ConfigMap
  | ClusterRole
  | ClusterRoleBinding
  | PriorityClass
  | CronJob
  | Job
  | HorizontalPodAutoscaler
  | PodDisruptionBudget
  | OciRepository
  | FluxKustomization
  | FluxProvider
  | FluxAlert
  | VaultConnection
  | VaultAuth
  | VaultStaticSecret
  | VaultDynamicSecret
  | VaultPolicy
  | VaultRole
  | GeneratedKeys;

export interface Deliverable {
  /** Relative to the gitops root, assigned by the path plan. */
  readonly path: string;
  readonly adapter: string;
  readonly objects: readonly RenderedObject[];
}
