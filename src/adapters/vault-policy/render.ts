// The `vault-policy` adapter (spec/v1/30-deliverables.md#vault-configuration-is-rendered-not-applied):
// per identity that holds a grant, one Vault policy and one Kubernetes auth
// role bound to it, as JSON. Rendered, not applied: no kustomization lists
// them, and the in-cluster Vault policy job writes them into Vault
// (docs/adr/model/0087-in-cluster-consumers-read-the-render.md).
import type { ResolvedProject } from "../../model/resolution.ts";
import type { VaultPolicy, VaultRole } from "../../objects/custom.ts";
import type { Deliverable } from "../../objects/deliverable.ts";
import { vaultNameOf } from "../../model/runtime-profiles.ts";
import { holdersOf, type Grant } from "../shared/holders.ts";
import { notSupported } from "../../model/internal-failure.ts";

export const ADAPTER = "vault-policy";

/**
 * The estate-wide directory every identity's documents land in, each under the
 * name Vault holds it by. Two identities that derive one name claim one path,
 * and a path has one owner (`E_PATH_COLLISION`): no render overwrites one
 * project's role with another's.
 */
const POLICIES = "apps/vso-secrets/policies";
const KV_DATA = /^secret\/data\//;
const KV_METADATA = "secret/metadata/";

/**
 * What one grant may do: `read` on its path and on the same document's
 * metadata. The other tiers land with the grants that hold them.
 */
function pathsOf(grant: Grant): [string, { capabilities: string[] }][] {
  // A transit or database grant carries the paths its engine derives.
  if ("paths" in grant)
    return grant.paths.map(({ path, allows }) => [
      path,
      { capabilities: [...allows] },
    ]);
  if (grant.access !== "read")
    throw notSupported(
      `${grant.path}: a ${grant.access} grant is not rendered yet`,
    );
  if (!KV_DATA.test(grant.path))
    throw notSupported(
      `${grant.path}: a grant outside the kv mount is not rendered yet`,
    );
  return [
    [grant.path, { capabilities: ["read"] }],
    [grant.path.replace(KV_DATA, KV_METADATA), { capabilities: ["read"] }],
  ];
}

export function renderVaultPolicy(project: ResolvedProject): Deliverable[] {
  return project.applications.flatMap((application) =>
    holdersOf(application).flatMap(({ identity, grants }): Deliverable[] => {
      const name = vaultNameOf(application.namespace, identity);
      const stem = `${POLICIES}/${name}`;
      const policy: VaultPolicy = {
        path: Object.fromEntries(grants.flatMap(pathsOf)),
      };
      const role: VaultRole = {
        bound_service_account_names: [identity],
        bound_service_account_namespaces: [application.namespace],
        token_policies: [name],
      };
      return [
        { path: `${stem}.policy.json`, adapter: ADAPTER, objects: [policy] },
        { path: `${stem}.role.json`, adapter: ADAPTER, objects: [role] },
      ];
    }),
  );
}
