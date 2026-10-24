// What enrolment in the ambient mesh derives (spec/v1/20-resolved-deployment.md#the-mesh):
// facts of Istio's ambient data plane, not of the Platform document, which only
// names the Projects it enrols.
import type { PlatformIntentDocument } from "../model/platform-intent.ts";
import type { ResolvedApplicationDocument } from "../model/resolved-deployment.ts";

type ResolvedMesh = NonNullable<ResolvedApplicationDocument["mesh"]>;

/** ztunnel's HBONE port, which an enrolled peer arrives on and connects to. */
const TUNNEL_PORT = 15008;

/** The address ambient rewrites the kubelet's probes to, so a policy can admit them. */
const PROBE_SOURCE = "169.254.7.127/32";

/** What an Application of `project` derives from the mesh, where the platform enrols it. */
export const resolveMesh = (
  platform: PlatformIntentDocument,
  project: string,
): ResolvedMesh | undefined =>
  platform.mesh?.enrolled.includes(project) === true
    ? {
        dataplane: "ambient",
        tunnelPort: TUNNEL_PORT,
        probeSource: PROBE_SOURCE,
      }
    : undefined;
