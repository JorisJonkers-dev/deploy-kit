// Durations the way the model writes them (`500ms`, `20s`, `10m`, `1h`), in
// seconds where a derivation multiplies one.

const DURATION = /^(\d+)(ms|s|m|h)$/;
const SECONDS: Readonly<Record<string, number>> = {
  ms: 1 / 1000,
  s: 1,
  m: 60,
  h: 3600,
};

/**
 * A duration in seconds. The authored shape is still free text, so a spelling
 * the model does not write stops the derivation rather than reading as NaN.
 */
export function seconds(duration: string): number {
  const match = DURATION.exec(duration);
  if (match === null)
    throw new Error(`${duration}: not a duration the model writes`);
  const [, amount, unit] = match as unknown as [string, string, string];
  return Number(amount) * (SECONDS[unit] as number);
}

/** Whole seconds, written as a duration. */
export const inSeconds = (value: number): string => `${String(value)}s`;
