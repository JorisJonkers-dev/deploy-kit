// The Stable Address (spec/v1/16-dependencies.md#the-stable-address): a name
// that stays the same for as long as a surface exists, whichever Instance of
// its provider serves it.

const CLUSTER_DOMAIN = "svc.cluster.local";

/**
 * The one namespace every Stable Address lives in, rendered by the
 * estate-scoped artifact, so no Project's namespace or move changes it.
 */
export const STABLE_NAMESPACE = "estate-system";

/** A surface of an Application, as a Stable Address names it. */
export interface Surface {
  readonly application: string;
  readonly surface: string;
}

/** A Stable Address's name: the Application Id and the surface, joined. */
export const stableNameOf = ({ application, surface }: Surface): string =>
  `${application}-${surface}`;

/** Where a consumer reaches a surface whichever Instance serves it. */
export const stableHostOf = (named: Surface): string =>
  `${stableNameOf(named)}.${STABLE_NAMESPACE}.${CLUSTER_DOMAIN}`;

/** A Stable Address resolved: its name, the active Instance it targets, and the surface's port. */
export interface ResolvedStableAddress {
  readonly name: string;
  readonly target: string;
  readonly port: number;
  /** The Projects that resolve it: it is delivered with any of them. */
  readonly consumers: readonly string[];
}
