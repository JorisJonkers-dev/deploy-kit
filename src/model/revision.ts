// The Application revision (spec/v1/20-resolved-deployment.md#the-application-revision):
// the digest of one Application's element of the Resolved Deployment. It names
// one release of one Application, so it covers every decision about that
// Application and nothing else: a published projection's document header and
// provenance, which moves whenever any input anywhere moves, are not part of
// it, and neither is the revision itself.
import type { Hasher } from "./hasher.ts";

/** The keys a published projection carries that are not the Application's own decisions. */
const NOT_THE_APPLICATION = new Set([
  "apiVersion",
  "kind",
  "provenance",
  "revision",
]);

/** How many hex digits of a revision name its release wherever a name must be short. */
const TAG_DIGITS = 12;

/**
 * The tag of a revision (spec/v1/55-delivery.md#failure-and-undo): its first
 * twelve hex digits, which the migration Jobs are named by and the runner
 * marks the database with.
 */
export const tagOf = (revision: string): string =>
  (revision.split(":")[1] as string).slice(0, TAG_DIGITS);

/** The revision of an Application's element, or of the projection publishing it. */
export function applicationRevision(
  application: Readonly<Record<string, unknown>>,
  hash: Hasher,
): string {
  return hash(
    Object.fromEntries(
      Object.entries(application).filter(
        ([key]) => !NOT_THE_APPLICATION.has(key),
      ),
    ),
  );
}
