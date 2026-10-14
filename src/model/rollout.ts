// A Rollout (spec/v1/55-delivery.md#rollouts): one Project's release, from the
// moment composition moves its pin until it is promoted, rolled back or
// superseded. Its identity is the repository that released it, the commit its
// fragment was published from, the environment and the version: what a GitHub
// Deployment is created from, and what the pin source hands Flux so every
// event about the Project's unit names the release it is about. Where the
// Project is exposed, it also carries where the release is reachable.

/** One Rollout's identity. */
export interface Rollout {
  readonly project: string;
  /** The repository the release was published from, as `<owner>/<name>`. */
  readonly repository: string;
  /** The commit its fragment records (`metadata.sourceSha`). */
  readonly sha: string;
  readonly environment: typeof ROLLOUT_ENVIRONMENT;
  readonly version: string;
  /**
   * Where the release is reachable: the host of the Project's first exposure,
   * over the scheme its tier's listener serves. None for a Project with no
   * exposure.
   */
  readonly url?: string;
}

/** What a tier's listener is reached over. */
const SCHEMES = { tls: "https", plain: "http" } as const;

interface Exposed {
  readonly applications: readonly {
    readonly exposure?: readonly {
      readonly host: string;
      readonly listener: keyof typeof SCHEMES;
    }[];
  }[];
}

/** The URL of a Project's first exposure, in the order its file declares them. */
export const rolloutUrlOf = ({ applications }: Exposed): string | undefined => {
  const [first] = applications.flatMap(({ exposure }) => exposure ?? []);
  return first === undefined
    ? undefined
    : `${SCHEMES[first.listener]}://${first.host}`;
};

/** The one environment the estate path delivers to. */
export const ROLLOUT_ENVIRONMENT = "production";

/**
 * The annotations a Project's unit carries its Rollout in. Flux copies every
 * annotation under this prefix into the metadata of each event about the
 * object, under the name after the prefix.
 */
export const ROLLOUT_ANNOTATIONS = {
  repository: "event.toolkit.fluxcd.io/repository",
  sha: "event.toolkit.fluxcd.io/sha",
  environment: "event.toolkit.fluxcd.io/environment",
  version: "event.toolkit.fluxcd.io/version",
  url: "event.toolkit.fluxcd.io/url",
} as const;

/** A Rollout as the annotations its Project's unit carries. */
export const rolloutAnnotations = (
  rollout: Rollout,
): Readonly<Record<string, string>> => ({
  [ROLLOUT_ANNOTATIONS.repository]: rollout.repository,
  [ROLLOUT_ANNOTATIONS.sha]: rollout.sha,
  [ROLLOUT_ANNOTATIONS.environment]: rollout.environment,
  [ROLLOUT_ANNOTATIONS.version]: rollout.version,
  ...(rollout.url === undefined
    ? {}
    : { [ROLLOUT_ANNOTATIONS.url]: rollout.url }),
});
