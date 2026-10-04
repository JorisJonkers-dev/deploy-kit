// What a Process's backups need of the network
// (spec/v1/16-dependencies.md#the-backup-identitys-policy): whether it has a
// backup at all, and the surface the platform's method for its engine dumps.
// The Process's own policy and its backup identity's are both derived from
// this, so the two halves of the flow cannot disagree.
import type { PlatformIntentDocument } from "./platform-intent.ts";

/** What a Process says of its storage: authored and lowered alike. */
export interface Stored {
  readonly engine?: string;
  readonly volumes?: readonly { readonly durability: string }[];
}

/** The classes whose loss a backup protects against; `reconstructible` earns none. */
export const BACKED_UP: ReadonlySet<string> = new Set([
  "recoverable",
  "irreplaceable",
]);

/** Whether a volume of the Process derives a backup, and so a backup identity. */
export const backedUp = (process: Stored): boolean =>
  // A missing list and an empty one hold no volume alike.
  // Stryker disable next-line ArrayDeclaration
  (process.volumes ?? []).some(({ durability }) => BACKED_UP.has(durability));

/**
 * The surface of the Process its backups connect to: the one the Platform
 * document names for its engine, where the Process is backed up at all. A
 * method that reads the volume alone names none, and a Process nothing backs
 * up has no backup to admit.
 */
export const dumpedSurfaceOf = (
  process: Stored,
  platform: PlatformIntentDocument,
): string | undefined =>
  backedUp(process)
    ? Object.entries(platform.engines).find(
        ([engine]) => engine === process.engine,
      )?.[1].surface
    : undefined;
