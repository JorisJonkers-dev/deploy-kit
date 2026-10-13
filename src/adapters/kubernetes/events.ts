// The route Flux's events take to the Reporter
// (spec/v1/30-deliverables.md#the-rollout-events): a generic `Provider` that
// names where they are posted, and an `Alert` that sends it every event about
// a unit the render put on the estate path. Both are Flux's own kinds and
// live in Flux's namespace, so they belong to no Project and land in the
// estate-scoped tree.
import type { ResolvedEvents } from "../../model/resolved-deployment.ts";
import type { FluxAlert, FluxProvider } from "../../objects/custom.ts";
import type { Deliverable } from "../../objects/deliverable.ts";
import { managedOnly } from "../shared/labels.ts";
import { EVENTS_DIRECTORY } from "../shared/paths.ts";
// Attributed to this adapter, which owns what no other subsystem does.
import { ADAPTER } from "./render.ts";

/** The name the Provider carries, and the Alert sends through. */
export const EVENTS_PROVIDER = "reporter";

/** The name of the Alert: what it reports on. */
export const EVENTS_ALERT = "rollouts";

export function renderEvents(events: ResolvedEvents): Deliverable[] {
  const provider: FluxProvider = {
    apiVersion: "notification.toolkit.fluxcd.io/v1beta3",
    kind: "Provider",
    metadata: {
      name: EVENTS_PROVIDER,
      namespace: events.namespace,
      labels: managedOnly(),
    },
    spec: { type: "generic", address: events.address },
  };
  const alert: FluxAlert = {
    apiVersion: "notification.toolkit.fluxcd.io/v1beta3",
    kind: "Alert",
    metadata: {
      name: EVENTS_ALERT,
      namespace: events.namespace,
      labels: managedOnly(),
    },
    spec: {
      providerRef: { name: EVENTS_PROVIDER },
      // Every stage is reported, not only a failure.
      eventSeverity: "info",
      // Every unit a pin source applies carries the label, and nothing else in
      // Flux's namespace does.
      eventSources: [
        { kind: "Kustomization", name: "*", matchLabels: managedOnly() },
      ],
    },
  };
  return [
    {
      path: `${EVENTS_DIRECTORY}/provider.yaml`,
      adapter: ADAPTER,
      objects: [provider],
    },
    {
      path: `${EVENTS_DIRECTORY}/alert.yaml`,
      adapter: ADAPTER,
      objects: [alert],
    },
  ];
}
