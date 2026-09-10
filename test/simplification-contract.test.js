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

const refusals = join(examples, "refusals");

/**
 * The Services of a domain file as {id, text} slices. A Service starts at
 * `  - id:` (two spaces) and runs to the next one, so a Service's `alertClass`
 * and its Workloads' `scrape` surfaces are read together — the guarantee is
 * per Service, not per file.
 */
function servicesOf(file) {
  const out = [];
  let current = null;
  for (const line of read(file).split("\n")) {
    const m = line.match(/^ {2}- id: (\S+)/);
    if (m) {
      if (current) out.push(current);
      current = { id: m[1], text: "" };
    } else if (current) {
      current.text += line + "\n";
    }
  }
  if (current) out.push(current);
  return out;
}

/**
 * The observability runner's configuration, read from the file rather than
 * restated here. Only the three blocks this proof needs are parsed: the
 * estate cadence, the class-to-receiver table, and the rule catalog's keys.
 * A `null` receiver is the honest opt-out and stays distinguishable from an
 * absent key.
 */
function runnerConfig(file) {
  const lines = read(file).split("\n");
  const block = (name) => {
    const start = lines.findIndex((l) => l === `${name}:`);
    if (start === -1) return [];
    const out = [];
    for (const line of lines.slice(start + 1)) {
      if (/^\S/.test(line)) break;
      if (line.trim() === "" || line.trim().startsWith("#")) continue;
      out.push(line);
    }
    return out;
  };
  const pairs = (name) =>
    Object.fromEntries(
      block(name)
        .map((l) => l.match(/^\s+([a-zA-Z0-9-]+):\s*(.*)$/))
        .filter(Boolean)
        .map((m) => [m[1], m[2] === "null" || m[2] === "" ? null : m[2]]),
    );
  return {
    scrape: pairs("scrape"),
    receivers: pairs("receivers"),
    ruleCatalog: pairs("ruleCatalog"),
  };
}

const estateRunner = runnerConfig(
  join(examples, "observability", "runner.config.yml"),
);

// The runner emits an active monitor only if it has a cadence to give it and a
// baseline rule set to attach; both are configuration, and both are read here.
const runnerMonitorsAnySignal = () =>
  Boolean(estateRunner.scrape.interval) &&
  Boolean(estateRunner.scrape.scrapeTimeout) &&
  Boolean(estateRunner.ruleCatalog.baseline);

const hasScrapeSignal = (text) => /^\s+scrape:\s*(\{|$)/m.test(text);

/** A file's declared lines, with whole-line and trailing comments removed. */
const declarationsOf = (file) =>
  read(file)
    .split("\n")
    .map((l) => l.replace(/(^|\s)#.*$/, ""))
    .join("\n");

test("the runner configuration is what carries the receiver table", () => {
  assert.ok(
    Object.keys(estateRunner.receivers).length > 1,
    "no receiver table parsed from the runner configuration",
  );
  assert.equal(
    estateRunner.receivers.none,
    null,
    "`none` must stay the one class with no receiver",
  );
  assert.ok(
    runnerMonitorsAnySignal(),
    "the runner has no cadence or no baseline rules, so it emits no active monitor",
  );
});

test("every Service above none has its own signal, monitor and receiver", () => {
  let proven = 0;
  for (const f of domainFiles) {
    for (const s of servicesOf(f)) {
      const cls = s.text.match(/^\s+alertClass: (\S+)/m)?.[1];
      assert.ok(cls, `${f}: Service ${s.id} declares no alertClass`);
      assert.ok(
        cls in estateRunner.receivers,
        `${s.id}: alertClass ${cls} is not a key in the runner's table`,
      );
      if (cls === "none") continue;
      assert.ok(
        hasScrapeSignal(s.text),
        `${s.id}: class ${cls} above none publishes no signal of its own`,
      );
      assert.ok(
        runnerMonitorsAnySignal(),
        `${s.id}: the runner cannot turn that signal into an active monitor`,
      );
      assert.ok(
        estateRunner.receivers[cls],
        `${s.id}: class ${cls} reaches no receiver`,
      );
      proven += 1;
    }
  }
  assert.ok(proven > 0, "no Service above none in the worked estate");
});

test("a class above none with no signal is refused", () => {
  const f = join(refusals, "alert-class-without-signal.domain.yml");
  const text = read(f);
  assert.match(text, /^expect: E_ALERT_CLASS_WITHOUT_SIGNAL$/m);
  const [service] = servicesOf(f);
  const cls = service.text.match(/^\s+alertClass: (\S+)/m)?.[1];
  assert.notEqual(cls, "none", "the fixture must declare a class above none");
  assert.ok(
    cls in estateRunner.receivers && estateRunner.receivers[cls],
    "the class must be routable, so the missing signal is the only defect",
  );
  assert.ok(
    !hasScrapeSignal(service.text),
    "the fixture must publish no signal — that absence is the refusal",
  );
});

test("a class outside the vocabulary is not a routable key", () => {
  const f = join(refusals, "alert-class-unknown.domain.yml");
  const text = read(f);
  assert.match(text, /^expect: schema — /m);
  const [service] = servicesOf(f);
  const cls = service.text.match(/^\s+alertClass: (\S+)/m)?.[1];
  assert.ok(
    !(cls in estateRunner.receivers),
    `${cls} is in the runner's table, so it is not the unknown-class case`,
  );
  assert.ok(
    hasScrapeSignal(service.text),
    "the fixture must publish a signal, so the class is the only defect",
  );
});

test("the runner cannot route a class its table drops", () => {
  const broken = runnerConfig(join(refusals, "unroutable-runner.config.yml"));
  const declared = new Set();
  for (const f of domainFiles) {
    for (const s of servicesOf(f)) {
      const cls = s.text.match(/^\s+alertClass: (\S+)/m)?.[1];
      if (cls && cls !== "none") declared.add(cls);
    }
  }
  const unroutable = [...declared].filter((c) => !broken.receivers[c]);
  assert.ok(
    unroutable.length > 0,
    "the fixture routes every class the estate declares, so it proves no refusal",
  );
  for (const c of unroutable) {
    assert.ok(
      estateRunner.receivers[c],
      `${c} is unroutable in the estate configuration too — the fixture is not isolating the defect`,
    );
  }
});

test("rolling over RWO is refused and recreate over RWO is accepted", () => {
  const refused = join(refusals, "cutover-rolling-over-rwo.domain.yml");
  const accepted = join(refusals, "cutover-recreate-over-rwo.domain.yml");
  assert.match(read(refused), /^expect: E_CUTOVER_UNHONOURABLE$/m);
  assert.match(read(accepted), /^expect: accepted$/m);

  const only = (f) => {
    const ws = workloadsOf(f);
    assert.equal(ws.length, 1, `${f}: a refusal fixture carries one Workload`);
    return ws[0];
  };
  const bad = only(refused);
  const good = only(accepted);

  for (const w of [bad, good]) {
    assert.match(
      w.text,
      /^\s+volumes:$/m,
      `${w.name}: the pair must both hold an RWO volume`,
    );
  }
  assert.match(bad.text, /^\s+cutover: rolling$/m);
  assert.match(good.text, /^\s+cutover: recreate$/m);

  // The refusal is the model's, not Kubernetes'. No Kubernetes rollout token
  // may appear as a declared value in either file: the adapter derives the
  // strategy. Comments may name the tokens to say who owns them, so the check
  // runs over the declarations rather than the prose.
  for (const f of [refused, accepted]) {
    assert.doesNotMatch(
      declarationsOf(f),
      /RollingUpdate|maxSurge|maxUnavailable/,
      `${f}: a Kubernetes rollout token leaked into Service Intent`,
    );
  }
});

test("Intent carries no observability policy vocabulary", () => {
  const intentFiles = [
    join(examples, "platform", "platform.intent.yml"),
    ...domainFiles,
    join(refusals, "alert-class-without-signal.domain.yml"),
    join(refusals, "alert-class-unknown.domain.yml"),
    join(refusals, "cutover-rolling-over-rwo.domain.yml"),
    join(refusals, "cutover-recreate-over-rwo.domain.yml"),
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
