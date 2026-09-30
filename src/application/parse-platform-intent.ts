import { platformDiagnostics } from "../check/platform.ts";
import type { Result } from "../model/diagnostic.ts";
import type { PlatformIntentDocument } from "../model/platform-intent.ts";
import { readPlatformIntent } from "../read/platform-intent.ts";
import { readYaml } from "../read/yaml.ts";

/** The Platform document, read and checked on its own. */
export interface ParsedPlatformIntent {
  readonly document: PlatformIntentDocument;
}

export function parsePlatformIntent(
  text: string,
): Result<ParsedPlatformIntent> {
  const read = readYaml(text);
  if (!read.ok) return read;
  const document = readPlatformIntent(read.value);
  if (!document.ok) return document;
  const refusals = platformDiagnostics(document.value);
  return refusals.length > 0
    ? { ok: false, diagnostics: refusals }
    : { ok: true, value: { document: document.value } };
}
