// The `traefik` adapter (spec/v1/30-deliverables.md#adapters): per tier the
// IngressRoutes that serve every exposure the tier carries, in the tier's
// estate-scoped directory, each in its Application's own namespace. The one
// place Traefik's vocabulary is spelled: a listener is an entry point, an
// `acme` certificate source a resolver, a precedence a priority.
import type { ResolvedProject } from "../../model/resolution.ts";
import type { ResolvedRoute } from "../../model/resolved-deployment.ts";
import type { IngressRoute } from "../../objects/custom.ts";
import type { Deliverable } from "../../objects/deliverable.ts";
import { managedOnly } from "../shared/labels.ts";
import { tierDirectory } from "../shared/paths.ts";
import { notSupported } from "../../model/internal-failure.ts";

export const ADAPTER = "traefik";

const ENTRY_POINTS = { tls: "websecure", plain: "web" } as const;

/** Traefik tries the higher priority first; precedence 1 is matched first. */
const PRIORITY_CEILING = 1000;

type Middleware = NonNullable<ResolvedRoute["middleware"]>[number];

/** The Middleware a step names, in the proxy's namespace, where the edge project renders it. */
function middlewareName(step: Middleware): string {
  if (step.kind === "redirect")
    throw notSupported("a redirect Middleware is not rendered yet");
  if (step.kind === "forward-auth") return "forward-auth";
  return step.contentPolicy === undefined
    ? "security-headers"
    : `security-headers-${step.contentPolicy}`;
}

const matchOf = (host: string, { match, path }: ResolvedRoute): string =>
  `Host(\`${host}\`) && ${match === "exact" ? "Path" : "PathPrefix"}(\`${path}\`)`;

export function renderTraefik(project: ResolvedProject): Deliverable[] {
  return project.applications.flatMap((application) =>
    (application.exposure ?? []).map((exposure): Deliverable => {
      const route: IngressRoute = {
        apiVersion: "traefik.io/v1alpha1",
        kind: "IngressRoute",
        metadata: {
          name: `${application.id}-${exposure.name}`,
          namespace: application.namespace,
          // A route set belongs to an Application and to none of its Processes.
          labels: {
            "app.kubernetes.io/part-of": application.id,
            ...managedOnly(),
          },
        },
        spec: {
          entryPoints: [ENTRY_POINTS[exposure.listener]],
          routes: exposure.routes.map((served) => {
            // A route names a Process of this Application and a surface it
            // provides, or E_UNKNOWN_PROCESS and E_UNKNOWN_SURFACE refused it.
            const process = application.processes.find(
              ({ name }) => name === served.process,
            ) as (typeof application.processes)[number];
            const surface = (
              process.surfaces as NonNullable<typeof process.surfaces>
            ).find(({ name }) => name === served.surface) as {
              readonly port: number;
            };
            return {
              kind: "Rule" as const,
              match: matchOf(exposure.host, served),
              priority: PRIORITY_CEILING - served.precedence,
              // Every resolved route carries at least its security baseline.
              middlewares: (
                served.middleware as NonNullable<typeof served.middleware>
              ).map((step) => ({
                name: middlewareName(step),
                namespace: exposure.proxy.namespace,
              })),
              services: [
                {
                  name: served.process,
                  namespace: application.namespace,
                  port: surface.port,
                },
              ],
            };
          }),
          ...(exposure.certificates === "acme"
            ? { tls: { certResolver: "acme" } }
            : {}),
        },
      };
      return {
        path: `${tierDirectory(exposure.tier)}/${application.id}-${exposure.name}.yaml`,
        adapter: ADAPTER,
        objects: [route],
      };
    }),
  );
}
