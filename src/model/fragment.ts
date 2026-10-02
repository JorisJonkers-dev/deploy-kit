// An Intent Fragment's manifest (spec/v1/40-composition.md#fragments): what a
// release of one project file publishes beside the files themselves. It names
// the one project the fragment declares, the repository and commit it came
// from, the release version release-please tagged, and the hash of the
// authored inputs alone. The fragment's own digest is not here: an artefact
// cannot contain it, so the puller records it beside the files.
import { z } from "zod";
import { semver } from "./composition-lock.ts";

const text = z.string().min(1);

export const fragmentManifest = z.strictObject({
  apiVersion: z.literal("intent.jorisjonkers.dev/v1"),
  kind: z.literal("IntentFragment"),
  metadata: z.strictObject({
    repository: z.string().regex(/^[^/\s]+\/[^/\s]+$/),
    sourceSha: z.string().regex(/^[a-f0-9]{40}$/),
  }),
  spec: z.strictObject({
    schemaVersion: semver,
    project: text,
    version: semver,
    inputsSha: z.string().regex(/^[a-f0-9]{64}$/),
  }),
});

export type FragmentManifest = z.output<typeof fragmentManifest>;
