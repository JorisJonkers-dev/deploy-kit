package dev.jorisjonkers.deploykit.emf.cli;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;

/**
 * Every worked example parses, and so does every refusal fixture the refusals README marks
 * `accepted`: the counterpart that makes a refusal a refusal rather than the only thing the rules
 * can see.
 */
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

    /** The `accepted` rows of `spec/v1/examples/refusals/README.md`, as the files they name. */
    private static List<Path> acceptedCounterparts() {
        Path refusals = repository().resolve("spec/v1/examples/refusals");
        Pattern row = Pattern.compile("^\\| \\[`([^`]+\\.project\\.yml)`\\]\\([^)]+\\) \\| accepted \\|");
        try (Stream<String> lines = Files.lines(refusals.resolve("README.md"))) {
            return lines.map(row::matcher)
                    .filter(Matcher::find)
                    .map(match -> refusals.resolve(match.group(1)))
                    .sorted()
                    .toList();
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    /**
     * The accepted counterparts main's own validate refuses all the same, each with the codes it
     * refuses them with: the README's row predates the rule. shared-intent-merged's worker holds a
     * grant delivered self and wires no Vault client, which main refuses with
     * E_SELF_WITHOUT_VAULT_CLIENT since that rule landed.
     */
    private static final java.util.Map<String, List<String>> REFUSED_BY_MAIN_TOO =
            java.util.Map.of("shared-intent-merged.project.yml", List.of("E_SELF_WITHOUT_VAULT_CLIENT"));

    @ParameterizedTest(name = "{0}")
    @MethodSource("acceptedCounterparts")
    void everyAcceptedCounterpartParses(Path file) {
        Parsed parsed = Pipeline.intent(file);

        assertThat(parsed.diagnostics())
                .extracting(Diagnostic::code)
                .containsExactlyElementsOf(
                        REFUSED_BY_MAIN_TOO.getOrDefault(file.getFileName().toString(), List.of()));
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
