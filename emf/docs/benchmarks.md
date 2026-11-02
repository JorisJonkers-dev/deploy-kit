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
  - *lower*: every Project of the union lowered by `Lowering.lower`, which
    loads `lower.qvto` on each call, as shipped;
  - *resolve*: one Project resolved against the union by `resolution.qvto`
    **loaded once and reused**. `Resolution.resolve` loads it again on every
    call; that load is timed apart ([Loading](#loading-a-transformation)),
    because every load stays reachable for the life of the JVM (about 8.5 MB
    each), and a series of hundreds of shipped calls exhausted a 16 GiB heap.
    The suite checks, per example, that the reused resolution writes what the
    shipped one writes;
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
  module was compiled once; "per call" is the shipped `Lowering.lower`, and
  the ATL source compiled for each Project.

## The machine

| | |
|---|---|
| CPU | Apple M4 Max, 16 cores (12 performance, 4 efficiency) |
| memory | 64 GiB |
| OS | macOS 27.0.1, arm64 |
| JVM | Amazon Corretto 21.0.10 (OpenJDK 64-Bit Server VM 21.0.10+7-LTS), G1, the default maximum heap of 16 GiB, no JVM arguments |
| build | Maven 3.9 wrapper, Tycho 5.0.4, `emf.target` (Eclipse 2026-06): QVTo 3.11, Acceleo 4.2, Xtext 2.43, ATL/EMFTVM 4.12.0 |

A developer laptop on mains power, with the usual background processes
running: the spread columns show how much that cost. Absolute numbers will
differ on another machine; the ratios and the shapes are what to read.

## The pipeline, per worked example

Warm, in milliseconds, `median [p25–p75]` of 10 runs. *lower* is every
Project of the union, as shipped; *resolve* and *render* are the example's
own Project.

| example | documents | Projects | read ms | check ms | lower ms (all Projects) | resolve ms (one Project, loaded once) | render ms (one Project) |
|---|---|---|---|---|---|---|---|
| agents | 13 | 9 | 47.6 [45.9–55.7] | 416 [409–474] | 71.6 [69.2–76.3] | 10.7 [10.5–11.2] | 57.8 [56.4–64.0] |
| auth | 15 | 10 | 61.7 [55.0–68.7] | 573 [479–655] | 96.1 [89.2–103] | 12.1 [11.9–12.6] | 49.5 [48.7–54.2] |
| data | 13 | 9 | 54.4 [50.9–58.7] | 467 [441–532] | 75.4 [73.7–83.9] | 15.3 [14.4–16.0] | 87.7 [83.8–95.3] |
| delivery | 13 | 9 | 52.4 [49.1–57.6] | 439 [432–513] | 83.6 [80.5–91.1] | 8.28 [8.14–8.60] | 53.1 [48.0–58.1] |
| edge | 13 | 9 | 53.8 [50.2–59.8] | 429 [427–510] | 87.0 [86.6–93.5] | 8.01 [7.74–8.24] | 55.1 [48.2–62.5] |
| estate/hindsight | 28 | 24 | 69.4 [64.9–73.5] | 1238 [1146–1419] | 203 [196–207] | 32.7 [32.1–33.1] | 69.6 [63.1–75.8] |
| estate/immich | 28 | 24 | 65.4 [62.0–69.3] | 1134 [1071–1343] | 200 [186–210] | 20.4 [20.0–20.8] | 70.9 [65.9–76.1] |
| estate/observability | 28 | 24 | 65.4 [59.3–73.3] | 1098 [1038–1149] | 188 [183–198] | 254 [253–257] | 240 [237–261] |
| identity | 13 | 9 | 52.7 [50.0–60.5] | 592 [523–719] | 80.9 [78.6–83.7] | 9.80 [9.57–9.90] | 57.1 [54.3–59.8] |
| knowledge-platform | 14 | 10 | 61.7 [58.7–68.4] | 657 [549–758] | 108 [107–112] | 21.0 [20.3–22.4] | 98.9 [96.8–102] |
| mail | 13 | 9 | 66.1 [64.4–70.5] | 575 [549–613] | 81.4 [77.7–85.4] | 5.18 [5.15–5.30] | 41.4 [38.6–45.1] |
| minimal | 14 | 10 | 57.5 [53.7–63.9] | 543 [480–672] | 96.8 [93.8–100] | 5.23 [5.15–5.39] | 38.3 [36.0–43.4] |
| node | 13 | 9 | 51.1 [48.3–57.1] | 519 [490–622] | 86.3 [83.3–93.1] | 2.54 [2.42–2.63] | 57.8 [55.0–61.1] |
| observability | 14 | 10 | 60.2 [57.3–65.8] | 511 [490–622] | 89.8 [85.8–97.7] | 23.3 [22.0–24.2] | 113 [108–124] |
| secrets | 13 | 9 | 65.7 [64.6–67.0] | 571 [526–593] | 87.1 [83.7–96.9] | 5.79 [5.36–5.90] | 71.0 [65.5–80.2] |
| utility | 13 | 9 | 52.2 [50.1–57.7] | 450 [438–496] | 81.5 [78.1–90.5] | 6.66 [6.46–6.83] | 44.8 [42.9–49.2] |

`check` dominates every example: parsing again, the Complete OCL
constraints, the cross-file names and the pinned inputs take 57–72% of a
warm run, counting the resolution's load as shipped. The lowering of a whole union (9 to 24 Projects) takes 70–200 ms,
and almost all of it is loading `lower.qvto` again for every Project (next
table). The resolution's execution is 2–35 ms for every example but
`estate/observability`, whose metrics stack scrapes every Process of the
estate.

### Loading a transformation

Warm, parse and compile only, as `Lowering.lower` and `Resolution.resolve`
each do on every call.

| transformation | lines | load ms (parse, compile) |
|---|---|---|
| lower.qvto | 474 | 10.6 [10.4–11.1] |
| resolution.qvto | 4212 | 95.4 [94.5–105] |

So a shipped resolution costs about 95 ms of loading on top of the execution
above, and a shipped lowering about 10 ms of loading on top of well under a
millisecond of execution. Every load of `resolution.qvto` also stays
reachable for the life of the JVM (about 8.5 MB each, measured over repeated
calls); one reused executor does not grow. A command-line run makes one call
per Project and exits, so it does not notice; a long-lived process would.
`lower.qvto`, which imports no blackbox, does not keep its loads.

## The pipeline over the estate, growing

Warm, milliseconds. The estate's Platform document and pinned inputs, plus
its first *n* Projects. Below 12 the checks refuse the union, so only *read*
and *lower* run. *resolve* and *render* here cover **every** Project of the
union: what `Pipeline.render` does for the whole estate.

| Projects | documents | read ms | check ms | lower ms (all Projects) | resolve ms (every Project, loaded once) | render ms (every Project) |
|---|---|---|---|---|---|---|
| 1 | 5 | 44.0 [40.3–49.3] | – | 12.5 [12.3–12.9] | – | – |
| 4 | 8 | 45.6 [43.9–50.0] | – | 38.9 [36.6–43.7] | – | – |
| 8 | 12 | 55.8 [45.8–59.1] | – | 63.1 [58.2–73.2] | – | – |
| 12 | 16 | 53.2 [50.2–59.4] | 643 [582–707] | 100 [94.1–107] | 358 [333–375] | 475 [454–490] |
| 16 | 20 | 66.0 [62.5–70.5] | 932 [862–1059] | 170 [166–178] | 411 [390–452] | 853 [724–915] |
| 20 | 24 | 71.4 [67.4–74.8] | 1254 [1111–1366] | 173 [170–185] | 627 [522–805] | 832 [770–882] |
| 24 | 28 | 70.6 [65.7–76.2] | 1191 [1085–1336] | 207 [190–216] | 618 [569–645] | 801 [722–868] |

Every stage grows roughly linearly with the union between 12 and 24
Projects: doubling the Projects multiplies *check* by about 1.9, *lower* by
2.1, *resolve* (every Project) by 1.7 and *render* by 1.7. *read* is nearly
flat: one Xtext setup per language dominates it, not the documents. Resolving
one Project does not get dearer as the union grows (about 25 ms a Project at
24 against 30 ms at 12), even though each resolution reads the whole union.
The rows from 16 on are noisy (the interquartile ranges overlap), so the
growth between neighbouring rows is not to be read finely.

### Cold

One fresh JVM per sample, five samples, every stage once in pipeline order,
with the shipped `Lowering.lower` and `Resolution.resolve`.

| example | read ms | check ms | lower ms | resolve ms | render ms |
|---|---|---|---|---|---|
| minimal | 1087 [1087–1185] | 1879 [1850–1970] | 547 [529–565] | 413 [368–426] | 274 [256–294] |
| estate/hindsight | 1122 [1108–1176] | 2714 [2572–2768] | 669 [661–691] | 449 [440–456] | 343 [332–351] |

A cold run of `minimal` takes about 4.2 s, of which 3 s are *read* and
*check*: class loading and the first Xtext and OCL setups. The transformations
together (lower, resolve, render) are about 1.2 s cold.

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

Equivalence covers only the rules the inputs reach: 51 of the port's 55.
`NoMigration`, `Rollback`, `NoProbes` and `DatabaseGrantCopy` match no object
in any example, so for those four the port is unproven. The port copies
exactly what `lower.qvto` copies, including what it leaves out: neither copies
`Generate.adopt`.

### Execution, per Project

Warm, transformation loaded once, milliseconds.

<details>
<summary>All 36 Projects</summary>

| Project | objects | QVTo ms | ATL ms | ATL / QVTo |
|---|---|---|---|---|
| delivery/delivery.project.yml | 53 | 0.35 [0.34–0.38] | 0.37 [0.37–0.41] | 1.06× |
| edge/edge.project.yml | 31 | 0.23 [0.23–0.25] | 0.26 [0.25–0.27] | 1.10× |
| observability/observability.project.yml | 137 | 0.91 [0.91–0.94] | 1.00 [0.99–1.02] | 1.09× |
| secrets/secrets.project.yml | 27 | 0.20 [0.19–0.21] | 0.23 [0.22–0.24] | 1.14× |
| identity/identity.project.yml | 30 | 0.27 [0.26–0.29] | 0.28 [0.28–0.31] | 1.04× |
| mail/mail.project.yml | 19 | 0.15 [0.14–0.16] | 0.17 [0.16–0.18] | 1.15× |
| utility/utility.project.yml | 26 | 0.20 [0.19–0.22] | 0.23 [0.22–0.24] | 1.16× |
| agents/agents.project.yml | 107 | 0.57 [0.55–0.58] | 0.64 [0.63–0.65] | 1.13× |
| data/data.project.yml | 92 | 0.59 [0.58–0.61] | 0.65 [0.64–0.66] | 1.10× |
| auth/auth.project.yml | 77 | 0.36 [0.36–0.39] | 0.42 [0.41–0.43] | 1.14× |
| estate/arr/arr.project.yml | 43 | 0.31 [0.31–0.33] | 0.36 [0.35–0.42] | 1.16× |
| estate/auth/auth.project.yml | 149 | 0.62 [0.58–0.72] | 0.67 [0.67–0.70] | 1.08× |
| estate/data/data.project.yml | 59 | 0.36 [0.36–0.38] | 0.42 [0.41–0.46] | 1.14× |
| estate/delivery/delivery.project.yml | 95 | 0.55 [0.55–0.57] | 0.59 [0.59–0.60] | 1.07× |
| estate/edge/edge.project.yml | 21 | 0.17 [0.17–0.19] | 0.20 [0.20–0.21] | 1.14× |
| estate/estate-dashboard/estate-dashboard.project.yml | 62 | 0.31 [0.29–0.41] | 0.35 [0.34–0.36] | 1.12× |
| estate/findability-explorer/findability-explorer.project.yml | 56 | 0.27 [0.26–0.30] | 0.31 [0.31–0.33] | 1.17× |
| estate/grimoire/grimoire.project.yml | 70 | 0.30 [0.29–0.31] | 0.36 [0.35–0.37] | 1.18× |
| estate/hindsight/hindsight.project.yml | 163 | 1.02 [1.01–1.04] | 1.10 [1.09–1.17] | 1.07× |
| estate/home-portal/home-portal.project.yml | 11 | 0.11 [0.11–0.13] | 0.13 [0.13–0.15] | 1.16× |
| estate/immich/immich.project.yml | 74 | 0.42 [0.41–0.44] | 0.50 [0.48–0.51] | 1.20× |
| estate/jellyfin/jellyfin.project.yml | 18 | 0.13 [0.13–0.14] | 0.17 [0.17–0.18] | 1.26× |
| estate/jellyseerr/jellyseerr.project.yml | 17 | 0.13 [0.13–0.14] | 0.17 [0.16–0.18] | 1.24× |
| estate/karakeep/karakeep.project.yml | 97 | 0.48 [0.47–0.52] | 0.55 [0.54–0.58] | 1.14× |
| estate/mail/mail.project.yml | 71 | 0.32 [0.32–0.35] | 0.39 [0.38–0.44] | 1.21× |
| estate/n8n/n8n.project.yml | 75 | 0.30 [0.29–0.33] | 0.36 [0.35–0.38] | 1.19× |
| estate/observability/observability.project.yml | 264 | 1.28 [1.27–1.30] | 1.50 [1.43–1.54] | 1.17× |
| estate/outline/outline.project.yml | 104 | 0.38 [0.37–0.41] | 0.45 [0.44–0.45] | 1.18× |
| estate/overleaf/overleaf.project.yml | 103 | 0.42 [0.40–0.45] | 0.50 [0.49–0.51] | 1.21× |
| estate/prowlarr/prowlarr.project.yml | 18 | 0.15 [0.13–0.19] | 0.18 [0.18–0.19] | 1.24× |
| estate/qbittorrent/qbittorrent.project.yml | 16 | 0.12 [0.11–0.13] | 0.16 [0.15–0.17] | 1.30× |
| estate/secrets/secrets.project.yml | 8 | 0.09 [0.09–0.10] | 0.11 [0.11–0.12] | 1.30× |
| estate/tribelt/tribelt.project.yml | 62 | 0.27 [0.26–0.29] | 0.33 [0.32–0.34] | 1.23× |
| estate/utility/utility.project.yml | 47 | 0.25 [0.25–0.27] | 0.31 [0.30–0.32] | 1.21× |
| knowledge-platform/knowledge-platform.project.yml | 243 | 1.06 [1.05–1.12] | 1.29 [1.23–1.45] | 1.22× |
| minimal/notes.project.yml | 19 | 0.14 [0.13–0.16] | 0.17 [0.17–0.19] | 1.25× |
| **sum of medians** |  | 13.8 | 15.9 | 1.15× |

</details>

ATL takes 1.04× to 1.30× QVTo's time per Project (median 1.16×), and
1.15× over all 36 together (15.9 ms against 13.8 ms).

### Execution, growing

The estate's first *n* Projects, all lowered, milliseconds. Left: each
transformation loaded once (QVTo `TransformationExecutor`, EMFTVM
`ExecEnvPool`). Right: loaded for every Project, which is how
`Lowering.lower` ships, against the ATL source compiled for every Project.

| Projects | objects | QVTo ms (loaded once) | ATL ms (compiled once) | ATL / QVTo | QVTo ms (loaded per Project, as shipped) | ATL ms (compiled per Project) | ATL / QVTo |
|---|---|---|---|---|---|---|---|
| 1 | 43 | 0.34 [0.33–0.36] | 0.37 [0.36–0.41] | 1.09× | 16.3 [15.8–16.6] | 197 [192–209] | 12.04× |
| 4 | 346 | 1.87 [1.85–2.06] | 2.08 [2.06–2.14] | 1.11× | 46.6 [46.1–47.1] | 721 [707–738] | 15.50× |
| 8 | 764 | 4.20 [4.05–4.38] | 4.72 [4.41–4.98] | 1.12× | 78.3 [77.6–80.7] | 1619 [1507–1804] | 20.68× |
| 12 | 853 | 4.32 [4.29–4.41] | 5.32 [5.12–5.46] | 1.23× | 105 [100–122] | 2375 [2228–2443] | 22.71× |
| 16 | 1153 | 5.57 [5.55–5.63] | 6.91 [6.56–7.22] | 1.24× | 132 [128–155] | 2963 [2780–3013] | 22.50× |
| 20 | 1359 | 6.65 [6.37–6.89] | 7.41 [7.29–7.57] | 1.11× | 190 [169–206] | 3999 [3790–4073] | 21.08× |
| 24 | 1703 | 7.41 [7.34–7.78] | 8.94 [8.71–9.26] | 1.21× | 205 [200–209] | 5819 [5475–6314] | 28.32× |

Both execute in time linear in the input: about 4.4 µs an input object for
QVTo and 5.2 µs for ATL at 24 Projects, with ATL 1.1× to 1.25× slower at every
size. Loaded per call, ATL is 12× to 28× slower, because compiling ATL costs
far more than loading QVTo:

### Loading, and cold

| what is timed | QVTo ms | ATL ms | ATL / QVTo |
|---|---|---|---|
| load, warm JVM (parse, compile, load the transformation) | 30.2 [28.9–31.5] | 201 [190–216] | 6.66× |
| cold JVM: load | 211 [210–218] | 550 [531–613] | 2.60× |
| cold JVM: load and lower the first estate Project | 240 [239–247] | 554 [535–619] | 2.31× |
| cold JVM: load and lower all 24 estate Projects | 304 [297–306] | 585 [567–659] | 1.92× |

Compiling the ATL source runs the ATL parser and then the ATL-to-EMFTVM
compiler, which is itself an ATL transformation, before the module is loaded:
about 200 ms warm, against 10–30 ms to parse and compile `lower.qvto` (the two
QVTo figures come from two suites, run at different points of the JVM's
warm-up). Cold, ATL adds about 0.3 s to a run: 585 ms against 304 ms to load
the transformation and lower all 24 estate Projects.

### The sources

|  | lower.qvto | lower.atl |
|---|---|---|
| lines | 474 | 629 |
| lines of code (not blank, not a comment) | 366 | 493 |
| mappings / rules | 54 | 34 matched, 21 lazy |
| of which only dispatch to a subtype (`disjuncts`) | 8 | – |
| queries / helpers | 9 | 35 |

The port is 35% longer in lines of code. QVTo's eight `disjuncts` mappings
become helpers on each subtype (ATL dispatches a helper on the runtime type);
QVTo's `init` variables become attribute helpers on `Process`, which ATL
caches per object; and 41 conditional writes move into imperative `do`
blocks.

### What ATL made hard

Each of these was met while porting, and each is visible in
[`lower.atl`](../bundles/cli/src/test/resources/benchmark/lower.atl):

1. **One image per source.** A matched rule creates one target per source
   object. The lowering copies a Grant, an edge, an asset, a path or an env
   entry declared on the Project or an Application once **per Process below
   it**, so those copies cannot be matched rules: they are 21 lazy rules,
   each called explicitly by the rule that holds the copy, the ATL counterpart of QVTo's
   `copyFor(owner)` keyed mappings. Only what has exactly one image (34
   rules) is matched.
2. **A binding is unconditional.** An unsettable feature must be written
   only where the source states it, or the Effective Intent states what no
   author wrote. EMFTVM writes a null it is given, which marks the feature
   set, and a binding has no `if`. So 41 conditional writes sit in imperative
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
  the ATL port executes the lowering in 1.1× to 1.25× the QVTo time, both
  linear in the input, and the whole lowering of the estate is under 10 ms
  either way, against about 1.2 s for *check* alone. Cold, ATL costs about
  0.3 s more, mostly compiling its source, against a cold run of 4 s or more.
- **Where time goes:** parsing and checking dominate both warm (57–72%) and
  cold (about 70%). Of the transformations, the measurable waste is loading:
  the shipped lowering spends about 95% of its time loading `lower.qvto` once
  per Project, and every shipped resolution loads `resolution.qvto` (about
  95 ms) and keeps it.

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
  The per-Project sums of the two runs agree (1.11× and 1.15×); the absolute
  numbers moved by up to about 20% between them.

The ATL port stays benchmark-only: it is test code in the `cli` bundle, its
runtime reaches that bundle's tests alone through `additional.bundles`, and
the pipeline ships the QVTo lowering. No decision changes, so no ADR records
one.
