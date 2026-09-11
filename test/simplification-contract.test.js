// The v1 simplification's fixture-level proof.
//
// The compiler does not exist yet, so the handoff asks for executable
// fixture-level checks at the narrowest layer available, with any
// renderer proof reported as a blocker. This file is that check, per decision:
//
// 1. Observability: one optional `observability` block per Service, whole or
//    absent. A declared class names a scrape surface that its own Workload
//    provides, and no domain file carries monitoring policy.
// 2. Cutover: `zeroDowntime` is gone, every Workload declares `cutover`, and an
//    RWO Workload must declare `recreate` (rolling over RWO is the
//    E_CUTOVER_UNHONOURABLE case; there is no renderer yet to run it in).
// 3. Overrides: no `overrides` key anywhere, and a `replicas` block always
//    carries a count above one with a reason.
// 4. Hardening: no Workload or sidecar authors hardening at all.
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

/** A file's declared lines, with whole-line and trailing comments removed. */
const declarationsOf = (file) =>
  read(file)
    .split("\n")
    .map((l) => l.replace(/(^|\s)#.*$/, ""))
    .join("\n");

const refusals = join(examples, "refusals");
const platform = join(examples, "platform", "platform.intent.yml");

/**
 * The Services of a domain file as {id, text} slices. A Service starts at
 * `  - id:` (two spaces) and runs to the next one, so a Service's
 * `observability` block and its Workloads are read together.
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

/** The `observability` block of a Service slice, or null when it declares none. */
function observabilityOf(serviceText) {
  const lines = serviceText.split("\n");
  const start = lines.findIndex((l) => /^ {4}observability:\s*$/.test(l));
  if (start === -1) return null;
  const body = [];
  for (const line of lines.slice(start + 1)) {
    if (line.trim() === "" || line.trim().startsWith("#")) continue;
    if (!/^ {6}/.test(line)) break;
    body.push(line);
  }
  const one = (k) => body.find((l) => l.trim().startsWith(k + ":"));
  const nested = (k) => {
    const m = body.find((l) => l.trim().startsWith(k + ":"));
    return m
      ? m.split(":").slice(1).join(":").replace(/#.*$/, "").trim()
      : null;
  };
  return {
    alertClass: one("alertClass") ? nested("alertClass") : null,
    hasScrape: body.some((l) => /^ {6}scrape:\s*$/.test(l)),
    workload: nested("workload"),
    surface: nested("surface"),
    path: nested("path"),
  };
}

/** The surface names a Workload slice declares under `provides`. */
function surfacesOf(workloadText) {
  const lines = workloadText.split("\n");
  const start = lines.findIndex((l) => /^ {8}provides:\s*$/.test(l));
  if (start === -1) return [];
  const out = [];
  for (const line of lines.slice(start + 1)) {
    if (line.trim() === "" || line.trim().startsWith("#")) continue;
    const m = line.match(/^ {10}([a-zA-Z0-9-]+):\s*(\d+)/);
    if (!m) break;
    out.push(m[1]);
  }
  return out;
}

const ALERT_CLASSES = ["business-hours", "urgent", "page"];

test("the observability block is whole or absent, and never partial", () => {
  let declared = 0;
  let omitted = 0;
  for (const f of domainFiles) {
    for (const s of servicesOf(f)) {
      const o = observabilityOf(s.text);
      if (o === null) {
        assert.doesNotMatch(
          s.text,
          /^\s+alertClass:/m,
          `${s.id}: alertClass outside an observability block`,
        );
        omitted += 1;
        continue;
      }
      assert.ok(
        o.alertClass,
        `${s.id}: observability block with no alertClass`,
      );
      assert.ok(
        o.hasScrape,
        `${s.id}: class ${o.alertClass} with no scrape is E_ALERT_CLASS_WITHOUT_SIGNAL`,
      );
      assert.ok(
        ALERT_CLASSES.includes(o.alertClass),
        `${s.id}: ${o.alertClass} is not a member of AlertClass`,
      );
      declared += 1;
    }
  }
  assert.ok(declared > 0, "no Service declares observability");
  assert.ok(omitted > 0, "no Service omits it, so the opt-out is untested");
});

test("`none` is gone: an omitted block is the opt-out", () => {
  for (const f of [...domainFiles, platform]) {
    assert.doesNotMatch(
      read(f),
      /alertClass:\s*none/,
      `${f}: alertClass none is no longer a member of the vocabulary`,
    );
  }
});

test("a scrape names a surface its own Workload provides, never a port", () => {
  for (const f of domainFiles) {
    for (const s of servicesOf(f)) {
      const o = observabilityOf(s.text);
      if (o === null) continue;
      assert.ok(o.workload, `${s.id}: scrape names no workload`);
      assert.ok(o.surface, `${s.id}: scrape names no surface`);
      assert.ok(o.path, `${s.id}: scrape names no path`);
      const w = workloadsOf(f).find((x) => x.name === o.workload);
      assert.ok(
        w,
        `${s.id}: scrape names ${o.workload}, which is not a Workload`,
      );
      assert.ok(
        surfacesOf(w.text).includes(o.surface),
        `${s.id}: ${o.workload} provides no surface named ${o.surface}`,
      );
    }
  }
});

test("no Workload restates a scrape port, and no domain carries alerting policy", () => {
  for (const f of [...domainFiles, platform]) {
    const text = read(f);
    assert.doesNotMatch(
      text,
      /^\s+scrape:\s*\{?\s*port:/m,
      `${f}: a scrape restates a port that provides already declares`,
    );
    assert.doesNotMatch(text, /^\s*receivers:/m, `${f}: receivers map present`);
    assert.doesNotMatch(
      text,
      /^\s*ruleCatalog:/m,
      `${f}: rule catalog present`,
    );
  }
});

test("the monitor cadence is one estate-wide value in the Platform document", () => {
  const text = read(platform);
  assert.match(
    text,
    /^monitors:$/m,
    "platform intent declares no monitor cadence",
  );
  assert.match(text, /^\s+interval: \S+$/m, "no monitor interval");
  assert.match(text, /^\s+timeout: \S+$/m, "no monitor timeout");
  for (const f of domainFiles) {
    assert.doesNotMatch(
      read(f),
      /interval:|scrapeTimeout:/,
      `${f}: a domain file restates the cadence`,
    );
  }
});

test("a class with no signal is refused, and an unknown class is not a member", () => {
  const noSignal = join(refusals, "alert-class-without-signal.domain.yml");
  assert.match(read(noSignal), /^expect: E_ALERT_CLASS_WITHOUT_SIGNAL$/m);
  const a = observabilityOf(servicesOf(noSignal)[0].text);
  assert.ok(a && a.alertClass, "the fixture must declare a class");
  assert.ok(
    !a.hasScrape,
    "the fixture must declare no scrape — that is the refusal",
  );
  assert.ok(
    ALERT_CLASSES.includes(a.alertClass),
    "the class must be a valid member, so the missing signal is the only defect",
  );

  const unknown = join(refusals, "alert-class-unknown.domain.yml");
  assert.match(read(unknown), /^expect: schema, /m);
  const b = observabilityOf(servicesOf(unknown)[0].text);
  assert.ok(b && b.hasScrape, "the fixture must publish a signal");
  assert.ok(
    !ALERT_CLASSES.includes(b.alertClass),
    `${b.alertClass} is a valid member, so this is not the unknown-class case`,
  );
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
  // strategy. Comments may name the tokens to say who owns them.
  for (const f of [refused, accepted]) {
    assert.doesNotMatch(
      declarationsOf(f),
      /RollingUpdate|maxSurge|maxUnavailable/,
      `${f}: a Kubernetes rollout token leaked into Service Intent`,
    );
  }
});

test("no Workload or sidecar authors hardening", () => {
  const inputs = [
    ...domainFiles,
    ...[
      "alert-class-without-signal.domain.yml",
      "alert-class-unknown.domain.yml",
      "cutover-rolling-over-rwo.domain.yml",
      "cutover-recreate-over-rwo.domain.yml",
    ].map((f) => join(refusals, f)),
  ];
  for (const f of inputs) {
    const text = declarationsOf(f);
    assert.doesNotMatch(
      text,
      /^\s+hardening:/m,
      `${f}: a Workload authors hardening`,
    );
    assert.doesNotMatch(
      text,
      /^\s+exceptions:/m,
      `${f}: a hardening exception survives`,
    );
    assert.doesNotMatch(text, /^\s+- allow:/m, `${f}: an allow entry survives`);
  }
  // The posture itself is the platform's, and stays exactly one value.
  assert.match(read(platform), /^hardening: restricted$/m);
});

test("no provides port below 1024, because there is no capability to declare", () => {
  for (const f of domainFiles) {
    for (const w of workloadsOf(f)) {
      const lines = w.text.split("\n");
      const start = lines.findIndex((l) => /^ {8}provides:\s*$/.test(l));
      if (start === -1) continue;
      for (const line of lines.slice(start + 1)) {
        if (line.trim() === "" || line.trim().startsWith("#")) continue;
        const m = line.match(/^ {10}([a-zA-Z0-9-]+):\s*(\d+)/);
        if (!m) break;
        assert.ok(
          Number(m[2]) >= 1024,
          `${w.name}: ${m[1]} on ${m[2]} is E_PRIVILEGED_PORT_UNDER_NONROOT`,
        );
      }
    }
  }
});
