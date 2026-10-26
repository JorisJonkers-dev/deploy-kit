// The `vault-policy` adapter (spec/v1/30-deliverables.md#vault-configuration-is-rendered-not-applied):
// per identity that holds a grant, one Vault policy and one Kubernetes auth
// role bound to it, as JSON. Rendered, not applied: no kustomization lists
// them, and the in-cluster Vault policy job writes them into Vault
// (docs/adr/model/0087-in-cluster-consumers-read-the-render.md).
import type { ResolvedProject } from "../../model/resolution.ts";
import type { ResolvedCatalogJob } from "../../model/resolved-deployment.ts";
import type {
  GeneratedKey,
  VaultPolicy,
  VaultRole,
} from "../../objects/custom.ts";
import type { Deliverable } from "../../objects/deliverable.ts";
import { namespaceOf, vaultNameOf } from "../../model/runtime-profiles.ts";
import { holdersOf, type Grant } from "../shared/holders.ts";
import { notSupported } from "../../model/internal-failure.ts";
import { policyJobDirectory } from "../shared/paths.ts";

export const ADAPTER = "vault-policy";

/**
 * Where a Project's identities' documents land, each under the name Vault
 * holds it by, beside the job that writes them. Two identities that derive one
 * name claim one path, and a path has one owner (`E_PATH_COLLISION`).
 */
export const policiesOf = (directory: string): string =>
  `${directory}/policies`;
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

/** Each generated key of the project, once, in path then key order. */
function generatedOf(project: ResolvedProject): GeneratedKey[] {
  const keys = new Map<string, GeneratedKey>();
  for (const application of project.applications)
    for (const process of application.processes)
      // Stryker disable next-line ArrayDeclaration: no list and an empty one hold no grant alike.
      for (const grant of process.secrets ?? [])
        if ("generated" in grant)
          for (const { key, bytes, encoding, adopt } of grant.generated)
            keys.set(JSON.stringify([grant.path, key]), {
              path: grant.path,
              key,
              bytes,
              encoding,
              ...(adopt === undefined ? {} : { adopt }),
            });
  return [...keys.values()].sort((a, b) =>
    // No two keys share a path and a name, so `<=` would order the same list.
    // Stryker disable next-line EqualityOperator
    a.path === b.path ? (a.key < b.key ? -1 : 1) : a.path < b.path ? -1 : 1,
  );
}

export function renderVaultPolicy(project: ResolvedProject): Deliverable[] {
  const policies = policiesOf(policyJobDirectory(project.project));
  const generated = generatedOf(project);
  const keys: Deliverable[] =
    generated.length === 0
      ? []
      : [
          {
            path: `${policies}/${namespaceOf(project.project)}.generated.json`,
            adapter: ADAPTER,
            objects: [{ keys: generated }],
          },
        ];
  return [...renderIdentities(project, policies), ...keys];
}

function renderIdentities(
  project: ResolvedProject,
  policies: string,
): Deliverable[] {
  return project.applications.flatMap((application) =>
    holdersOf(application).flatMap(({ identity, grants }): Deliverable[] => {
      const name = vaultNameOf(application.namespace, identity);
      const stem = `${policies}/${name}`;
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

/**
 * A catalog method's own policy and auth role
 * (spec/v1/16-dependencies.md#applying-the-catalog): it reads the login it
 * applies the catalog with, and writes the database roles, or the keys, the
 * catalog names. They land beside the job that writes them, in `directory`.
 */
export function renderCatalogVault(
  job: ResolvedCatalogJob,
  directory: string,
): Deliverable[] {
  const { catalog } = job;
  const written =
    "databases" in catalog
      ? catalog.databases.flatMap(({ owner, data }) =>
          [owner, data].map((role) => `database/roles/${role}`),
        )
      : catalog.keys.map(({ path }) => path);
  const policy: VaultPolicy = {
    path: Object.fromEntries<{ capabilities: string[] }>([
      [catalog.admin.path, { capabilities: ["read"] }],
      [
        catalog.admin.path.replace(KV_DATA, KV_METADATA),
        { capabilities: ["read"] },
      ],
      ...written.map((path): [string, { capabilities: string[] }] => [
        path,
        { capabilities: ["create", "read", "update"] },
      ]),
    ]),
  };
  const role: VaultRole = {
    bound_service_account_names: [job.identity],
    bound_service_account_namespaces: [job.namespace],
    token_policies: [job.role],
  };
  const stem = `${policiesOf(directory)}/${job.role}`;
  return [
    { path: `${stem}.policy.json`, adapter: ADAPTER, objects: [policy] },
    { path: `${stem}.role.json`, adapter: ADAPTER, objects: [role] },
  ];
}
