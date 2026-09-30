// The env files beside a project file, as the model holds them
// (spec/v1/10-project-intent.md#configuration): each authored file, and the
// level its scope directory names.
import type { EnvFile } from "./project-intent.ts";

/** An authored env file, by the path that says which level it reaches. */
export interface EnvSource {
  readonly path: string;
  readonly text: string;
}

/** Which level a scope directory names. */
export type EnvScope =
  | { readonly level: "project" }
  | { readonly level: "application"; readonly id: string }
  | { readonly level: "process"; readonly name: string };

export interface ScopedEnv {
  readonly path: string;
  readonly scope: EnvScope;
  readonly file: EnvFile;
}
