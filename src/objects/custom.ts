// The custom resources this estate renders, typed the same way: Flagger's
// Canary, the Prometheus Operator's PodMonitor, Traefik's IngressRoute. Only
// the fields the render sets.
import type { Labels, ObjectMeta } from "./kubernetes.ts";

export interface Webhook {
  readonly name: string;
  readonly type: "confirm-rollout" | "rollout" | "confirm-promotion";
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

export interface PodMonitor {
  readonly apiVersion: "monitoring.coreos.com/v1";
  readonly kind: "PodMonitor";
  readonly metadata: ObjectMeta;
  readonly spec: {
    readonly jobLabel: string;
    readonly selector: { readonly matchLabels: Labels };
    readonly namespaceSelector: { readonly matchNames: readonly string[] };
    readonly podMetricsEndpoints: readonly {
      readonly port: string;
      readonly path: string;
      readonly interval: string;
      readonly scrapeTimeout: string;
    }[];
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
