export interface Diagnostic {
  readonly code: string;
  readonly path: string;
  readonly message: string;
  readonly hint: string;
}

export type Result<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly diagnostics: readonly Diagnostic[] };
