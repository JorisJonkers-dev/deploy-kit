import type { Result } from "../domain/diagnostic.ts";
import type { EffectiveProject } from "../domain/project-intent/model.ts";
import { lowerProject } from "../domain/project-intent/lower.ts";
import {
  validateProjectIntent,
  type ValidatedProjectIntent,
} from "../wire/project-intent/map.ts";
import { readEnv, type EnvSource } from "../wire/project-intent/env.ts";
import { readYaml } from "../wire/project-intent/read.ts";

/** Every stage downstream reads `effective`, never the authored levels. */
export interface ParsedProjectIntent extends ValidatedProjectIntent {
  readonly effective: EffectiveProject;
}

/** The lowering runs after the document's own rules and before composition. */
export function parseProjectIntent(
  text: string,
  env: readonly EnvSource[] = [],
): Result<ParsedProjectIntent> {
  const read = readYaml(text);
  if (!read.ok) return read;
  const scoped = readEnv(env);
  if (!scoped.ok) return scoped;
  const validated = validateProjectIntent(read.value, scoped.value);
  if (!validated.ok) return validated;
  return {
    ok: true,
    value: {
      ...validated.value,
      effective: lowerProject(validated.value.project),
    },
  };
}
