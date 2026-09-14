import type { GateOutput } from "../../scripts/lib/output.ts";

/** A GateOutput that keeps what a gate wrote, both streams in the order written. */
export interface Collected extends GateOutput {
  readonly text: () => string;
}

export function collect(): Collected {
  const chunks: string[] = [];
  const keep = (text: string): void => {
    chunks.push(text);
  };
  return { out: keep, err: keep, text: () => chunks.join("") };
}
