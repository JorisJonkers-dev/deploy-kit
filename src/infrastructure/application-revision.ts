// The Application revision (spec/v1/20-resolved-deployment.md#the-application-revision):
// the digest of one Application's element of the Resolved Deployment. It names
// what one release of one Application is, so it covers every decision about
// that Application and nothing else: the provenance, which moves whenever any
// input anywhere moves, is not part of it, and neither is the revision itself.
import { createHash } from "node:crypto";
import { canonicalJson } from "./canonical-json.ts";

/** The fields a published projection carries that are not the Application's own decisions. */
const NOT_THE_APPLICATION = new Set([
  "apiVersion",
  "kind",
  "provenance",
  "revision",
]);

/** `sha256:<hex>` over the canonical JSON of the Application's element. */
export function applicationRevision(
  application: Readonly<Record<string, unknown>>,
): string {
  const element = Object.fromEntries(
    Object.entries(application).filter(
      ([key]) => !NOT_THE_APPLICATION.has(key),
    ),
  );
  const hex = createHash("sha256").update(canonicalJson(element)).digest("hex");
  return `sha256:${hex}`;
}
