// The route Flux's events about one Project's unit take to the Reporter
// (spec/v1/30-deliverables.md#the-rollout-events): a generic `Provider` that
// names where they are posted, and an `Alert` that sends it every event about
// that Project's unit. Both are Flux's own kinds and live in Flux's namespace,
// beside the unit they report on, and both are the Project's own: they land in
// its share, so no Project's reporting waits on another's
// (docs/adr/model/0116-a-project-owns-every-object-it-delivers.md).
//
// The Provider is generic and unsigned: the Reporter's policy admits Flux's
// notification controller alone, and the Reporter takes an event as a prompt
// to read the unit itself, never as evidence of what happened to it.
import type { ResolvedEvents } from "../../model/resolved-deployment.ts";
import type { FluxAlert, FluxProvider } from "../../objects/custom.ts";
import type { Deliverable } from "../../objects/deliverable.ts";
import { managedOnly } from "../shared/labels.ts";
import { unitOf } from "../../model/reconcile-units.ts";
import { projectDirectory } from "../shared/paths.ts";
// Attributed to this adapter, which owns what no other subsystem does.
import { ADAPTER } from "./render.ts";

/** The name a Project's Provider carries, and its Alert sends through. */
export const eventsProviderOf = (project: string): string =>
  `reporter-${project}`;

/** The name of a Project's Alert: what it reports on. */
export const eventsAlertOf = (project: string): string => `rollouts-${project}`;

/** Where a Project's route for Flux's events lands, in its own share. */
export const eventsDirectoryOf = (project: string): string =>
  `${projectDirectory(project)}/rollout-events`;

export function renderEvents(
  events: ResolvedEvents,
  project: string,
): Deliverable[] {
  const provider: FluxProvider = {
    apiVersion: "notification.toolkit.fluxcd.io/v1beta3",
    kind: "Provider",
    metadata: {
      name: eventsProviderOf(project),
      namespace: events.namespace,
      labels: managedOnly(),
    },
    spec: { type: "generic", address: events.address },
  };
  const alert: FluxAlert = {
    apiVersion: "notification.toolkit.fluxcd.io/v1beta3",
    kind: "Alert",
    metadata: {
      name: eventsAlertOf(project),
      namespace: events.namespace,
      labels: managedOnly(),
    },
    spec: {
      providerRef: { name: eventsProviderOf(project) },
      // Every stage is reported, not only a failure.
      eventSeverity: "info",
      // This Project's unit alone, which a pin source names and labels.
      eventSources: [
        {
          kind: "Kustomization",
          name: unitOf(project),
          matchLabels: managedOnly(),
        },
      ],
    },
  };
  return [
    {
      path: `${eventsDirectoryOf(project)}/provider.yaml`,
      adapter: ADAPTER,
      objects: [provider],
    },
    {
      path: `${eventsDirectoryOf(project)}/alert.yaml`,
      adapter: ADAPTER,
      objects: [alert],
    },
  ];
}
