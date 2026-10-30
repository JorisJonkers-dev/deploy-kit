// The default TLS store a tier's `certificateFrom` derives
// (spec/v1/30-deliverables.md#adapters): it names the Secret the certificate is
// synced to, beside the tier's proxy, and every proxy serves it to a route that
// names no certificate of its own. Rendered by the Project that declares the
// proxy.
import { applicationOf } from "../../model/platform-intent.ts";
import { namespaceOf } from "../../model/runtime-profiles.ts";
import {
  DEFAULT_TLS_STORE,
  type ResolvedHeldCertificate,
} from "../../model/tier-proxy.ts";
import type { Deliverable } from "../../objects/deliverable.ts";
import { managedOnly } from "../shared/labels.ts";
import { applicationDirectory } from "../shared/paths.ts";
import { ADAPTER } from "./render.ts";

export function renderHeldCertificates(
  held: readonly ResolvedHeldCertificate[],
  projects: readonly string[],
): Deliverable[] {
  return held.flatMap(({ proxy, secret }): Deliverable[] => {
    const project = proxy.slice(0, proxy.indexOf("/"));
    if (!projects.includes(project)) return [];
    const application = applicationOf(proxy);
    return [
      {
        path: `${applicationDirectory(project, application)}/tlsstore.yaml`,
        adapter: ADAPTER,
        objects: [
          {
            apiVersion: "traefik.io/v1alpha1",
            kind: "TLSStore",
            metadata: {
              name: DEFAULT_TLS_STORE,
              namespace: namespaceOf(project),
              labels: {
                "app.kubernetes.io/part-of": application,
                ...managedOnly(),
              },
            },
            spec: { defaultCertificate: { secretName: secret } },
          },
        ],
      },
    ];
  });
}
