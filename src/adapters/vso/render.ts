// The `vso` adapter (spec/v1/30-deliverables.md#vault-configuration-is-rendered-not-applied):
// per project namespace the operator's connection to the Secret Store, and per
// Application, for each identity that holds a synced grant, how the operator
// authenticates as it and one VaultStaticSecret per grant. Every destination
// is excluded from Flagger's configuration tracking, and a restart names what
// is serving (spec/v1/55-delivery.md#secret-rotation).
import type { ResolvedProject } from "../../model/resolution.ts";
import type {
  ResolvedApplicationDocument,
  ResolvedProcess,
} from "../../model/resolved-deployment.ts";
import type {
  VaultAuth,
  VaultDynamicSecret,
  VaultStaticSecret,
} from "../../objects/custom.ts";
import { namespaceOf, vaultNameOf } from "../../model/runtime-profiles.ts";
import {
  NODE_PROJECT,
  type ResolvedNodeAgent,
} from "../../model/node-agents.ts";
import type { Deliverable } from "../../objects/deliverable.ts";
import {
  holdersOf,
  isSynced,
  type EngineGrant,
  type KvGrant,
  type Holder,
} from "../shared/holders.ts";
import { managedOnly } from "../shared/labels.ts";
import { applicationDirectory, projectDirectory } from "../shared/paths.ts";
import { operatedSetOf } from "../../model/operated.ts";
import { notSupported } from "../../model/internal-failure.ts";

export const ADAPTER = "vso";

export const API = "secrets.hashicorp.com/v1beta1";
/** The connection every VaultAuth of a namespace names. */
export const CONNECTION = "secret-store";
/** The KV-v2 mount every kv grant is read through, and its data segment. */
const KV_MOUNT = "secret";
const KV_DATA = `${KV_MOUNT}/data/`;
/**
 * How often the operator re-reads a path, so an edited value arrives: one
 * derived interval for every static secret, never authored.
 */
const REFRESH = "10m";
/** Flagger never counts a Vault-delivered Secret as a new revision. */
export const UNTRACKED = { "flagger.app/config-tracking": "disabled" };

/**
 * A gated Application's sync objects outlive the release that drops them: Flux
 * keeps them, and the Release Gate removes those of an older revision once the
 * Application serves the new one (spec/v1/55-delivery.md#a-removed-grant-outlives-its-release).
 */
const keptOf = (
  application: ResolvedApplicationDocument,
): { annotations?: Record<string, string> } =>
  application.releaseGate === undefined
    ? {}
    : {
        annotations: {
          "estate.jorisjonkers.dev/revision": application.revision,
          "kustomize.toolkit.fluxcd.io/prune": "disabled",
        },
      };

/**
 * The workload a rotation restarts: a blue-green Process serves from its
 * primary, and one the Prometheus operator runs from the StatefulSet it gives it.
 */
function servingOf(
  name: string,
  application: ResolvedApplicationDocument,
): { readonly kind: "Deployment" | "StatefulSet"; readonly name: string } {
  // A restart target is a Process of the Application the grant belongs to.
  const process = application.processes.find(
    (candidate) => candidate.name === name,
  ) as ResolvedProcess;
  if (process.operated !== undefined)
    return {
      kind: "StatefulSet",
      name: operatedSetOf(process.operated.kind, name),
    };
  return {
    kind: "Deployment",
    name: process.switchover === "blue-green" ? `${name}-primary` : name,
  };
}

function staticSecretOf(
  grant: KvGrant,
  holder: Holder,
  application: ResolvedApplicationDocument,
): VaultStaticSecret {
  if (!grant.path.startsWith(KV_DATA))
    throw notSupported(
      `${grant.path}: a grant outside the ${KV_MOUNT} mount is not rendered yet`,
    );
  const destination = grant.destination as string;
  return {
    apiVersion: API,
    kind: "VaultStaticSecret",
    metadata: {
      name: destination,
      namespace: application.namespace,
      labels: holder.labels,
      ...keptOf(application),
    },
    spec: {
      vaultAuthRef: holder.identity,
      mount: KV_MOUNT,
      type: "kv-v2",
      path: grant.path.slice(KV_DATA.length),
      refreshAfter: REFRESH,
      // The restart the operator triggers compares the data's HMAC.
      hmacSecretData: true,
      destination: { name: destination, create: true, annotations: UNTRACKED },
      ...restartsOf(grant.restartTargets, application),
    },
  };
}

/** Where a database credential is issued: the engine's mount, and the path below it. */
export const DATABASE_MOUNT = "database";

/** What a rotation restarts, where it restarts anything. */
const restartsOf = (
  targets: readonly string[] | undefined,
  application: ResolvedApplicationDocument,
) =>
  targets === undefined
    ? {}
    : {
        rolloutRestartTargets: targets.map((target) =>
          servingOf(target, application),
        ),
      };

/** A database credential an edge delivers to the environment, issued and renewed by the store. */
function dynamicSecretOf(
  grant: EngineGrant & { destination: string },
  holder: Holder,
  application: ResolvedApplicationDocument,
): VaultDynamicSecret {
  // An edge derives one path, the role's credential.
  const { path } = grant.paths[0] as { path: string };
  return {
    apiVersion: API,
    kind: "VaultDynamicSecret",
    metadata: {
      name: grant.destination,
      namespace: application.namespace,
      labels: holder.labels,
      ...keptOf(application),
    },
    spec: {
      vaultAuthRef: holder.identity,
      mount: DATABASE_MOUNT,
      path: path.slice(DATABASE_MOUNT.length + 1),
      destination: {
        name: grant.destination,
        create: true,
        annotations: UNTRACKED,
      },
      ...restartsOf(grant.restartTargets, application),
    },
  };
}

const authOf = (
  holder: Holder,
  application: ResolvedApplicationDocument,
): VaultAuth => ({
  apiVersion: API,
  kind: "VaultAuth",
  metadata: {
    name: holder.identity,
    namespace: application.namespace,
    labels: holder.labels,
    ...keptOf(application),
  },
  spec: {
    vaultConnectionRef: CONNECTION,
    method: "kubernetes",
    mount: "kubernetes",
    kubernetes: {
      role: vaultNameOf(application.namespace, holder.identity),
      serviceAccount: holder.identity,
    },
  },
});

export function renderVso(project: ResolvedProject): Deliverable[] {
  // Every Application of a project shares its namespace, and so its connection.
  const store = project.applications.find(
    ({ secretStore }) => secretStore !== undefined,
  );
  const connection: Deliverable[] =
    store === undefined
      ? []
      : [
          {
            path: `${projectDirectory(project.project)}/vaultconnection.yaml`,
            adapter: ADAPTER,
            objects: [
              {
                apiVersion: API,
                kind: "VaultConnection",
                metadata: {
                  name: CONNECTION,
                  namespace: store.namespace,
                  labels: managedOnly(),
                },
                // TLS is never skipped: the schema asks, and the answer is fixed.
                spec: {
                  address: store.secretStore as string,
                  skipTLSVerify: false,
                },
              },
            ],
          },
        ];
  const applications = project.applications.flatMap(
    (application): Deliverable[] => {
      const objects = holdersOf(application).flatMap((holder) => {
        // A `self` grant is read by the Process itself, and synced nowhere.
        const synced = holder.grants.filter(isSynced);
        return synced.length === 0
          ? []
          : [
              authOf(holder, application),
              ...synced.map((grant) =>
                "paths" in grant
                  ? dynamicSecretOf(grant, holder, application)
                  : staticSecretOf(grant, holder, application),
              ),
            ];
      });
      return objects.length === 0
        ? []
        : [
            {
              path: `${applicationDirectory(project.project, application.id)}/vso.yaml`,
              adapter: ADAPTER,
              objects,
            },
          ];
    },
  );
  return [...connection, ...applications];
}

/**
 * The `node` Project's share: where the speaker runs memberlist, the
 * connection, how the operator signs in as the speaker, and the static secret
 * its key lands in (spec/v1/14-platform-intent.md#node-agents).
 */
export function renderNodeSecrets(
  agents: readonly ResolvedNodeAgent[],
): Deliverable[] {
  const namespace = namespaceOf(NODE_PROJECT);
  return agents.flatMap(({ agent, memberlist }): Deliverable[] => {
    if (memberlist === undefined) return [];
    const labels = {
      ...managedOnly(),
      "app.kubernetes.io/name": agent,
      "app.kubernetes.io/part-of": NODE_PROJECT,
    };
    const auth: VaultAuth = {
      apiVersion: API,
      kind: "VaultAuth",
      metadata: { name: agent, namespace, labels },
      spec: {
        vaultConnectionRef: CONNECTION,
        method: "kubernetes",
        mount: "kubernetes",
        kubernetes: {
          role: vaultNameOf(namespace, agent),
          serviceAccount: agent,
        },
      },
    };
    const synced: VaultStaticSecret = {
      apiVersion: API,
      kind: "VaultStaticSecret",
      metadata: { name: memberlist.secret, namespace, labels },
      spec: {
        vaultAuthRef: agent,
        mount: KV_MOUNT,
        type: "kv-v2",
        path: memberlist.path.slice(KV_DATA.length),
        refreshAfter: REFRESH,
        hmacSecretData: true,
        destination: {
          name: memberlist.secret,
          create: true,
          annotations: UNTRACKED,
        },
        // A speaker reads its key at start, so a changed key restarts them all.
        rolloutRestartTargets: [{ kind: "DaemonSet", name: agent }],
      },
    };
    return [
      {
        path: `${projectDirectory(NODE_PROJECT)}/vaultconnection.yaml`,
        adapter: ADAPTER,
        objects: [
          {
            apiVersion: API,
            kind: "VaultConnection",
            metadata: {
              name: CONNECTION,
              namespace,
              labels: managedOnly(),
            },
            spec: { address: memberlist.store, skipTLSVerify: false },
          },
        ],
      },
      {
        path: `${projectDirectory(NODE_PROJECT)}/${agent}/vso.yaml`,
        adapter: ADAPTER,
        objects: [auth, synced],
      },
    ];
  });
}
