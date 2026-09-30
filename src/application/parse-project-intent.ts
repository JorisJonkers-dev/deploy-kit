import { projectDiagnostics } from "../check/project.ts";
import { lowerProject } from "../lower/project.ts";
import type { Result } from "../model/diagnostic.ts";
import type { EffectiveProject } from "../model/effective-intent.ts";
import type { EnvSource } from "../model/env.ts";
import type { ProjectIntentDocument } from "../model/project-intent.ts";
import { readEnv } from "../read/env.ts";
import { readProjectIntent } from "../read/project-intent.ts";
import { readYaml } from "../read/yaml.ts";

/** The authored document, and the Effective Intent everything downstream reads. */
export interface ParsedProjectIntent {
  readonly document: ProjectIntentDocument;
  readonly effective: EffectiveProject;
}

/** Read, check, lower: the lowering runs after the document's own rules and
 * before composition. */
export function parseProjectIntent(
  text: string,
  env: readonly EnvSource[] = [],
): Result<ParsedProjectIntent> {
  const read = readYaml(text);
  if (!read.ok) return read;
  const scoped = readEnv(env);
  if (!scoped.ok) return scoped;
  const document = readProjectIntent(read.value);
  if (!document.ok) return document;
  const refusals = projectDiagnostics(document.value, scoped.value);
  if (refusals.length > 0) return { ok: false, diagnostics: refusals };
  return {
    ok: true,
    value: {
      document: document.value,
      effective: lowerProject(document.value, scoped.value),
    },
  };
}
