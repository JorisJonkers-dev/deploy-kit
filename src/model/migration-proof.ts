// The migration proof (spec/v1/55-delivery.md#migration-safety): what an
// Application's own CI proved about the changelog it ships, written beside the
// project file and covered by the fragment's digest. Per Application that
// moves its schema with a changelog: the serving revision the compatibility
// suite ran against, absent on a first release, and whether the release holds
// a changeset that cannot run in a transaction.
import { z } from "zod";

const text = z.string().min(1);

const provenApplication = z.strictObject({
  id: text,
  testedAgainst: z
    .string()
    .regex(/^sha256:[a-f0-9]{64}$/)
    .exactOptional(),
  nonTransactional: z.boolean(),
});

export const migrationProof = z.strictObject({
  apiVersion: z.literal("proof.jorisjonkers.dev/v1"),
  kind: z.literal("MigrationProof"),
  schemaVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
  applications: z.array(provenApplication),
});

export type MigrationProofDocument = z.output<typeof migrationProof>;

/** The image a managed migration runs: built FROM the platform's runner, locked per Application. */
export const migrationImage = (application: string): string =>
  `${application}-migration`;
