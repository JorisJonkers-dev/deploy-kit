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
  TlsStore,
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
  GrafanaDashboard,
  GrafanaInstance,
  Alertmanager,
  AlertmanagerConfig,
  Prometheus,
  PrometheusRule,
} from "./custom.ts";
import type {
  AliasService,
  LoadBalancerService,
  ClusterRole,
  ClusterRoleBinding,
  Role,
  RoleBinding,
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
import type {
  AgentDaemonSet,
  AgentDeployment,
  AddressPool,
  L2Advertisement,
} from "./node-agents.ts";

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
  | TlsStore
  | ConfigMap
  | ClusterRole
  | ClusterRoleBinding
  | Role
  | RoleBinding
  | PriorityClass
  | GrafanaDashboard
  | GrafanaInstance
  | PrometheusRule
  | AlertmanagerConfig
  | Prometheus
  | Alertmanager
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
  | GeneratedKeys
  | AgentDaemonSet
  | AgentDeployment
  | AddressPool
  | L2Advertisement;

export interface Deliverable {
  /** Relative to the gitops root, spelled through the shared directory helpers. */
  readonly path: string;
  readonly adapter: string;
  readonly objects: readonly RenderedObject[];
}
