// The production Hasher: sha256 over the RFC 8785 canonical form, the one the
// oracle files are written in (docs/architecture.md#ports).
import { createHash } from "node:crypto";
import type { Hasher } from "../domain/hasher.ts";
import { canonicalJson } from "./canonical-json.ts";

export const sha256Hasher: Hasher = (value) =>
  `sha256:${createHash("sha256").update(canonicalJson(value)).digest("hex")}`;
