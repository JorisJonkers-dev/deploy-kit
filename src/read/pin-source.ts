// What a committed pin source holds that composition does not derive
// (spec/v1/55-delivery.md#what-a-pin-source-holds): the digest its artifact was
// published at, and whether it is still the first delivery's, recreating the
// Deployments it could not take over in place. Everything else in the file
// derives, so a source rewritten while its pin stays keeps these two as they
// are committed. A paused Project's keeps its units too, as committed: what
// would be derived for them comes from a fragment a human is holding back.
//
// A committed source is also what the derived one is held against, and by the
// objects each holds, never by its text: a Pause is written by another tool,
// which quotes what composition writes bare, and a source that says the same
// is not one to write again.
import { isDeepStrictEqual } from "node:util";
import { parseAllDocuments } from "yaml";

type Fields = Readonly<Record<string, unknown>>;

export interface CommittedPin {
  readonly digest: string;
  readonly recreates: boolean;
  /** Each Reconcile Unit's Kustomization, as committed, in the order committed. */
  readonly units: readonly Fields[];
}

/** The fields of a mapping, and none of anything else. */
const fieldsOf = (value: unknown): Fields =>
  typeof value === "object" && value !== null ? (value as Fields) : {};

/** Every document of `text`, as the value it holds. */
const documentsOf = (text: string): unknown[] =>
  parseAllDocuments(text).map((document) => document.toJS() as unknown);

/**
 * Whether two pin sources hold the same objects in the same order, however
 * each is written: quoting, comments, flow or block style and the order of a
 * mapping's keys say nothing.
 */
export const samePinSource = (one: string, other: string): boolean =>
  isDeepStrictEqual(documentsOf(one), documentsOf(other));

/** What `text` pins, or nothing where it names no artifact by digest. */
export function readPinSource(text: string): CommittedPin | undefined {
  const objects = documentsOf(text).map(fieldsOf);
  const digest = objects
    .filter(({ kind }) => kind === "OCIRepository")
    .map(({ spec }) => fieldsOf(fieldsOf(spec)["ref"])["digest"])
    .find((value) => typeof value === "string");
  if (digest === undefined) return undefined;
  const units = objects.filter(({ kind }) => kind === "Kustomization");
  return {
    digest,
    recreates: units.some(({ spec }) => "patches" in fieldsOf(spec)),
    units,
  };
}
