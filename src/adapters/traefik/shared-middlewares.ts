// The shared Middlewares a route names (spec/v1/30-deliverables.md#adapters):
// the security-headers baseline, and one per content policy, each the baseline
// plus that policy's Content-Security-Policy. The vocabulary is closed, so all
// four are rendered whatever the routes ask for, and no Project's exposure
// changes the edge's share. They live in each tier proxy's namespace, where
// every route names them, rendered once per namespace by the Project that
// declares the proxy.
import { namespaceOf } from "../../model/runtime-profiles.ts";
import { applicationOf } from "../../model/platform-intent.ts";
import { CONTENT_POLICIES } from "../../model/vocabularies.ts";
import type { ContentPolicy } from "../../model/vocabularies.ts";
import type { Middleware } from "../../objects/custom.ts";
import type { Deliverable } from "../../objects/deliverable.ts";
import { managedOnly } from "../shared/labels.ts";
import { applicationDirectory } from "../shared/paths.ts";
import { ADAPTER } from "./render.ts";

/** What each content policy lets a page load, beside its own origin. */
export const CONTENT_SECURITY_POLICIES: Readonly<
  Record<ContentPolicy, string>
> = {
  strict: "default-src 'self'",
  admin: "default-src 'self'; style-src 'self' 'unsafe-inline'",
  workflow: "default-src 'self'; connect-src 'self' https:",
};

/** The baseline every route carries: no sniffing, no framing, HTTPS remembered. */
const BASELINE = {
  contentTypeNosniff: true,
  frameDeny: true,
  referrerPolicy: "strict-origin-when-cross-origin",
  permissionsPolicy: "camera=(), microphone=(), geolocation=()",
  stsSeconds: 31_536_000,
  stsIncludeSubdomains: true,
} as const;

/**
 * The shared Middlewares of each tier proxy's namespace that a rendered
 * Project declares, by the proxy's `<project>/<application>`. A namespace two
 * proxies share holds them once, in the first proxy's directory by name.
 */
export function renderSharedMiddlewares(
  proxies: readonly string[],
  projects: readonly string[],
): Deliverable[] {
  const homes = new Map<string, string>();
  for (const proxy of [...proxies].sort()) {
    const project = proxy.slice(0, proxy.indexOf("/"));
    if (projects.includes(project) && !homes.has(project))
      homes.set(project, applicationOf(proxy));
  }
  return [...homes].map(([project, application]): Deliverable => {
    const metadata = (name: string) => ({
      name,
      namespace: namespaceOf(project),
      labels: { "app.kubernetes.io/part-of": application, ...managedOnly() },
    });
    const objects: Middleware[] = [
      {
        apiVersion: "traefik.io/v1alpha1",
        kind: "Middleware",
        metadata: metadata("security-headers"),
        spec: { headers: { ...BASELINE } },
      },
      ...CONTENT_POLICIES.map((policy): Middleware => ({
        apiVersion: "traefik.io/v1alpha1",
        kind: "Middleware",
        metadata: metadata(`security-headers-${policy}`),
        spec: {
          headers: {
            ...BASELINE,
            contentSecurityPolicy: CONTENT_SECURITY_POLICIES[policy],
          },
        },
      })),
    ];
    return {
      path: `${applicationDirectory(project, application)}/middlewares.yaml`,
      adapter: ADAPTER,
      objects,
    };
  });
}
