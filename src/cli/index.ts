#!/usr/bin/env node
// The `deploy-kit` command: the arguments, the clock and the toolkit's release
// handed to the CLI, and what it decided performed.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { perform } from "./boundary.ts";
import { main } from "./main.ts";

const { version } = JSON.parse(
  readFileSync(join(import.meta.dirname, "..", "..", "package.json"), "utf8"),
) as { readonly version: string };

perform(
  main(process.argv.slice(2), {
    now: () => new Date().toISOString(),
    toolkitVersion: version,
  }),
);
