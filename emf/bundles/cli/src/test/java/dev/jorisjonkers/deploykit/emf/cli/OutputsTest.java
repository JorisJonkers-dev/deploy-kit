package dev.jorisjonkers.deploykit.emf.cli;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.File;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Comparator;
import java.util.List;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

/**
 * What a run of the pipeline leaves behind: the files every parity case is decided from, under this
 * module's build output, one directory per case.
 */
class OutputsTest {

    /** Where a run of this module leaves what the parity contract compares, under its build output. */
    private static final Path OUTPUT = Path.of("target", "parity");

    @Test
    void aRunLeavesEveryCaseUnderTheModulesBuildOutput() throws IOException {
        Path examples = Examples.of("");
        deleteTree(OUTPUT);

        Outputs.write(examples, OUTPUT);

        assertThat(files(OUTPUT)).containsExactlyElementsOf(everyCasesPairedFile(examples));
    }

    @Test
    void everyShapeOfCaseLeavesTheFileItsOracleIsPairedWith(@TempDir Path root) throws IOException {
        Path examples = root.resolve("examples");
        Path out = root.resolve("out");
        accepted(examples, "minimal");
        refused(examples, "unknown-surface");
        refused(examples, "no-tier-for-audience");

        Outputs.write(examples, out);

        assertThat(files(out))
                .containsExactly(
                        "minimal/exit",
                        "minimal/intent.json",
                        "minimal/intent.xmi",
                        "refusals/no-tier-for-audience/diagnostics.json",
                        "refusals/no-tier-for-audience/exit",
                        "refusals/unknown-surface/diagnostics.json",
                        "refusals/unknown-surface/exit");
        assertThat(read(out.resolve("minimal/exit"))).isEqualTo("0");
        assertThat(read(out.resolve("minimal/intent.json"))).startsWith("{").endsWith("}");
        // The same model as an instance of the metamodel, which loads back without the grammar.
        assertThat(read(out.resolve("minimal/intent.xmi")))
                .contains("projectintent:Project")
                .contains("project=\"notes\"");
        assertThat(read(out.resolve("refusals/unknown-surface/exit"))).isEqualTo("1");
        assertThat(read(out.resolve("refusals/unknown-surface/diagnostics.json")))
                .contains("E_UNKNOWN_SURFACE");
        assertThat(read(out.resolve("refusals/no-tier-for-audience/exit"))).isEqualTo("1");
        assertThat(read(out.resolve("refusals/no-tier-for-audience/diagnostics.json")))
                .contains("E_NO_TIER_FOR_AUDIENCE");
    }

    @Test
    void aSetTheRunAcceptsLeavesAnEmptyRefusalAndExitZero(@TempDir Path root) throws IOException {
        Path examples = root.resolve("examples");
        Path out = root.resolve("out");
        copy(Examples.of("minimal/notes.project.yml"), examples.resolve("refusals/holds/notes.project.yml"));
        touch(examples.resolve("refusals/holds.diagnostics.json"));

        Outputs.write(examples, out);

        assertThat(read(out.resolve("refusals/holds/diagnostics.json"))).isEqualTo("[]");
        assertThat(read(out.resolve("refusals/holds/exit"))).isEqualTo("0");
    }

    /**
     * The file every oracle under {@code examples} is paired with, and the exit code beside it, read
     * from the oracles rather than from the run, so a case the run skipped is a missing file here.
     */
    private static List<String> everyCasesPairedFile(Path examples) throws IOException {
        try (Stream<Path> tree = Files.walk(examples)) {
            return tree.flatMap(oracle -> pairedFiles(examples, oracle))
                    .sorted()
                    .toList();
        }
    }

    private static Stream<String> pairedFiles(Path examples, Path oracle) {
        String name = oracle.getFileName().toString();
        if (oracle.endsWith("expected/intent.json")) {
            String directory = relative(examples, oracle.getParent().getParent());
            return Stream.of(directory + "/exit", directory + "/intent.json", directory + "/intent.xmi");
        }
        if (name.endsWith(".diagnostics.json")) {
            String directory = "refusals/" + name.replace(".diagnostics.json", "");
            return Stream.of(directory + "/diagnostics.json", directory + "/exit");
        }
        return Stream.empty();
    }

    /** A case the pipeline accepts, copied out of the real examples with an oracle beside it. */
    private static void accepted(Path examples, String name) throws IOException {
        copyDocuments(Examples.of(name), examples.resolve(name));
        touch(examples.resolve(name).resolve("expected").resolve("intent.json"));
    }

    /** A case the pipeline refuses, whether its input is one file or a set, with an oracle beside it. */
    private static void refused(Path examples, String stem) throws IOException {
        Path source = Examples.of("refusals/" + stem);
        Path refusals = examples.resolve("refusals");
        if (Files.isDirectory(source)) {
            copyDocuments(source, refusals.resolve(stem));
        } else {
            copy(Examples.of("refusals/" + stem + ".project.yml"), refusals.resolve(stem + ".project.yml"));
        }
        touch(refusals.resolve(stem + ".diagnostics.json"));
    }

    /** Every authored document of {@code source}, and nothing else a case's directory happens to hold. */
    private static void copyDocuments(Path source, Path directory) throws IOException {
        try (Stream<Path> tree = Files.list(source)) {
            for (Path document : tree.filter(
                            path -> path.getFileName().toString().endsWith(".yml"))
                    .toList()) {
                copy(document, directory.resolve(document.getFileName()));
            }
        }
    }

    private static void copy(Path source, Path target) throws IOException {
        Files.createDirectories(target.getParent());
        Files.copy(source, target);
    }

    private static void touch(Path file) throws IOException {
        Files.createDirectories(file.getParent());
        Files.writeString(file, "");
    }

    /** Every file under {@code root}, relative to it, sorted, with {@code /} between segments. */
    private static List<String> files(Path root) throws IOException {
        try (Stream<Path> tree = Files.walk(root)) {
            return tree.filter(Files::isRegularFile)
                    .map(file -> relative(root, file))
                    .sorted()
                    .toList();
        }
    }

    private static String relative(Path root, Path file) {
        return root.relativize(file).toString().replace(File.separatorChar, '/');
    }

    private static String read(Path file) {
        try {
            return Files.readString(file, StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    private static void deleteTree(Path root) throws IOException {
        if (!Files.exists(root)) {
            return;
        }
        try (Stream<Path> tree = Files.walk(root)) {
            for (Path path : tree.sorted(Comparator.reverseOrder()).toList()) {
                Files.delete(path);
            }
        }
    }
}
