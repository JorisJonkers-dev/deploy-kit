// What a committed pin source holds that composition does not derive
// (spec/v1/55-delivery.md#what-a-pin-source-holds): the digest its artifact was
// published at, and whether it is still the first delivery's, recreating the
// Deployments it could not take over in place. Everything else in the file
// derives, so a source rewritten while its pin stays keeps these two as they
// are committed.
import { parseAllDocuments } from "yaml";

export interface CommittedPin {
  readonly digest: string;
  readonly recreates: boolean;
}

type Fields = Readonly<Record<string, unknown>>;

/** The fields of a mapping, and none of anything else. */
const fieldsOf = (value: unknown): Fields =>
  typeof value === "object" && value !== null ? (value as Fields) : {};

/** What `text` pins, or nothing where it names no artifact by digest. */
export function readPinSource(text: string): CommittedPin | undefined {
  const objects = parseAllDocuments(text).map((document) =>
    fieldsOf(document.toJS()),
  );
  const digest = objects
    .filter(({ kind }) => kind === "OCIRepository")
    .map(({ spec }) => fieldsOf(fieldsOf(spec)["ref"])["digest"])
    .find((value) => typeof value === "string");
  if (digest === undefined) return undefined;
  return {
    digest,
    recreates: objects.some(
      ({ kind, spec }) =>
        kind === "Kustomization" && "patches" in fieldsOf(spec),
    ),
  };
}
