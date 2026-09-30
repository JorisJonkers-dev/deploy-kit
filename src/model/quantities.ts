// Kubernetes quantities, compared the way eligibility compares them
// (spec/v1/20-resolved-deployment.md#layer-2-does-not-assign-a-node): a
// declared requirement against a node's declared allocatable, never against
// free capacity. The authored shape is still free text, so a spelling read
// here as nothing else stops the derivation rather than reading as NaN.

const CPU = /^(\d+)(m?)$/;
const MEMORY = /^(\d+)(Mi|Gi|Ti)?$/;
const MEBIBYTES: Readonly<Record<string, number>> = {
  Mi: 1,
  Gi: 1024,
  Ti: 1024 ** 2,
};

/** A cpu quantity in millicores: `50m`, or `2` whole cores. */
export function millicores(quantity: string): number {
  const match = CPU.exec(quantity);
  if (match === null)
    throw new Error(`${quantity}: not a cpu quantity the model reads`);
  const [, amount, milli] = match as unknown as [string, string, string];
  return Number(amount) * (milli === "m" ? 1 : 1000);
}

/** A memory quantity in MiB: `256Mi`, `2Gi`, `1Ti`, or bytes with no unit. */
export function mebibytes(quantity: string): number {
  const match = MEMORY.exec(quantity);
  if (match === null)
    throw new Error(`${quantity}: not a memory quantity the model reads`);
  const [, amount, unit] = match as unknown as [
    string,
    string,
    string | undefined,
  ];
  return unit === undefined
    ? Number(amount) / 1024 ** 2
    : Number(amount) * (MEBIBYTES[unit] as number);
}
