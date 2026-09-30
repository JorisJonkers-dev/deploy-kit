// The Effective Intent: Project Intent with every shared declaration lowered
// onto the Processes that hold it, and the only layer-1 shape anything
// downstream reads (spec/v1/10-project-intent.md#the-effective-intent,
// docs/adr/model/0012-shared-intent-descends-and-is-lowered.md). It keeps the
// authored vocabulary, so its canonical JSON is the `effective.json` oracle both
// implementations meet at (docs/architecture.md#the-parity-contract).
//
// A key no level declares is absent here, as it is in the authored file, and a
// route or a scrape names its Process and surface as the author wrote them: the
// names resolve inside the lowered Application that holds them.
import type {
  ApplicationDocument,
  EnvFile,
  Placement,
  ProcessDocument,
  ProjectIntentDocument,
  SharedIntentKey,
} from "./project-intent.ts";

/** A placement with the quantities every lowered Process carries. */
export type CompletePlacement = Placement & {
  readonly memory: string;
  readonly cpu: string;
};

export type EffectiveProcess = Omit<ProcessDocument, SharedIntentKey> &
  Partial<Pick<ProcessDocument, Exclude<SharedIntentKey, "placement">>> & {
    readonly placement: CompletePlacement;
    /** One file per Cluster Target, each extended by the scopes above. */
    readonly env?: readonly EnvFile[];
  };

export type EffectiveApplication = Omit<
  ApplicationDocument,
  SharedIntentKey | "processes"
> & {
  readonly processes: readonly EffectiveProcess[];
};

export type EffectiveProject = Pick<
  ProjectIntentDocument,
  "project" | "owner"
> & {
  readonly applications: readonly EffectiveApplication[];
};
