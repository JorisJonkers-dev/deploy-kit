// Where Flux's events about every Project's unit go
// (spec/v1/55-delivery.md#rollouts): derived where the platform names a
// Reporter and a project file declares it. Nothing declares the route itself:
// the Reporter's address and Flux's namespace are both the model's already.
import { fluxNamespaceOf } from "../model/platform-intent.ts";
import type { PinnedSet } from "../model/resolution.ts";
import type { ResolvedEvents } from "../model/resolved-deployment.ts";
import { reporterEndpoint } from "../model/runtime-profiles.ts";

/** The path of the Reporter's `http` surface that receives Flux's events. */
export const EVENTS_PATH = "/flux";

export function resolveEvents(set: PinnedSet): ResolvedEvents | undefined {
  // A named Reporter answers on `http`, or E_UNKNOWN_REPORTER refused the set.
  const reporter = reporterEndpoint(set.platform, set.projects);
  return reporter === undefined
    ? undefined
    : {
        namespace: fluxNamespaceOf(set.platform),
        address: `${reporter}${EVENTS_PATH}`,
      };
}
