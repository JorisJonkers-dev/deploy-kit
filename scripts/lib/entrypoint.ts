// Whether a module is the script Node was asked to run.
//
// Every gate is a library first: its tests import it and call the lint
// in-process, which is the only way coverage and mutation testing see the
// lines that decide. Starting it with `node scripts/<gate>.ts` is the second
// use, and this is what tells the two apart without an entry file per gate.
import { realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";

/**
 * True when `invoked`, the path Node was started with, is the module at
 * `moduleUrl`. Node resolves an ES module to its real path, so a script
 * started through a symlink still compares equal, and a path that does not
 * exist is simply not this module.
 */
export function isEntrypoint(
  moduleUrl: string,
  invoked: string | undefined,
): boolean {
  if (invoked === undefined) return false;
  try {
    return pathToFileURL(realpathSync(invoked)).href === moduleUrl;
  } catch {
    return false;
  }
}
