import type { Result } from "../domain/diagnostic.ts";
import {
  validateProjectIntent,
  type ValidatedProjectIntent,
} from "../wire/project-intent/map.ts";
import { readYaml } from "../wire/project-intent/read.ts";

export function parseProjectIntent(
  text: string,
): Result<ValidatedProjectIntent> {
  const read = readYaml(text);
  return read.ok ? validateProjectIntent(read.value) : read;
}
