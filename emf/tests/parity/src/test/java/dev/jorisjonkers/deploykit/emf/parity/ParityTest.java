package dev.jorisjonkers.deploykit.emf.parity;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;

/**
 * Every case under {@code spec/v1/examples/} that carries an oracle, decided from what a run of the
 * pipeline left behind and compared with the committed file byte for byte
 * (docs/architecture.md#the-parity-contract).
 *
 * <p>The suite calls nothing and holds no EMF type
 * (docs/adr/emf/0120-parity-crosses-the-cli-file-interface.md): the pipeline's interface here is
 * arguments and input files in, an exit code and output files out. A file a case needs and the run
 * did not write fails as a missing file, never as a skipped case.
 */
class ParityTest {

    /** Where a run of the pipeline leaves the parsed intent and the diagnostics, under {@code emf/}. */
    private static final String PIPELINE_OUTPUT = "emf/bundles/cli/target/parity";

    /** Where a run of the build leaves the source metamodel's descriptor, under {@code emf/}. */
    private static final String METAMODEL_OUTPUT = "emf/bundles/metamodel/target/parity";

    private static final String INTENT = "intent.json";
    private static final String DIAGNOSTICS = "diagnostics.json";
    private static final String DESCRIPTOR = "descriptor.json";
    private static final String EXIT = "exit";

    private static List<Path> casesWithAnIntentOracle() {
        Path examples = examples();
        try (Stream<Path> tree = Files.walk(examples)) {
            return tree.filter(path -> path.endsWith("expected/" + INTENT))
                    .map(path -> path.getParent().getParent())
                    .sorted()
                    .toList();
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("casesWithAnIntentOracle")
    void theParsedIntentEqualsTheCommittedOracle(Path directory) throws IOException {
        Path written = output(PIPELINE_OUTPUT, directory);

        assertThat(left(written, EXIT)).isEqualTo("0");
        assertThat(left(written, INTENT))
                .isEqualTo(read(directory.resolve("expected").resolve(INTENT)));
    }

    private static List<Path> refusalsWithADiagnosticsOracle() {
        Path refusals = examples().resolve("refusals");
        try (Stream<Path> files = Files.list(refusals)) {
            return files.filter(path -> path.getFileName().toString().endsWith("." + DIAGNOSTICS))
                    .sorted()
                    .toList();
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("refusalsWithADiagnosticsOracle")
    void aRefusedDocumentEqualsItsCommittedDiagnostics(Path oracle) throws IOException {
        String stem = oracle.getFileName().toString().replace("." + DIAGNOSTICS, "");
        Path written = output(PIPELINE_OUTPUT, oracle.resolveSibling(stem));

        assertThat(left(written, EXIT)).isEqualTo("1");
        assertThat(left(written, DIAGNOSTICS)).isEqualTo(read(oracle));
    }

    @Test
    void theMetamodelsStructureEqualsTheCommittedDescriptor() throws IOException {
        Path written = repository().resolve(METAMODEL_OUTPUT);

        assertThat(left(written, DESCRIPTOR))
                .isEqualTo(read(examples().resolve("expected").resolve(DESCRIPTOR)));
    }

    @Test
    void oneChangedFieldNoLongerMatchesTheOracle() throws IOException {
        Path directory = casesWithAnIntentOracle().get(0);
        String written = left(output(PIPELINE_OUTPUT, directory), INTENT);
        String changed = written.replace("\"owner\":\"joris\"", "\"owner\":\"someone-else\"");

        assertThat(changed).isNotEqualTo(written);
        assertThat(changed).isNotEqualTo(read(directory.resolve("expected").resolve(INTENT)));
    }

    /** Where the run left a case's files: the output tree mirrors the example tree, case for case. */
    private static Path output(String root, Path directory) {
        return repository().resolve(root).resolve(examples().relativize(directory));
    }

    /**
     * A file the run owes, read. Its absence is the pipeline failing to write what it owes, which is
     * a different thing from a case with no committed oracle, and is reported as the missing file.
     */
    private static String left(Path directory, String name) throws IOException {
        Path file = directory.resolve(name);
        assertThat(file)
                .as("%s: a run of the pipeline leaves this file behind, and did not", file)
                .exists();
        return read(file);
    }

    private static String read(Path path) throws IOException {
        return Files.readString(path, StandardCharsets.UTF_8);
    }

    private static Path examples() {
        return repository().resolve("spec/v1/examples");
    }

    private static Path repository() {
        Path dir = Path.of("").toAbsolutePath();
        while (!Files.isRegularFile(dir.resolve("emf/pom.xml"))) {
            dir = dir.getParent();
        }
        return dir;
    }
}
