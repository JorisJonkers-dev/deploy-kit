import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { renderIntentSet, serialize, sha256Hasher } from "./src/index.ts";
const root = process.argv[2] as string;
const projects = (process.argv[3] as string).split(",");
const walk = (d: string): string[] => readdirSync(d).flatMap((e) => { const p = join(d, e); return statSync(p).isDirectory() ? walk(p) : [p]; });
const files = walk(root)
  .filter((p) => !p.includes("/projects/") && !p.includes("/docs/") && !p.includes("/bootstrap/") && !p.endsWith(".md") && !p.includes("/.github/"))
  .map((p) => ({ name: relative(root, p), text: readFileSync(p, "utf8") }))
  .map((f) => f.name === "platform.intent.yml"
    ? { ...f, text: f.text.replace(/\n  legacy:\n(?:    - .*\n)+/, "\n  legacy: [knowledge]\n").replace(/\n  serving:\n(?:(?: {4}.*| {6}.*)\n)+/, "\n").replace("\n  estate:\n", `\n  estate:\n${projects.map((p) => `    - ${p}\n`).join("")}`) }
    : f);
const r = renderIntentSet(files, { hash: sha256Hasher, serialize, schemaPackageIntegrity: `sha256:${"0".repeat(64)}`, projects });
if (!r.ok) { for (const d of r.diagnostics) console.log(d.code, d.document, d.path, "|", d.message.slice(0, 160)); process.exit(1); }
for (const a of r.value) console.log(a.name, a.files.length);
