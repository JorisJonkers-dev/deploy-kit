// The v1 simplification's fixture-level proof.
//
// The compiler does not exist yet, so the handoff asks for executable
// fixture-level checks at the narrowest layer available, with any
// renderer proof reported as a blocker. This file is that check, per decision:
//
// 1. Observability boundary: the Intent model carries no observability policy
//    vocabulary; every non-`none` alert class maps through the runner
//    configuration to both a signal and a receiver.
// 2. Cutover: `zeroDowntime` is gone, every Workload declares `cutover`, and an
//    RWO Workload must declare `recreate` (rolling over RWO is the
//    E_CUTOVER_UNHONOURABLE case; there is no renderer yet to run it in).
// 3. Overrides: no `overrides` key anywhere, and a `replicas` block always
//    carries a count above one with a reason.
//
// spec/v1 is normative; the ADRs justify; this file proves the example estate
// against them at the fixture layer.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";
import test from "node:test";

const repo = join(import.meta.dirname, "..");
const examples = join(repo, "spec", "v1", "examples");
const read = (p) => readFileSync(p, "utf8");

const domainFiles = [
  "auth/auth.domain.yml",
  "knowledge/knowledge.domain.yml",
  "data/data.domain.yml",
  "minimal/notes.domain.yml",
].map((f) => join(examples, f));

/**
 * The workloads of a domain file as {name, text} slices. Indentation-keyed:
 * a workload starts at `      - name:` (six spaces) and runs to the next one.
 * Exposure `routes` and negative-fixture files do not reach six spaces with
 * `- name:`, but a Service's `exposure` entry is `      - name: public`, which
 * collides — so slices starting inside an `exposure:` block are skipped by
 * checking the declaration order below.
 */
const WORKLOAD_RE = /^ {6}- name: (\S+)/;

function workloadsOf(file) {
  const ls = read(file).split("\n");
  const out = [];
  let current = null;
  let inExposure = false;
  for (const line of ls) {
    if (/^ {4}[a-zA-Z]/.test(line)) inExposure = /^ {4}exposure:/.test(line);
    const m = line.match(WORKLOAD_RE);
    // A Service-level `exposure` entry sits at the same indent as a Workload
    // under `workloads:`; only slices opened while NOT in the exposure block
    // are workloads.
    if (m && !inExposure) {
      if (current) out.push(current);
      current = { name: m[1], text: "" };
    } else if (current) {
      current.text += line + "\n";
    }
  }
  if (current) out.push(current);
  return out;
}

test("every worked Workload declares cutover, and zeroDowntime is gone", () => {
  for (const f of domainFiles) {
    const wls = workloadsOf(f);
    assert.ok(wls.length > 0, `${f}: no workloads parsed`);
    for (const w of wls) {
      const rel = `${f.split("/").pop()}#${w.name}`;
      assert.match(
        w.text,
        /^\s+cutover: (rolling|recreate)$/m,
        `${rel}: no cutover declaration`,
      );
      assert.doesNotMatch(
        w.text,
        /zeroDowntime/,
        `${rel}: zeroDowntime present`,
      );
    }
  }
});

test("RWO Workloads declare recreate; volume-free Workloads declare rolling", () => {
  for (const f of domainFiles) {
    for (const w of workloadsOf(f)) {
      const hasVolume = /^\s+volumes:$/m.test(w.text);
      const cutover = w.text.match(/^\s+cutover: (rolling|recreate)$/m)?.[1];
      assert.ok(cutover, `${w.name}: cutover missing`);
      if (hasVolume) {
        assert.equal(
          cutover,
          "recreate",
          `${w.name}: an RWO volume cannot surge, so rolling is E_CUTOVER_UNHONOURABLE`,
        );
      }
    }
  }
});

test("no domain file carries overrides, and replicas is the sole capacity exception", () => {
  for (const middle of domainFiles) {
    const text = read(middle);
    assert.doesNotMatch(
      text,
      /^overrides:/m,
      `${middle}: overrides key present`,
    );
    assert.doesNotMatch(
      text,
      /derivation:/,
      `${middle}: override entry syntax present`,
    );
    for (const w of workloadsOf(middle)) {
      const rep = w.text.match(
        /^\s+replicas:\s*$\n\s+count: (\d+)(?:\n\s+reason: (.+))?/m,
      );
      if (!rep) continue;
      const count = Number(rep[1]);
      assert.ok(count > 1, `${w.name}: count must exceed one`);
      assert.ok(
        rep[2] && rep[2].trim().length > 0,
        `${w.name}: reason required with replicas`,
      );
    }
  }
});

test("the runner config maps every non-none class to a receiver", () => {
  const cfg = read(join(examples, "observability", "runner.config.yml"));
  const table = {
    none: null,
    "business-hours": "discord-daytime",
    urgent: "discord-oncall",
    page: "pushover-page",
  };
  for (const receiver of Object.values(table).filter(Boolean)) {
    assert.ok(
      cfg.includes(receiver),
      `runner config does not know receiver ${receiver}`,
    );
  }
  for (const f of domainFiles) {
    const text = read(f);
    const classes = [...text.matchAll(/^\s+alertClass: (\S+)/gm)].map(
      (m) => m[1],
    );
    assert.ok(classes.length > 0, `${f}: no alertClass`);
    for (const c of classes) {
      assert.ok(
        c in table,
        `${f}: alertClass ${c} is not in the runner's table`,
      );
      if (c === "none") continue;
      // The signal may be block-style (`scrape:` then port/path) or flow-style
      // (`scrape: {port: …, path: …}`) — either publishes a scrape surface.
      assert.match(
        text,
        /^\s+scrape:\s*(\{|$)/m,
        `${f}: class ${c} above none has no scrape signal in its domain`,
      );
    }
  }
});

test("Intent carries no observability policy vocabulary", () => {
  const intentFiles = [
    join(examples, "platform", "platform.intent.yml"),
    ...domainFiles,
  ];
  for (const f of intentFiles) {
    const text = read(f);
    assert.doesNotMatch(text, /^\s*receivers:/m, `${f}: receivers map present`);
    assert.doesNotMatch(
      text,
      /^\s*ruleCatalog:/m,
      `${f}: rule catalog present`,
    );
    assert.doesNotMatch(text, /scrapeTimeout:/, `${f}: scrape cadence present`);
  }
});
