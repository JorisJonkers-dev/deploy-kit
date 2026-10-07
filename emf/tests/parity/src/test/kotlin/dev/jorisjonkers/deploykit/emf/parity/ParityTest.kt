package dev.jorisjonkers.deploykit.emf.parity

import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.MethodSource
import java.nio.file.Files
import java.nio.file.Path
import kotlin.streams.asSequence

/**
 * Every case under `spec/v1/examples/` that carries an oracle, decided from what a run of the
 * pipeline left behind and compared with the committed file byte for byte
 * (docs/architecture.md#the-parity-contract).
 *
 * The suite calls nothing and holds no EMF type
 * (docs/adr/emf/0080-parity-crosses-the-cli-file-interface.md): the pipeline's interface here is
 * arguments and input files in, an exit code and output files out. A file a case needs and the run
 * did not write fails as a missing file, never as a skipped case.
 */
class ParityTest {
    @ParameterizedTest(name = "{0}")
    @MethodSource("casesWithAnIntentOracle")
    fun `the parsed intent equals the committed oracle`(directory: Path) {
        val written = output(PIPELINE_OUTPUT, directory)

        assertThat(left(written, EXIT)).isEqualTo("0")
        assertThat(left(written, INTENT)).isEqualTo(read(directory.resolve("expected").resolve(INTENT)))
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("casesWithAnEffectiveOracle")
    fun `the lowered intent equals the committed effective oracle`(directory: Path) {
        val written = output(PIPELINE_OUTPUT, directory)

        assertThat(left(written, EFFECTIVE)).isEqualTo(read(directory.resolve("expected").resolve(EFFECTIVE)))
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("refusalsWithADiagnosticsOracle")
    fun `a refused document equals its committed diagnostics`(oracle: Path) {
        val stem = oracle.fileName.toString().removeSuffix(".$DIAGNOSTICS")
        val written = output(PIPELINE_OUTPUT, oracle.resolveSibling(stem))

        assertThat(left(written, EXIT)).isEqualTo("1")
        assertThat(left(written, DIAGNOSTICS)).isEqualTo(read(oracle))
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("negativeFixtures")
    fun `a negative fixture equals its committed diagnostics in either order`(oracle: Path) {
        val stem = oracle.fileName.toString().removeSuffix(".$DIAGNOSTICS")
        val written = output(PIPELINE_OUTPUT, oracle.resolveSibling(stem))

        assertThat(left(written, EXIT)).isEqualTo("1")
        assertThat(left(written, DIAGNOSTICS)).isEqualTo(read(oracle))
        assertThat(left(written, REVERSED)).isEqualTo(read(oracle))
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("casesTheResolutionReaches")
    fun `the resolved dependency edges equal the committed oracle`(directory: Path) {
        val written = output(PIPELINE_OUTPUT, directory)

        assertThat(left(written, DEPENDENCIES)).isEqualTo(read(directory.resolve("expected").resolve(DEPENDENCIES)))
    }

    @Test
    fun `the composed union renders to the committed trees byte for byte`() {
        val written = repository().resolve(PIPELINE_OUTPUT).resolve(RENDERED)
        val committed = RENDERED_CASES.map { examples().resolve(it).resolve(RENDERED) }
        val expected = committed.flatMap { tree -> filesUnder(tree).map { it to tree.resolve(it) } }.toMap()

        assertThat(filesUnder(written)).containsExactlyElementsOf(expected.keys.sorted())
        expected.forEach { (file, oracle) ->
            assertThat(left(written, file)).`as`(file).isEqualTo(read(oracle))
        }
    }

    @Test
    fun `every case the resolution reaches carries a dependencies oracle`() {
        assertThat(casesTheResolutionReaches()).allSatisfy { directory ->
            assertThat(directory.resolve("expected").resolve(DEPENDENCIES)).exists()
        }
    }

    @Test
    fun `the metamodels structure equals the committed descriptor`() {
        val written = repository().resolve(METAMODEL_OUTPUT)

        assertThat(left(written, DESCRIPTOR)).isEqualTo(read(examples().resolve("expected").resolve(DESCRIPTOR)))
    }

    @Test
    fun `one changed field no longer matches the oracle`() {
        val directory = casesWithAnIntentOracle().first()
        val written = left(output(PIPELINE_OUTPUT, directory), INTENT)
        val changed = written.replace("\"owner\":\"joris\"", "\"owner\":\"someone-else\"")

        assertThat(changed).isNotEqualTo(written)
        assertThat(changed).isNotEqualTo(read(directory.resolve("expected").resolve(INTENT)))
    }

    companion object {
        /** Where a run of the pipeline leaves the parsed intent and the diagnostics, under `emf/`. */
        private const val PIPELINE_OUTPUT = "emf/bundles/cli/target/parity"

        /** Where a run of the build leaves the source metamodel's descriptor, under `emf/`. */
        private const val METAMODEL_OUTPUT = "emf/bundles/metamodel/target/parity"

        private const val INTENT = "intent.json"
        private const val EFFECTIVE = "effective.json"
        private const val DIAGNOSTICS = "diagnostics.json"
        private const val REVERSED = "diagnostics.reversed.json"
        private const val DESCRIPTOR = "descriptor.json"
        private const val DEPENDENCIES = "dependencies.json"

        /**
         * The cases the QVT-Operational resolution reaches: every case the production implementation
         * resolves. `knowledge` carries a dependencies oracle and joins when the production
         * implementation resolves it (JorisJonkers-dev/deploy-kit#201).
         */
        private val RESOLVED = listOf("auth", "data", "delivery", "edge", "minimal", "observability", "secrets")
        private const val EXIT = "exit"
        private const val RENDERED = "rendered"

        /**
         * The cases whose committed rendered trees the composed union writes between them: every tree
         * the production implementation renders. `auth`'s and `knowledge`'s trees are hand-written
         * goal states it does not render yet.
         */
        private val RENDERED_CASES = listOf("minimal", "data", "_estate")

        /** Every file under `root`, by its path below it, sorted; a tree's README is no rendered file. */
        private fun filesUnder(root: Path): List<String> =
            Files.walk(root).use { tree ->
                tree
                    .asSequence()
                    .filter { Files.isRegularFile(it) && it.fileName.toString() != "README.md" }
                    .map { root.relativize(it).toString() }
                    .sorted()
                    .toList()
            }

        @JvmStatic
        fun casesWithAnIntentOracle(): List<Path> =
            Files.walk(examples()).use { tree ->
                tree
                    .asSequence()
                    .filter { it.endsWith("expected/$INTENT") }
                    .map { it.parent.parent }
                    .sorted()
                    .toList()
            }

        @JvmStatic
        fun casesTheResolutionReaches(): List<Path> = RESOLVED.map { examples().resolve(it) }

        @JvmStatic
        fun casesWithAnEffectiveOracle(): List<Path> =
            Files.walk(examples()).use { tree ->
                tree
                    .asSequence()
                    .filter { it.endsWith("expected/$EFFECTIVE") }
                    .map { it.parent.parent }
                    .sorted()
                    .toList()
            }

        @JvmStatic
        fun negativeFixtures(): List<Path> =
            Files.list(examples().resolve("negative")).use { files ->
                files
                    .asSequence()
                    .filter { it.fileName.toString().endsWith(".$DIAGNOSTICS") }
                    .sorted()
                    .toList()
            }

        @JvmStatic
        fun refusalsWithADiagnosticsOracle(): List<Path> =
            Files.list(examples().resolve("refusals")).use { files ->
                files
                    .asSequence()
                    .filter { it.fileName.toString().endsWith(".$DIAGNOSTICS") }
                    .sorted()
                    .toList()
            }

        /** Where the run left a case's files: the output tree mirrors the example tree, case for case. */
        private fun output(
            root: String,
            directory: Path,
        ): Path = repository().resolve(root).resolve(examples().relativize(directory))

        /**
         * A file the run owes, read. Its absence is the pipeline failing to write what it owes, which
         * is a different thing from a case with no committed oracle, and is reported as the missing
         * file.
         */
        private fun left(
            directory: Path,
            name: String,
        ): String {
            val file = directory.resolve(name)
            assertThat(file).`as`("%s: a run of the pipeline leaves this file behind, and did not", file).exists()
            return read(file)
        }

        private fun read(path: Path): String = Files.readString(path, Charsets.UTF_8)

        private fun examples(): Path = repository().resolve("spec/v1/examples")
    }
}
