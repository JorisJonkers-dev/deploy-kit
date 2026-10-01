// A failure of the compiler itself, never of what it was given: an authored
// mistake is a Diagnostic, returned rather than thrown
// (docs/architecture.md#error-model). Every failure the compiler throws is one
// of these, so the ways it can fail are one enumerable list rather than
// whatever a reader finds by searching for a throw (RULE-074 in
// docs/architecture-rules.md).

/** Which kind of failure of the compiler a thrown one is. */
export type InternalFailureKind =
  /** A construct the model accepts that the compiler does not resolve or render yet: a known gap. */
  | "unsupported"
  /** An authored mistake no check refuses yet, which reached a later step: a known gap. */
  | "unchecked"
  /** A state the compiler's own invariants rule out: a bug. */
  | "invariant";

export class InternalFailure extends Error {
  readonly kind: InternalFailureKind;

  constructor(kind: InternalFailureKind, message: string) {
    super(message);
    this.kind = kind;
  }
}

/** A construct the model accepts that the compiler does not handle yet. */
export const notSupported = (message: string): InternalFailure =>
  new InternalFailure("unsupported", message);

/** An authored mistake that reached a step because no check refuses it yet. */
export const notChecked = (message: string): InternalFailure =>
  new InternalFailure("unchecked", message);

/** A state the compiler's own invariants rule out. */
export const brokenInvariant = (message: string): InternalFailure =>
  new InternalFailure("invariant", message);
