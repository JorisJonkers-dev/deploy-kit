// The helpers every gate shares.
import { realpathSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { isEntrypoint } from "../scripts/lib/entrypoint.ts";
import { slug } from "../scripts/lib/markdown.ts";
import { processOutput } from "../scripts/lib/output.ts";
import { temporary } from "./setup.ts";

/** A script on disk, and the URL Node would give its module. */
function script(name = "gate.ts"): { path: string; url: string } {
  const path = join(temporary(), name);
  writeFileSync(path, "");
  return { path, url: pathToFileURL(realpathSync(path)).href };
}

describe("isEntrypoint", () => {
  it("is true for the module Node was started with", () => {
    const { path, url } = script();
    expect(isEntrypoint(url, path)).toBe(true);
  });

  it("follows a symlink to the module it points at", () => {
    const { path, url } = script();
    const link = join(temporary(), "link.ts");
    symlinkSync(path, link);
    expect(isEntrypoint(url, link)).toBe(true);
  });

  it("is false for a module Node was not started with", () => {
    const { url } = script();
    expect(isEntrypoint(url, script("other.ts").path)).toBe(false);
  });

  it("is false when Node was started with no script", () => {
    expect(isEntrypoint(script().url, undefined)).toBe(false);
  });

  it("is false when the script path does not exist", () => {
    expect(isEntrypoint(script().url, join(temporary(), "gone.ts"))).toBe(
      false,
    );
  });
});

describe("slug", () => {
  it("makes the anchor GitHub makes for a heading", () => {
    expect(slug("The closed vocabularies")).toBe("the-closed-vocabularies");
    expect(slug("Layer 2: derivation & assignment")).toBe(
      "layer-2-derivation--assignment",
    );
    expect(slug("  Padded heading  ")).toBe("padded-heading");
    expect(slug("kebab-case_and_snake")).toBe("kebab-case_and_snake");
  });
});

describe("processOutput", () => {
  it("writes results to stdout and failures to stderr", () => {
    const out = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    const err = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    processOutput.out("a result\n");
    processOutput.err("a failure\n");
    expect(out).toHaveBeenCalledWith("a result\n");
    expect(err).toHaveBeenCalledWith("a failure\n");
  });
});
