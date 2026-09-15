package dev.jorisjonkers.deploykit.emf.parity;

import static org.assertj.core.api.Assertions.assertThat;

import dev.jorisjonkers.deploykit.emf.cli.Parsed;
import dev.jorisjonkers.deploykit.emf.cli.Pipeline;
import dev.jorisjonkers.deploykit.emf.metamodel.descriptor.Descriptor;
import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.ProjectIntentPackage;
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
 * Every case under {@code spec/v1/examples/} that carries an intent oracle, run through the pipeline
 * entry and compared with the committed file byte for byte (docs/architecture.md#the-parity-contract).
 */
class ParityTest {

    private static List<Path> casesWithAnIntentOracle() {
        Path examples = repository().resolve("spec/v1/examples");
        try (Stream<Path> tree = Files.walk(examples)) {
            return tree.filter(path -> path.endsWith("expected/intent.json"))
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
        Parsed parsed = Pipeline.intent(projectFile(directory));

        assertThat(parsed.diagnostics()).isEmpty();
        assertThat(CanonicalJson.write(parsed.intent())).isEqualTo(read(directory.resolve("expected/intent.json")));
    }

    @Test
    void theMetamodelsStructureEqualsTheCommittedDescriptor() throws IOException {
        assertThat(CanonicalJson.write(Descriptor.of(ProjectIntentPackage.eINSTANCE)))
                .isEqualTo(read(repository().resolve("spec/v1/examples/expected/descriptor.json")));
    }

    @Test
    void oneChangedFieldNoLongerMatchesTheOracle() throws IOException {
        Path directory = casesWithAnIntentOracle().get(0);
        Path project = projectFile(directory);
        Path changed = Files.createTempDirectory("parity").resolve(project.getFileName());
        Files.writeString(changed, read(project).replace("owner: joris", "owner: someone-else"));

        assertThat(CanonicalJson.write(Pipeline.intent(changed).intent()))
                .isNotEqualTo(read(directory.resolve("expected/intent.json")));
    }

    private static Path projectFile(Path directory) throws IOException {
        try (Stream<Path> files = Files.list(directory)) {
            return files.filter(path -> path.getFileName().toString().endsWith(".project.yml"))
                    .findFirst()
                    .orElseThrow();
        }
    }

    private static String read(Path path) throws IOException {
        return Files.readString(path, StandardCharsets.UTF_8);
    }

    private static Path repository() {
        Path dir = Path.of("").toAbsolutePath();
        while (!Files.isRegularFile(dir.resolve("emf/pom.xml"))) {
            dir = dir.getParent();
        }
        return dir;
    }
}
