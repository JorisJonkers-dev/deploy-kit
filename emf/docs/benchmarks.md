# Benchmarks

How long each stage of the model-driven pipeline takes, how that grows with
the number of Projects, and how the QVT-Operational lowering compares with an
ATL port of it on the same inputs
([JorisJonkers-dev/deploy-kit#809](https://github.com/JorisJonkers-dev/deploy-kit/issues/809)).
The numbers are evidence, not a gate: nothing in the default build reads them.

## What was asked, and what is measured

The Task 2 report preferred QVT-Operational to ATL
([`02-alternatives.tex`](../../docs/mde/task-2-transformations/Sections/02-alternatives.tex),
section "The Transformation Language") for two reasons, and neither is a
claim about speed:

- the resolution reads its own output in the same operation: the
  `Revision` hashes the completed `Application`, and ATL's target models are
  write-only;
- explicit mapping calls make the construction order visible, which the
  resolution needs.

The grader asked for those execution arguments to be backed by measurement.
What can be measured is time, so this document measures two things:

1. every stage of the pipeline as it ships, so the share of time each
   transformation takes is known;
2. one transformation written in both languages and held equal: the
   **lowering**, `lower.qvto` (474 lines, 54 mappings), ported to ATL on
   EMFTVM. The resolution (`resolution.qvto`, 4,212 lines) is where the
   report's two reasons apply, and it was not ported; see
   [What the numbers do not support](#what-the-numbers-do-not-support).

## Method

- **Harness.** JUnit suites in the `cli` bundle's tests, skipped unless
  `emf.benchmark=true`:
  [`PipelineBenchmarkTest`](../bundles/cli/src/test/java/dev/jorisjonkers/deploykit/emf/cli/PipelineBenchmarkTest.java),
  [`LoweringBenchmarkTest`](../bundles/cli/src/test/java/dev/jorisjonkers/deploykit/emf/cli/LoweringBenchmarkTest.java)
  and
  [`LoweringEquivalenceTest`](../bundles/cli/src/test/java/dev/jorisjonkers/deploykit/emf/cli/LoweringEquivalenceTest.java).
  The `benchmark` profile in [`pom.xml`](../pom.xml) sets that property, runs
  only those suites, and turns off what would distort a timing: JaCoCo's agent
  and the JVM's assertions. No gate runs. To reproduce, from `emf/`:

  ```sh
  ./mvnw -B verify -Pbenchmark
  ```

  The tables land in `bundles/cli/target/benchmark/*.md`. The counts are
  system properties: `-Demf.benchmark.warmup=5 -Demf.benchmark.runs=10
  -Demf.benchmark.forks=5` are the defaults this document used.
- **A warm series** runs its task 5 times unmeasured, collects the garbage,
  then times 10 runs one by one with `System.nanoTime()`. A cell reads
  `median [p25–p75]` in milliseconds: the median, and the interquartile range
  as the spread. The lowerings take well under a millisecond each, so before
  any lowering series both engines first run 40 times over every Project.
- **A cold sample** is one run in a JVM started for it alone
  ([`ColdRun`](../bundles/cli/src/test/java/dev/jorisjonkers/deploykit/emf/cli/ColdRun.java)),
  with the JVM's defaults: class loading, transformation compilation and
  interpretation before the JIT are all inside the timing. Five JVMs per
  series; the cell is the same `median [p25–p75]` over the five.
- **Stages.** Each stage is timed on the output of the stage before it, built
  once outside the timing:
  - *read*: every document of the union parsed by its Xtext language and
    linked (`Pipeline.read`);
  - *check*: the documents read again, checked against the OCL constraints,
    the names and the pinned inputs, and joined to their env files
    (`Pipeline.authored`, what the pipeline does before lowering);
  - *lower*: every Project of the union lowered by `Lowering.lower`, as
    shipped. When the tables of the next two sections were measured it loaded
    `lower.qvto` on each call; it now loads it once per JVM, and
    [Loading each transformation once](#loading-each-transformation-once)
    measures the change;
  - *resolve*: one Project resolved against the union by `resolution.qvto`
    **loaded once and reused**, as `Resolution.resolve` now loads it. The load
    is timed apart ([Loading](#loading-a-transformation)). When these tables
    were measured, `Resolution.resolve` loaded it on every call and every load
    stayed reachable for the life of the JVM, so a series of hundreds of
    shipped calls exhausted a 16 GiB heap. The suite checks, per example, that
    the reused resolution writes what the shipped one writes;
  - *render*: the Resolved Deployments rendered to files by
    `Rendering.render`, which parses the Acceleo templates on every call, as
    shipped.
- **Inputs.** The 16 worked examples this implementation resolves
  (`Outputs.RESOLVED`), each read with the union it names, and the real
  estate's union of 24 Projects under `spec/v1/examples/estate/`. For scaling,
  the estate is cut to its first *n* Projects in a fixed order: the first 12
  are the smallest union the checks accept (the Platform document names an
  Application of each, or another of the twelve depends on one), and every
  prefix from 12 to 24 is accepted. A prefix of 1, 4 or 8 is read and lowered
  but never checked or resolved.
- **The lowering head to head** runs on the 36 Project files the resolved
  examples read (the 12 worked ones and the estate's 24), each lowered with
  its env files attached, as the pipeline lowers it. `knowledge` is left out:
  no union resolves it, because no lock holds its images. "Loaded once" is a
  QVTo `TransformationExecutor` loaded once and an EMFTVM `ExecEnvPool` whose
  module was compiled once; "per call" is `lower.qvto` loaded for each
  Project, and the ATL source compiled for each Project.

## The machine

| | |
|---|---|
| CPU | Apple M4 Max, 16 cores (12 performance, 4 efficiency) |
| memory | 64 GiB |
| OS | macOS 27.0.1, arm64 |
| JVM | Amazon Corretto 21.0.10 (OpenJDK 64-Bit Server VM 21.0.10+7-LTS), G1, the default maximum heap of 16 GiB, no JVM arguments |
| build | Maven 3.9 wrapper, Tycho 5.0.4, `emf.target` (Eclipse 2026-06): QVTo 3.11, Acceleo 4.2, Xtext 2.43, ATL/EMFTVM 4.12.0 |

A developer laptop on mains power, with the usual background processes
running, among them an endpoint antivirus that scans every file written: the
spread columns show how much that cost. Absolute numbers will
differ on another machine; the ratios and the shapes are what to read.

## The pipeline, per worked example

Warm, in milliseconds, `median [p25–p75]` of 10 runs. *lower* is every
Project of the union, as shipped; *resolve* and *render* are the example's
own Project.

| example | documents | Projects | read ms | check ms | lower ms (all Projects) | resolve ms (one Project, loaded once) | render ms (one Project) |
|---|---|---|---|---|---|---|---|
| agents | 13 | 9 | 42.7 [41.2–43.9] | 410 [405–413] | 67.8 [67.1–68.5] | 7.95 [7.81–8.16] | 54.7 [53.9–56.2] |
| auth | 15 | 10 | 48.2 [47.7–50.8] | 443 [436–452] | 76.3 [75.0–78.2] | 8.40 [7.95–8.72] | 42.6 [41.9–42.8] |
| data | 13 | 9 | 42.6 [41.7–43.3] | 424 [414–430] | 74.2 [73.4–75.0] | 11.1 [11.0–11.3] | 89.2 [85.4–96.5] |
| delivery | 13 | 9 | 42.7 [42.4–43.1] | 413 [408–418] | 69.6 [68.6–71.3] | 6.09 [5.99–6.16] | 47.2 [44.2–58.7] |
| edge | 13 | 9 | 42.6 [41.4–43.8] | 446 [439–454] | 70.3 [68.8–71.2] | 5.40 [5.36–5.59] | 44.3 [43.1–47.8] |
| estate/hindsight | 28 | 24 | 54.7 [54.5–55.5] | 1060 [1043–1091] | 200 [198–205] | 22.6 [22.4–23.1] | 470 [377–590] |
| estate/immich | 28 | 24 | 54.1 [53.0–56.0] | 1038 [1037–1045] | 183 [179–189] | 14.7 [14.5–14.8] | 495 [301–686] |
| estate/observability | 28 | 24 | 52.5 [51.8–54.4] | 1008 [1005–1016] | 189 [188–192] | 248 [247–249] | 227 [223–241] |
| identity | 13 | 9 | 43.9 [43.4–44.5] | 416 [413–427] | 71.4 [70.9–72.2] | 7.04 [6.85–7.13] | 57.1 [51.7–64.1] |
| knowledge-platform | 14 | 10 | 44.4 [43.7–45.2] | 490 [475–502] | 78.8 [78.7–79.1] | 15.1 [14.9–15.3] | 82.9 [75.8–87.1] |
| mail | 13 | 9 | 43.5 [42.8–43.7] | 418 [416–424] | 71.8 [70.9–74.7] | 3.28 [3.10–3.48] | 29.9 [28.6–33.1] |
| minimal | 14 | 10 | 43.8 [43.1–45.0] | 448 [445–449] | 78.4 [77.3–79.3] | 3.32 [3.22–3.43] | 31.7 [30.6–37.8] |
| node | 13 | 9 | 43.0 [42.8–43.8] | 429 [422–434] | 71.9 [70.7–72.5] | 1.60 [1.55–1.77] | 37.5 [36.3–38.1] |
| observability | 14 | 10 | 43.1 [42.6–43.3] | 463 [455–474] | 78.5 [77.6–80.6] | 15.6 [15.3–15.8] | 91.8 [88.2–94.2] |
| secrets | 13 | 9 | 41.6 [41.0–41.7] | 421 [416–422] | 70.9 [69.9–72.6] | 3.74 [3.64–3.99] | 40.3 [39.1–44.5] |
| utility | 13 | 9 | 42.6 [41.9–43.5] | 426 [421–432] | 70.3 [69.3–71.0] | 4.57 [4.50–4.88] | 40.8 [37.0–50.0] |

`check` dominates every example: parsing again, the Complete OCL
constraints, the cross-file names and the pinned inputs take 55–63% of a
warm run, counting the resolution's load as shipped. The lowering of a whole
union (9 to 24 Projects) takes 68–200 ms,
and almost all of it is loading `lower.qvto` again for every Project (next
table). The resolution's execution is 2–23 ms for every example but
`estate/observability`, whose metrics stack scrapes every Process of the
estate. *render* is the noisiest column: it writes a few dozen files a run,
and this laptop's endpoint antivirus scans each one (see
[The machine](#the-machine)), so its spread is wide and its value moved by up
to an order of magnitude between runs.

### Loading a transformation

Warm, parse and compile only, as `Lowering.lower` and `Resolution.resolve`
each did on every call when these tables were measured, and now do once per
JVM.

| transformation | lines | load ms (parse, compile) |
|---|---|---|
| lower.qvto | 473 | 15.1 [14.1–15.5] |
| resolution.qvto | 4212 | 109 [108–111] |

So loading on every call cost a resolution about 110 ms on top of the
execution above, and a lowering about 15 ms on top of well under a
millisecond of execution. Every load of `resolution.qvto` also stays
reachable for the life of the JVM, about 8 MiB each; one reused executor does
not grow. `lower.qvto`, which imports no blackbox, does not keep its loads.
Both now load once per JVM:
[Loading each transformation once](#loading-each-transformation-once).

## The pipeline over the estate, growing

Warm, milliseconds. The estate's Platform document and pinned inputs, plus
its first *n* Projects. Below 12 the checks refuse the union, so only *read*
and *lower* run. *resolve* and *render* here cover **every** Project of the
union: what `Pipeline.render` does for the whole estate.

| Projects | documents | read ms | check ms | lower ms (all Projects) | resolve ms (every Project, loaded once) | render ms (every Project) |
|---|---|---|---|---|---|---|
| 1 | 5 | 40.1 [38.7–41.9] | – | 9.90 [9.62–10.2] | – | – |
| 4 | 8 | 46.2 [45.6–46.7] | – | 38.9 [37.2–40.7] | – | – |
| 8 | 12 | 48.4 [47.4–49.5] | – | 71.6 [66.2–73.4] | – | – |
| 12 | 16 | 47.4 [46.8–49.6] | 583 [572–589] | 96.9 [93.6–97.9] | 314 [312–317] | 940 [815–1475] |
| 16 | 20 | 53.0 [49.5–54.2] | 737 [733–740] | 132 [131–134] | 360 [359–361] | 893 [843–947] |
| 20 | 24 | 54.9 [54.3–55.9] | 822 [805–842] | 162 [161–163] | 438 [436–439] | 750 [710–856] |
| 24 | 28 | 54.6 [52.7–57.2] | 1038 [1031–1049] | 191 [189–191] | 521 [520–524] | 1182 [1092–1275] |

Every stage but *render* grows roughly linearly with the union between 12
and 24 Projects: doubling the Projects multiplies *check* by about 1.8,
*lower* by 2.0 and *resolve* (every Project) by 1.7. *read* is nearly flat:
one Xtext setup per language dominates it, not the documents. Resolving one
Project does not get dearer as the union grows (about 22 ms a Project at 24
against 26 ms at 12), even though each resolution reads the whole union.
*render* stays between 0.75 and 1.2 s with no clear trend; its file writes
are what the antivirus scans, so it is not to be read finely.

### Cold

One fresh JVM per sample, five samples, every stage once in pipeline order,
with the shipped `Lowering.lower` and `Resolution.resolve`.

| example | read ms | check ms | lower ms | resolve ms | render ms |
|---|---|---|---|---|---|
| minimal | 951 [939–958] | 1703 [1660–1703] | 510 [502–545] | 356 [334–366] | 233 [225–246] |
| estate/hindsight | 906 [898–919] | 2030 [2026–2238] | 593 [581–621] | 349 [340–364] | 255 [246–257] |

A cold run of `minimal` takes about 3.8 s, of which 2.7 s are *read* and
*check*: class loading and the first Xtext and OCL setups. The transformations
together (lower, resolve, render) are about 1.1 s cold.

## Loading each transformation once

`Lowering.lower` and `Resolution.resolve` now load their transformation once
per JVM and reuse it, each call with an execution context and model extents
of its own
([JorisJonkers-dev/deploy-kit#826](https://github.com/JorisJonkers-dev/deploy-kit/issues/826)).
Every stage golden, rendered tree and oracle comparison is unchanged. Both
measures come from `-Pbenchmark` runs on one machine in one session, first
on `main`, then on the change:

| measure | before | after |
|---|---|---|
| lowering, the estate's 24 Projects, as shipped (ms) | 174 [172–177] | 7.82 [7.63–7.99] |
| lowering, per Project, as shipped (ms) | 7.25 | 0.33 |
| lowering, a worked example's union (9 to 24 Projects), as shipped (ms) | 64.7–179 | 3.17–13.7 |
| heap kept per shipped resolution, over 40 in one JVM (MiB) | 8.24 | 0.00 |

The lowering rows are the *lower* column of the two pipeline suites: warm,
`median [p25–p75]` of 10 runs, the per-Project row being the 24-Project
median divided by 24. The heap row is `PipelineBenchmarkTest`'s series of 40
shipped resolutions of `minimal`'s `notes`, the heap still in use after full
collections read before and after it and the difference divided by 40.
Lowering now costs about what its execution costs
([Execution, growing](#execution-growing): 7.62 ms loaded once).

The columns the change does not touch moved between the two runs too: *read*
was up to a quarter faster after, and *resolve* and *render* of the largest
examples up to a third slower (`estate/observability` resolved in 232 ms
before and 310 ms after, with the resolution loaded once in both). The cause
was not isolated. The suite's JVM held about 14 GiB still reachable in both
runs, close to its 16 GiB maximum, and this laptop's run-to-run noise is wide
([The machine](#the-machine)). So those columns are not re-tabulated here.

## QVTo against ATL

### Equivalence

[`LoweringEquivalenceTest`](../bundles/cli/src/test/java/dev/jorisjonkers/deploykit/emf/cli/LoweringEquivalenceTest.java)
lowers each of the 36 Projects with the shipped QVTo lowering and with the
ATL port, and compares the two Effective Intents with
[`ModelDiff`](../bundles/cli/src/test/java/dev/jorisjonkers/deploykit/emf/cli/ModelDiff.java),
EMF Compare under the tests' natural keys
([0152](adr/emf/0152-emf-compare-decides-and-explains-every-model-comparison.md)).
It also holds the loaded-once QVTo lowering equal to the shipped one, and each
source unchanged by both.

**Result: no difference on any of the 36 Projects (2,564 input objects).**
ModelDiff tells a set unsettable feature from an unset one, so "equal" covers
what an author did not write too: the port's first runs differed exactly
there, and the [hard parts](#what-atl-made-hard) below are what closed them.

Equivalence covers only the rules the inputs reach: 51 of the port's 54.
`NoMigration`, `NoProbes` and `DatabaseGrantCopy` match no object in any
example, so for those three the port is unproven. The port copies
exactly what `lower.qvto` copies, including what it leaves out: neither copies
`Generate.adopt`.

### Execution, per Project

Warm, transformation loaded once, milliseconds.

<details>
<summary>All 36 Projects</summary>

| Project | objects | QVTo ms | ATL ms | ATL / QVTo |
|---|---|---|---|---|
| delivery/delivery.project.yml | 53 | 0.39 [0.38–0.40] | 0.39 [0.37–0.43] | 1.00× |
| edge/edge.project.yml | 31 | 0.21 [0.21–0.22] | 0.22 [0.22–0.23] | 1.07× |
| observability/observability.project.yml | 137 | 0.99 [0.94–1.00] | 1.00 [1.00–1.04] | 1.01× |
| secrets/secrets.project.yml | 27 | 0.21 [0.21–0.23] | 0.20 [0.19–0.22] | 0.98× |
| identity/identity.project.yml | 30 | 0.23 [0.23–0.27] | 0.28 [0.28–0.30] | 1.24× |
| mail/mail.project.yml | 19 | 0.14 [0.14–0.16] | 0.17 [0.17–0.19] | 1.17× |
| utility/utility.project.yml | 26 | 0.20 [0.20–0.21] | 0.23 [0.22–0.23] | 1.13× |
| agents/agents.project.yml | 107 | 0.57 [0.56–0.60] | 0.57 [0.55–0.61] | 1.01× |
| data/data.project.yml | 92 | 0.60 [0.56–0.61] | 0.62 [0.61–0.64] | 1.04× |
| auth/auth.project.yml | 77 | 0.33 [0.33–0.34] | 0.40 [0.37–0.41] | 1.21× |
| estate/arr/arr.project.yml | 43 | 0.32 [0.31–0.34] | 0.30 [0.30–0.32] | 0.94× |
| estate/auth/auth.project.yml | 149 | 0.50 [0.49–0.51] | 0.64 [0.62–0.65] | 1.28× |
| estate/data/data.project.yml | 59 | 0.35 [0.34–0.36] | 0.34 [0.34–0.35] | 0.98× |
| estate/delivery/delivery.project.yml | 95 | 0.54 [0.53–0.56] | 0.51 [0.50–0.53] | 0.95× |
| estate/edge/edge.project.yml | 21 | 0.19 [0.17–0.23] | 0.18 [0.17–0.20] | 0.99× |
| estate/estate-dashboard/estate-dashboard.project.yml | 62 | 0.27 [0.26–0.29] | 0.30 [0.29–0.33] | 1.11× |
| estate/findability-explorer/findability-explorer.project.yml | 56 | 0.26 [0.26–0.28] | 0.32 [0.31–0.33] | 1.20× |
| estate/grimoire/grimoire.project.yml | 70 | 0.31 [0.30–0.33] | 0.35 [0.34–0.36] | 1.13× |
| estate/hindsight/hindsight.project.yml | 163 | 0.82 [0.81–0.83] | 1.05 [1.01–1.15] | 1.28× |
| estate/home-portal/home-portal.project.yml | 11 | 0.11 [0.11–0.12] | 0.12 [0.11–0.14] | 1.06× |
| estate/immich/immich.project.yml | 74 | 0.35 [0.34–0.36] | 0.46 [0.43–0.47] | 1.33× |
| estate/jellyfin/jellyfin.project.yml | 18 | 0.14 [0.13–0.15] | 0.14 [0.13–0.15] | 1.01× |
| estate/jellyseerr/jellyseerr.project.yml | 17 | 0.11 [0.11–0.12] | 0.16 [0.16–0.18] | 1.46× |
| estate/karakeep/karakeep.project.yml | 97 | 0.48 [0.47–0.50] | 0.53 [0.51–0.56] | 1.11× |
| estate/mail/mail.project.yml | 71 | 0.34 [0.31–0.40] | 0.37 [0.36–0.41] | 1.09× |
| estate/n8n/n8n.project.yml | 75 | 0.26 [0.25–0.27] | 0.32 [0.31–0.35] | 1.26× |
| estate/observability/observability.project.yml | 264 | 1.33 [1.32–1.39] | 1.48 [1.46–1.50] | 1.12× |
| estate/outline/outline.project.yml | 104 | 0.36 [0.34–0.46] | 0.41 [0.40–0.45] | 1.15× |
| estate/overleaf/overleaf.project.yml | 103 | 0.36 [0.36–0.38] | 0.43 [0.42–0.43] | 1.18× |
| estate/prowlarr/prowlarr.project.yml | 18 | 0.14 [0.14–0.17] | 0.17 [0.17–0.18] | 1.18× |
| estate/qbittorrent/qbittorrent.project.yml | 16 | 0.12 [0.12–0.14] | 0.13 [0.13–0.14] | 1.06× |
| estate/secrets/secrets.project.yml | 8 | 0.08 [0.07–0.08] | 0.09 [0.09–0.11] | 1.25× |
| estate/tribelt/tribelt.project.yml | 62 | 0.28 [0.28–0.30] | 0.33 [0.33–0.35] | 1.18× |
| estate/utility/utility.project.yml | 47 | 0.28 [0.27–0.29] | 0.30 [0.27–0.34] | 1.07× |
| knowledge-platform/knowledge-platform.project.yml | 243 | 0.96 [0.95–0.97] | 1.14 [1.10–1.25] | 1.19× |
| minimal/notes.project.yml | 19 | 0.14 [0.13–0.18] | 0.15 [0.14–0.17] | 1.05× |
| **sum of medians** |  | 13.3 | 14.8 | 1.12× |

</details>

ATL takes 0.94× to 1.46× QVTo's time per Project (median 1.12×), and
1.12× over all 36 together (14.8 ms against 13.3 ms).

### Execution, growing

The estate's first *n* Projects, all lowered, milliseconds. Left: each
transformation loaded once (QVTo `TransformationExecutor`, EMFTVM
`ExecEnvPool`). Right: `lower.qvto` loaded for every Project, which is how
`Lowering.lower` shipped when this was measured, against the ATL source
compiled for every Project.

| Projects | objects | QVTo ms (loaded once) | ATL ms (compiled once) | ATL / QVTo | QVTo ms (loaded per Project) | ATL ms (compiled per Project) | ATL / QVTo |
|---|---|---|---|---|---|---|---|
| 1 | 43 | 0.28 [0.27–0.29] | 0.31 [0.30–0.32] | 1.11× | 12.8 [12.5–13.1] | 179 [175–179] | 13.94× |
| 4 | 346 | 1.56 [1.53–1.64] | 1.73 [1.71–1.79] | 1.11× | 36.9 [36.2–37.5] | 783 [749–847] | 21.24× |
| 8 | 764 | 3.38 [3.32–3.57] | 3.93 [3.81–4.08] | 1.16× | 88.7 [87.2–89.4] | 1599 [1536–1627] | 18.03× |
| 12 | 853 | 4.00 [3.90–4.37] | 4.62 [4.55–4.73] | 1.16× | 273 [209–288] | 2298 [2220–2412] | 8.41× |
| 16 | 1153 | 5.23 [5.20–5.34] | 6.20 [6.17–6.21] | 1.19× | 267 [167–289] | 3344 [3200–3566] | 12.50× |
| 20 | 1359 | 6.25 [6.23–6.30] | 7.43 [7.37–7.51] | 1.19× | 187 [181–204] | 4813 [4669–5155] | 25.78× |
| 24 | 1703 | 7.62 [7.53–7.84] | 8.91 [8.84–9.16] | 1.17× | 336 [263–611] | 7843 [7448–7892] | 23.37× |

Both execute in time linear in the input: about 4.5 µs an input object for
QVTo and 5.2 µs for ATL at 24 Projects, with ATL 1.11× to 1.19× slower at
every size. Loaded per call, ATL is 8× to 26× slower (the QVTo side of that
column is noisy), because compiling ATL costs far more than loading QVTo:

### Loading, and cold

| what is timed | QVTo ms | ATL ms | ATL / QVTo |
|---|---|---|---|
| load, warm JVM (parse, compile, load the transformation) | 22.7 [22.4–24.8] | 280 [270–283] | 12.37× |
| cold JVM: load | 335 [285–338] | 850 [832–873] | 2.53× |
| cold JVM: load and lower the first estate Project | 382 [323–384] | 858 [840–882] | 2.25× |
| cold JVM: load and lower all 24 estate Projects | 487 [399–487] | 911 [888–937] | 1.87× |

Compiling the ATL source runs the ATL parser and then the ATL-to-EMFTVM
compiler, which is itself an ATL transformation, before the module is loaded:
about 280 ms warm, against 15–23 ms to parse and compile `lower.qvto` (the
two QVTo figures come from two suites, run at different points of the JVM's
warm-up). Cold, ATL adds about 0.4 s to a run: 911 ms against 487 ms to load
the transformation and lower all 24 estate Projects.

### The sources

|  | lower.qvto | lower.atl |
|---|---|---|
| lines | 474 | 625 |
| lines of code (not blank, not a comment) | 366 | 489 |
| mappings / rules | 54 | 33 matched, 21 lazy |
| of which only dispatch to a subtype (`disjuncts`) | 8 | – |
| queries / helpers | 9 | 35 |

The port is a third longer in lines of code. QVTo's eight `disjuncts` mappings
become helpers on each subtype (ATL dispatches a helper on the runtime type);
QVTo's `init` variables become attribute helpers on `Process`, which ATL
caches per object; and 42 conditional writes move into imperative `do`
blocks.

### What ATL made hard

Each of these was met while porting, and each is visible in
[`lower.atl`](../bundles/cli/src/test/resources/benchmark/lower.atl):

1. **One image per source.** A matched rule creates one target per source
   object. The lowering copies a Grant, an edge, an asset, a path or an env
   entry declared on the Project or an Application once **per Process below
   it**, so those copies cannot be matched rules: they are 21 lazy rules,
   each called explicitly by the rule that holds the copy, the ATL counterpart of QVTo's
   `copyFor(owner)` keyed mappings. Only what has exactly one image (33
   rules) is matched.
2. **A binding is unconditional.** An unsettable feature must be written
   only where the source states it, or the Effective Intent states what no
   author wrote. EMFTVM writes a null it is given, which marks the feature
   set, and a binding has no `if`. So 42 conditional writes sit in imperative
   `do` blocks: the rule shape QVTo writes declaratively with
   `if … then x := … endif`.
3. **A lazy rule with a `do` block answers the block, not its target.** The
   first runs failed with `Cannot add OclUndefined to multi-valued field
   SharedIntent::dependsOn`: a lazy rule whose `do` block ends in an `if`
   returns that statement's value, null. Each such rule ends with `t;`.
4. **`#absent` matches nothing.** EMFTVM reads an enumerator by its literal,
   and every `absent` literal in the metamodel is the empty string, so the
   value reads as `#` and never equals `#absent`. The comparison is with the
   text (`toString() = '#'`). Without it, nine Processes lost their inherited
   `cutover` and three generated keys gained an `encoding`.
5. **Optional children need guards.** QVTo's `map` on a null answers null;
   an ATL lazy rule called on `OclUndefined` fails. Every optional child is
   `if x.present then thisModule.R(x) else OclUndefined endif`.
6. **Keyword-named features** (`from`, `to`, `init`, `class`, `library`) are
   quoted, as QVTo prefixes them with `_`.
7. **Headless needs two steps.** The ATL resource factory parses to an ATL
   syntax tree, not a module; running headless means compiling with
   `AtlToEmftvmCompiler` to EMFTVM bytecode, loading that as a module, and
   running it through an `ExecEnvPool`
   ([`AtlLowering`](../bundles/cli/src/test/java/dev/jorisjonkers/deploykit/emf/cli/AtlLowering.java)).

### What ATL made easier

- **No construction order.** A reference to a lowered `Process` or `Surface`
  (a route's, a scrape's, an L4 port's) is written with the authored object,
  and EMFTVM resolves it through the default trace after every matched rule
  has run. QVTo's `resolveone` finds a copy only once it exists, so
  `Application::lower` has to assign `processes` before anything that refers
  to them; the port has no such constraint.
- **Dispatch.** A helper redeclared on each subtype dispatches on the runtime
  type, where `lower.qvto` needs `disjuncts` mappings and a single `sameGrant`
  query, because a QVTo query redeclared on subclasses binds statically.

## Conclusion

What the numbers support:

- **The lowering's language does not decide the pipeline's speed.** Warm,
  the ATL port executes the lowering in about 1.1× to 1.2× the QVTo time,
  both linear in the input, and the whole lowering of the estate is under
  10 ms either way, against about 1 s for *check* alone. Cold, ATL costs
  about 0.4 s more, mostly compiling its source, against a cold run of
  nearly 4 s.
- **Where time goes:** parsing and checking dominate both warm (55–63%) and
  cold (about 70%). Of the transformations, the measurable waste was
  loading: the lowering spent more than 95% of its time loading `lower.qvto`
  once per Project, and every resolution loaded `resolution.qvto` (about
  110 ms) and kept it. Both now load once per JVM: lowering the estate's 24
  Projects takes 7.8 ms instead of 174 ms, and a series of resolutions keeps
  no heap per call instead of about 8 MiB.

What they do not support:

- **That QVTo was chosen for speed, or that ATL would be slow.** The report
  did not claim it, and on the lowering the two are close.
- **Anything about the resolution in ATL.** The report's two reasons, reading
  the completed target to hash the `Revision` and an explicit construction
  order, are about the resolution, which was not ported. The lowering needs
  neither: it never reads its own output, and its one ordering constraint
  (Processes before what refers to them) disappeared in ATL rather than got
  harder. So the port is evidence that ATL can express the lowering at a
  similar speed, and no evidence either way on the resolution; there, reading
  the target would need a second ATL pass over the output or a
  recomputation from the source, and neither was built or timed.
- **Larger models.** The largest input is the estate's 24 Projects, 1,703
  objects to lower. The measured growth is linear up to there; nothing
  beyond it was run.
- **Another machine, or a finer ratio.** One laptop, not isolated, one JVM.
  The first full run warmed each series only five times, and put QVTo behind
  ATL from 8 Projects on (0.3×); a probe then showed QVTo's reused executor
  still settling after some hundreds of lowerings, which is why every
  lowering series now warms both engines 40 times over every Project first.
  The per-Project sums of the three full runs agree (1.11×, 1.15× and
  1.12×). The absolute numbers moved by 20–30% between runs, and *render* by
  far more; the tables here are the last run, with the pipeline tables
  rerun once more on a quieter machine.

The ATL port stays benchmark-only: it is test code in the `cli` bundle, its
runtime reaches that bundle's tests alone through `additional.bundles`, and
the pipeline ships the QVTo lowering. No decision changes, so no ADR records
one.
