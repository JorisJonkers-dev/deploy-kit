// The Application revision (spec/v1/20-resolved-deployment.md#the-application-revision):
// the digest of one Application's element of the Resolved Deployment. It names
// one release of one Application, so it covers every decision about that
// Application and nothing else: a published projection's document header and
// provenance, which moves whenever any input anywhere moves, are not part of
// it, and neither is the revision itself.
import type { Hasher } from "../hasher.ts";

/** The keys a published projection carries that are not the Application's own decisions. */
const NOT_THE_APPLICATION = new Set([
  "apiVersion",
  "kind",
  "provenance",
  "revision",
]);

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
