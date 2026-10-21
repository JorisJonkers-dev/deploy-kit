// A Rollback's database dump's credential (spec/v1/30-deliverables.md#a-rollbacks-backup):
// the operator reads it as the identity that already holds it, under that
// identity's own role, so no new Secret Store path is written. It leaves the
// render with the request, and the lease with it.
import type { Deliverable } from "../../objects/deliverable.ts";
import type { VaultAuth, VaultDynamicSecret } from "../../objects/custom.ts";
import { vaultNameOf } from "../../model/runtime-profiles.ts";
import { labelsOf } from "../shared/labels.ts";
import { ROLLBACK_BACKUPS_DIRECTORY } from "../shared/paths.ts";
import type { RollbackDump } from "../shared/rollback-dump.ts";
import {
  ADAPTER,
  API,
  CONNECTION,
  DATABASE_MOUNT,
  UNTRACKED,
} from "./render.ts";

export function renderRollbackCredential(
  project: string,
  dump: RollbackDump,
): Deliverable[] {
  const metadata = {
    name: dump.name,
    namespace: dump.namespace,
    labels: labelsOf(
      { name: dump.instance, runtime: "none" },
      dump.application,
    ),
  };
  const auth: VaultAuth = {
    apiVersion: API,
    kind: "VaultAuth",
    metadata,
    spec: {
      vaultConnectionRef: CONNECTION,
      method: "kubernetes",
      mount: "kubernetes",
      kubernetes: {
        role: vaultNameOf(dump.namespace, dump.identity),
        serviceAccount: dump.identity,
      },
    },
  };
  const secret: VaultDynamicSecret = {
    apiVersion: API,
    kind: "VaultDynamicSecret",
    metadata,
    spec: {
      vaultAuthRef: dump.name,
      mount: DATABASE_MOUNT,
      path: dump.role,
      destination: { name: dump.name, create: true, annotations: UNTRACKED },
    },
  };
  return [
    {
      path: `${ROLLBACK_BACKUPS_DIRECTORY}/${project}-vso.yaml`,
      adapter: ADAPTER,
      objects: [auth, secret],
    },
  ];
}
