// The `traefik` adapter (spec/v1/30-deliverables.md#adapters): per exposure
// the IngressRoute that serves it, in its Application's own directory and
// namespace, so a Project's routes are its own and its unit applies them. The one
// place Traefik's vocabulary is spelled: a listener is an entry point, an
// `acme` certificate source a resolver, a precedence a priority, a rate limit a
// RateLimit Middleware of the route's own.
import type { ResolvedProject } from "../../model/resolution.ts";
import type { ResolvedRoute } from "../../model/resolved-deployment.ts";
import type {
  IngressRoute,
  Middleware as RateLimit,
} from "../../objects/custom.ts";
import type { Deliverable } from "../../objects/deliverable.ts";
import { managedOnly } from "../shared/labels.ts";
import { applicationDirectory } from "../shared/paths.ts";
import { notSupported } from "../../model/internal-failure.ts";

export const ADAPTER = "traefik";

const ENTRY_POINTS = { tls: "websecure", plain: "web" } as const;

/** Traefik tries the higher priority first; precedence 1 is matched first. */
const PRIORITY_CEILING = 1000;

type Middleware = NonNullable<ResolvedRoute["middleware"]>[number];

/** The header Cloudflare forwards a client's own address in. */
const CLOUDFLARE_CLIENT = "CF-Connecting-IP";

/** The shared Middleware a step names, in the proxy's namespace, where the edge project renders it. */
function sharedName(step: Middleware): string {
  if (step.kind === "redirect")
    throw notSupported("a redirect Middleware is not rendered yet");
  if (step.kind === "forward-auth") return "forward-auth";
  return step.contentPolicy === undefined
    ? "security-headers"
    : `security-headers-${step.contentPolicy}`;
}

/** A route's rate limit as its own Middleware: its values are that route's alone. */
function rateLimitOf(
  step: Middleware,
  name: string,
  namespace: string,
  labels: Record<string, string>,
): RateLimit {
  // The resolution writes all four on every rate-limit step.
  const { allowance, per, burst, clientAddress } = step as Required<Middleware>;
  return {
    apiVersion: "traefik.io/v1alpha1",
    kind: "Middleware",
    metadata: { name, namespace, labels },
    spec: {
      rateLimit: {
        average: allowance,
        period: per,
        burst,
        ...(clientAddress === "cloudflare"
          ? { sourceCriterion: { requestHeaderName: CLOUDFLARE_CLIENT } }
          : {}),
      },
    },
  };
}

const matchOf = (host: string, { match, path }: ResolvedRoute): string =>
  `Host(\`${host}\`) && ${match === "exact" ? "Path" : "PathPrefix"}(\`${path}\`)`;

export function renderTraefik(project: ResolvedProject): Deliverable[] {
  return project.applications.flatMap((application) =>
    (application.exposure ?? []).map((exposure): Deliverable => {
      // A route set belongs to an Application and to none of its Processes.
      const labels = {
        "app.kubernetes.io/part-of": application.id,
        ...managedOnly(),
      };
      const limits: RateLimit[] = [];
      const route: IngressRoute = {
        apiVersion: "traefik.io/v1alpha1",
        kind: "IngressRoute",
        metadata: {
          name: `${application.id}-${exposure.name}`,
          namespace: application.namespace,
          labels,
        },
        spec: {
          entryPoints: [ENTRY_POINTS[exposure.listener]],
          routes: exposure.routes.map((served, index) => {
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
              ).map((step) => {
                if (step.kind !== "rate-limit")
                  return {
                    name: sharedName(step),
                    namespace: exposure.proxy.namespace,
                  };
                const name = `${application.id}-${exposure.name}-${String(index + 1)}-rate-limit`;
                limits.push(
                  rateLimitOf(step, name, application.namespace, labels),
                );
                return { name, namespace: application.namespace };
              }),
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
        path: `${applicationDirectory(project.project, application.id)}/route-${exposure.name}.yaml`,
        adapter: ADAPTER,
        objects: [route, ...limits],
      };
    }),
  );
}
