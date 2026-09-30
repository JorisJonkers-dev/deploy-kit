// A Deliverable (spec/v1/30-deliverables.md#attribution): one file of the
// render, the objects it holds, and the one adapter it is attributed to.
import type {
  Canary,
  IngressRoute,
  PodMonitor,
  ServiceMonitor,
} from "./custom.ts";
import type {
  Deployment,
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
  | IngressRoute;

export interface Deliverable {
  /** Relative to the gitops root, assigned by the path plan. */
  readonly path: string;
  readonly adapter: string;
  readonly objects: readonly RenderedObject[];
}
