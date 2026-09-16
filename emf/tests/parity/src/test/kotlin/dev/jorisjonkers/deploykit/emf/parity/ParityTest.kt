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
 * (docs/adr/emf/0120-parity-crosses-the-cli-file-interface.md): the pipeline's interface here is
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
    @MethodSource("refusalsWithADiagnosticsOracle")
    fun `a refused document equals its committed diagnostics`(oracle: Path) {
        val stem = oracle.fileName.toString().removeSuffix(".$DIAGNOSTICS")
        val written = output(PIPELINE_OUTPUT, oracle.resolveSibling(stem))

        assertThat(left(written, EXIT)).isEqualTo("1")
        assertThat(left(written, DIAGNOSTICS)).isEqualTo(read(oracle))
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
        private const val DIAGNOSTICS = "diagnostics.json"
        private const val DESCRIPTOR = "descriptor.json"
        private const val EXIT = "exit"

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
