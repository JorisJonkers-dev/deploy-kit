// The Stable Addresses (spec/v1/16-dependencies.md#the-stable-address): each an
// `ExternalName` Service in the one estate namespace, whose name every
// consumer's alias points at and whose target is the surface's active Instance.
// Flux creates each once and never updates it: a Move flips its target, and
// a reconcile must not flip it back.
import {
  STABLE_NAMESPACE,
  type ResolvedStableAddress,
} from "../../model/stable-address.ts";
import type { Deliverable } from "../../objects/deliverable.ts";
import type { AliasService, Namespace } from "../../objects/kubernetes.ts";
import { CREATED_ONCE, managedOnly } from "../shared/labels.ts";
import { STABLE_ADDRESSES_DIRECTORY } from "../shared/paths.ts";
// Attributed to this adapter, which speaks the Kubernetes core vocabulary.
import { ADAPTER, NEVER_PRUNED } from "./render.ts";

export function renderStableAddresses(
  addresses: readonly ResolvedStableAddress[],
): Deliverable[] {
  if (addresses.length === 0) return [];
  const namespace: Namespace = {
    apiVersion: "v1",
    kind: "Namespace",
    metadata: {
      name: STABLE_NAMESPACE,
      labels: managedOnly(),
      annotations: NEVER_PRUNED,
    },
  };
  const services = addresses.map(({ name, target }): AliasService => ({
    apiVersion: "v1",
    kind: "Service",
    metadata: {
      name,
      namespace: STABLE_NAMESPACE,
      labels: managedOnly(),
      annotations: CREATED_ONCE,
    },
    spec: { type: "ExternalName", externalName: target },
  }));
  return [
    {
      path: `${STABLE_ADDRESSES_DIRECTORY}/namespace.yaml`,
      adapter: ADAPTER,
      objects: [namespace],
    },
    {
      path: `${STABLE_ADDRESSES_DIRECTORY}/services.yaml`,
      adapter: ADAPTER,
      objects: services,
    },
  ];
}
