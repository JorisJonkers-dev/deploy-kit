// A resolved duration as the whole seconds a Kubernetes field takes.

const SECONDS: Readonly<Record<string, number>> = { s: 1, m: 60, h: 3600 };

/** `60s`, `10m` or `1h` in seconds; layer 2 writes nothing finer on these fields. */
export function wholeSeconds(duration: string): number {
  const match = /^(\d+)(s|m|h)$/.exec(duration);
  if (match === null)
    throw new Error(`${duration}: not a duration in whole seconds`);
  const [, amount, unit] = match as unknown as [string, string, string];
  return Number(amount) * (SECONDS[unit] as number);
}
