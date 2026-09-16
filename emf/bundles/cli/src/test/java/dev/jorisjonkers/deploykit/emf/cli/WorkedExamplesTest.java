package dev.jorisjonkers.deploykit.emf.cli;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.stream.Stream;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;

/** Scratch: every worked example parses. */
class WorkedExamplesTest {

    private static List<Path> projectFiles() {
        Path examples = repository().resolve("spec/v1/examples");
        try (Stream<Path> tree = Files.walk(examples)) {
            return tree.filter(path -> path.getFileName().toString().endsWith(".project.yml"))
                    .filter(path -> !path.toString().contains("refusals"))
                    .sorted()
                    .toList();
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("projectFiles")
    void everyWorkedExampleParses(Path file) {
        Parsed parsed = Pipeline.intent(file);

        assertThat(parsed.diagnostics()).isEmpty();
    }

    private static Path repository() {
        Path dir = Path.of("").toAbsolutePath();
        while (!Files.isRegularFile(dir.resolve("emf/pom.xml"))) {
            dir = dir.getParent();
        }
        return dir;
    }
}
