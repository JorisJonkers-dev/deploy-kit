import type { Result } from "../model/diagnostic.ts";
import type { ParticipantsDocument } from "../model/participants.ts";
import { readParticipants } from "../read/participants.ts";
import { readYaml } from "../read/yaml.ts";

/** The participants list, read: `participants.yml` of the Estate repository. */
export function parseParticipants(text: string): Result<ParticipantsDocument> {
  const read = readYaml(text);
  return read.ok ? readParticipants(read.value) : read;
}
