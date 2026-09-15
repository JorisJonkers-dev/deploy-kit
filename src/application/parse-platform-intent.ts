import type { Result } from "../domain/diagnostic.ts";
import {
  validatePlatformIntent,
  type ValidatedPlatformIntent,
} from "../wire/platform-intent/map.ts";
import { readYaml } from "../wire/project-intent/read.ts";

export function parsePlatformIntent(
  text: string,
): Result<ValidatedPlatformIntent> {
  const read = readYaml(text);
  return read.ok ? validatePlatformIntent(read.value) : read;
}
