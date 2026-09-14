// Every failure is a Diagnostic, and a use-case returns a Result over a list
// of them rather than throwing (docs/architecture.md#error-model). One command
// reports ten mistakes rather than the first one, so nothing here short
// circuits and nothing here throws: an exception is reserved for a broken
// invariant inside the compiler, never for a defect in what it was given.

/**
 * Where a refusal came from, which is what a fixture's `expect:` header names.
 *
 * - `syntax`: the bytes are not the concrete syntax at all (YAML did not parse).
 * - `schema`: the document is not an instance of the metamodel. A value outside
 *   a closed vocabulary, a key no class carries, a `kv` field on a `transit`
 *   grant. These carry no `E_` code, because the refusal is the language
 *   definition's rather than a named rule's
 *   (spec/v1/examples/refusals/README.md).
 * - `document`: the document is an instance, and a well-formedness rule refuses
 *   it. These always carry the rule's `E_` code.
 */
export type DiagnosticKind = "syntax" | "schema" | "document";

/** An `E_` code the specification defines, or the schema stage's own name. */
export type DiagnosticCode = `E_${string}` | "schema" | "syntax";

/**
 * One refusal, addressed. `at` is the **document path**: the dotted route from
 * the root of the document to the value that is wrong, so a reader opens the
 * file at the right line instead of grepping for the message.
 */
export interface Diagnostic {
  readonly code: DiagnosticCode;
  readonly kind: DiagnosticKind;
  /** The file the document was read from, as the caller named it. */
  readonly document: string;
  /** The path inside that document, e.g. `services[0].workloads[1].cutover`. */
  readonly at: string;
  readonly message: string;
}

/** A use-case's answer: the value, or every reason there is not one. */
export type Result<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly diagnostics: readonly Diagnostic[] };

/** A successful Result. */
export function accepted<T>(value: T): Result<T> {
  return { ok: true, value };
}

/** A failed Result. Empty diagnostics would be a lie, so it is rejected here. */
export function refused<T>(diagnostics: readonly Diagnostic[]): Result<T> {
  if (diagnostics.length === 0)
    throw new Error("a refusal with no diagnostic says nothing");
  return { ok: false, diagnostics };
}

/** Join a parent document path and a child segment, for a map or object key. */
export function child(parent: string, key: string): string {
  return parent === "" ? key : `${parent}.${key}`;
}

/** Join a parent document path and a list index. */
export function at(parent: string, index: number): string {
  return `${parent}[${index}]`;
}
