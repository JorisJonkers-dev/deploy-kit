# Rule ledger

The rules the model-driven build enforces on itself. The root
[rule ledger](../../docs/architecture-rules.md) holds the rules the root
enforces, including the two that watch this build from outside; the rules
here are enforced by Maven inside `emf/` and deleted with it
([0115](adr/emf/0115-the-emf-gates-are-estate-shaped.md)).

A row names the file that enforces the rule, relative to `emf/`, and the
literal in that file that does the enforcing. `Ledgers.checkRules` in
`tests/parity` fails the build when a file no longer exists or no longer contains
its literal, so a gate cannot be removed while its row stays. That the rule
fires is shown once, by breaking it, in the pull request that adds it.

This ledger holds **18** rules.

| id | rule | enforcer | witness |
|---|---|---|---|
| EMF-001 | The build runs on JDK 21 and no other major version | `pom.xml` | `<requireJavaVersion><version>[21,22)</version></requireJavaVersion>` |
| EMF-002 | The build runs on Maven 3.9, the line Tycho 5 requires | `pom.xml` | `<requireMavenVersion><version>[3.9,4)</version></requireMavenVersion>` |
| EMF-003 | Every plugin version is pinned | `pom.xml` | `<requirePluginVersions/>` |
| EMF-004 | Dependency versions converge | `pom.xml` | `<dependencyConvergence/>` |
| EMF-005 | Nothing is ever published | `pom.xml` | `<banDistributionManagement/>` |
| EMF-006 | Every compiler warning is enabled and fails the build | `pom.xml` | `<arg>-Werror</arg>` |
| EMF-007 | Java source is formatted with palantir-java-format, checked in `verify` | `pom.xml` | `<palantirJavaFormat>` |
| EMF-008 | Line and branch coverage stay at or above the measured floor, in every module | `pom.xml` | `<counter>BRANCH</counter>` |
| EMF-009 | The mutation score stays at or above the measured threshold, in every module | `pom.xml` | `<mutationThreshold>${emf.mutation.threshold}</mutationThreshold>` |
| EMF-010 | A module depends only on the modules above it in the architecture's module table | `tests/parity/src/test/kotlin/dev/jorisjonkers/deploykit/emf/parity/ArchitectureTest.kt` | `MODULES_DEPEND_ONLY_ON_MODULES_ABOVE_THEM` |
| EMF-011 | No dependency cycle between modules | `tests/parity/src/test/kotlin/dev/jorisjonkers/deploykit/emf/parity/ArchitectureTest.kt` | `MODULES_HAVE_NO_CYCLES` |
| EMF-012 | The Maven distribution the wrapper downloads is pinned by checksum | `.mvn/wrapper/maven-wrapper.properties` | `distributionSha256Sum=` |
| EMF-013 | Every model behaviour has a JUnit witness, in whichever language its module is written | `tests/parity/src/test/kotlin/dev/jorisjonkers/deploykit/emf/parity/LedgersTest.kt` | `Ledgers.checkWitnesses(repository)` |
| EMF-014 | Every rule in this ledger is still enforced by its named file | `tests/parity/src/test/kotlin/dev/jorisjonkers/deploykit/emf/parity/LedgersTest.kt` | `Ledgers.checkRules(repository)` |
| EMF-015 | Every warning the JDT compiler reports in a Tycho bundle fails the build | `pom.xml` | `<failOnWarning>true</failOnWarning>` |
| EMF-016 | The target platform resolves from one dated release build and names every unit at an exact version | `tests/parity/src/test/kotlin/dev/jorisjonkers/deploykit/emf/parity/TargetPlatformTest.kt` | `EVERY_UNIT_IS_PINNED` |
| EMF-017 | The module rules run over the classes the build wrote, never over an import that holds no module | `tests/parity/src/test/kotlin/dev/jorisjonkers/deploykit/emf/parity/ArchitectureTest.kt` | `ModuleRules.modulesMissingFrom(classes)` |
| EMF-018 | Kotlin source is formatted with ktlint, checked in `verify` | `pom.xml` | `<ktlint><version>${ktlint.version}</version></ktlint>` |
