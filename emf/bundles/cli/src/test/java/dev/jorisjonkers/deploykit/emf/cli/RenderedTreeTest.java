package dev.jorisjonkers.deploykit.emf.cli;

import static org.assertj.core.api.Assertions.assertThat;

import dev.jorisjonkers.deploykit.emf.metamodel.resolveddeployment.ResolvedDeployment;
import dev.jorisjonkers.deploykit.emf.render.Rendering;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

/**
 * The transformation's output rendered by the Acceleo templates (issue #95): each case the
 * production implementation renders equals its committed tree byte for byte, the estate-scoped share
 * minimal and data hold between them equals the committed estate tree, and a second run writes the
 * same bytes as the first.
 */
class RenderedTreeTest {

    private static ResolvedDeployment resolved(String example) throws IOException {
        Outputs.Resolving resolving = Outputs.RESOLVED.get(example);
        Resolved resolved = Pipeline.resolve(
                resolving.documents().stream().map(Examples::of).toList(), resolving.project(), Outputs.INTEGRITY);
        assertThat(resolved.diagnostics()).isEmpty();
        return resolved.deployment();
    }

    private static List<Path> filesUnder(Path root) throws IOException {
        try (Stream<Path> walk = Files.walk(root)) {
            return walk.filter(Files::isRegularFile)
                    .map(root::relativize)
                    .filter(file -> !file.toString().equals("README.md"))
                    .sorted()
                    .toList();
        }
    }

    private static void assertSameTree(Path rendered, Path committed) throws IOException {
        assertThat(filesUnder(rendered)).isEqualTo(filesUnder(committed));
        for (Path file : filesUnder(committed)) {
            assertThat(Files.readString(rendered.resolve(file)))
                    .as(file.toString())
                    .isEqualTo(Files.readString(committed.resolve(file)));
        }
    }

    @ParameterizedTest(name = "{0}")
    @CsvSource({"minimal, notes", "data, data"})
    void aProjectsShareIsItsCommittedTreeByteForByte(String example, String project, @TempDir Path out)
            throws IOException {
        Rendering.render(List.of(resolved(example)), out);

        Path share = Path.of("apps", project);
        assertSameTree(out.resolve(share), Examples.of(example + "/rendered").resolve(share));
    }

    @Test
    void theEstateShareMinimalAndDataHoldBetweenThemIsTheCommittedEstateTree(@TempDir Path out) throws IOException {
        Rendering.render(List.of(resolved("minimal"), resolved("data")), out);

        // Everything outside the two projects' own directories is the estate's.
        Path estate = Examples.of("_estate/rendered");
        for (Path file : filesUnder(estate)) {
            assertThat(Files.readString(out.resolve(file)))
                    .as(file.toString())
                    .isEqualTo(Files.readString(estate.resolve(file)));
        }
        assertThat(filesUnder(out).stream()
                        .filter(file -> !file.startsWith("apps/notes") && !file.startsWith("apps/data"))
                        .toList())
                .isEqualTo(filesUnder(estate));
    }

    @Test
    void renderingTwiceFromTheSameInputsWritesTheSameBytes(@TempDir Path first, @TempDir Path second)
            throws IOException {
        Rendering.render(List.of(resolved("minimal"), resolved("data")), first);
        Rendering.render(List.of(resolved("minimal"), resolved("data")), second);

        assertSameTree(second, first);
    }
}
