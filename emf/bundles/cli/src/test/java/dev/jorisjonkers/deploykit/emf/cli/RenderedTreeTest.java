package dev.jorisjonkers.deploykit.emf.cli;

import static org.assertj.core.api.Assertions.assertThat;

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
 * The pipeline's one entry, from the documents to the tree (issues #95 and #96): each case the
 * production implementation renders equals its committed tree byte for byte, the estate-scoped share
 * minimal and data hold between them equals the committed estate tree, a second run writes the same
 * bytes as the first, and a set the checks refuse writes nothing.
 */
class RenderedTreeTest {

    private static List<Path> union() {
        return Outputs.RENDERED_UNION.documents().stream().map(Examples::of).toList();
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
    @CsvSource({"minimal, notes", "data, data", "delivery, delivery"})
    void aProjectsShareIsItsCommittedTreeByteForByte(String example, String project, @TempDir Path out)
            throws IOException {
        assertThat(Pipeline.render(union(), List.of(project), Outputs.INTEGRITY, out))
                .isEmpty();

        Path share = Path.of("apps", project);
        assertSameTree(out.resolve(share), Examples.of(example + "/rendered").resolve(share));
    }

    @Test
    void authsShareAndTheEstateShareItDerivesAreItsCommittedTreeByteForByte(@TempDir Path out) throws IOException {
        assertThat(Pipeline.render(
                        Outputs.AUTH_UNION.documents().stream()
                                .map(Examples::of)
                                .toList(),
                        Outputs.AUTH_UNION.projects(),
                        Outputs.INTEGRITY,
                        out))
                .isEmpty();

        assertSameTree(out, Examples.of("auth/rendered"));
    }

    @Test
    void theKnowledgePlatformsShareAndTheEstateShareItDerivesAreItsCommittedTreeByteForByte(@TempDir Path out)
            throws IOException {
        assertThat(Pipeline.render(
                        Outputs.KNOWLEDGE_PLATFORM_UNION.documents().stream()
                                .map(Examples::of)
                                .toList(),
                        Outputs.KNOWLEDGE_PLATFORM_UNION.projects(),
                        Outputs.INTEGRITY,
                        out))
                .isEmpty();

        assertSameTree(out, Examples.of("knowledge-platform/rendered"));
    }

    @Test
    void theEstateShareMinimalAndDataHoldBetweenThemIsTheCommittedEstateTree(@TempDir Path out) throws IOException {
        assertThat(Pipeline.render(union(), Outputs.RENDERED_UNION.projects(), Outputs.INTEGRITY, out))
                .isEmpty();

        // Everything under estate/ is the estate's, and no project's.
        Path estate = Examples.of("_estate/rendered");
        for (Path file : filesUnder(estate)) {
            assertThat(Files.readString(out.resolve(file)))
                    .as(file.toString())
                    .isEqualTo(Files.readString(estate.resolve(file)));
        }
        assertThat(filesUnder(out).stream()
                        .filter(file -> file.startsWith("estate"))
                        .toList())
                .isEqualTo(filesUnder(estate));
    }

    /**
     * The knowledge platform's set with the datastore's own project on the estate path: its catalog is
     * applied from that project's unit, under the Job name the production implementation derives from
     * the same catalog and method, and no estate-scoped unit applies it (issue #482).
     */
    @Test
    void aDatastoreOnTheEstatePathAppliesItsCatalogFromItsOwnProject(@TempDir Path directory, @TempDir Path out)
            throws IOException {
        Path platform = Examples.write(
                directory,
                "platform.intent.yml",
                Examples.read("platform/platform.intent.yml")
                        .replace("legacy: [auth, data, knowledge, notes]", "legacy: [auth, knowledge, notes]")
                        .replace(
                                "estate: [delivery, edge, knowledge-platform, observability, secrets]",
                                "estate: [data, delivery, edge, knowledge-platform, observability, secrets]")
                        .replaceAll("\n {2}serving:\n( {4}.*\n| {6}.*\n)+", "\n"));
        List<Path> files = Outputs.KNOWLEDGE_PLATFORM_UNION.documents().stream()
                .map(file -> file.equals("platform/platform.intent.yml") ? platform : Examples.of(file))
                .toList();

        assertThat(Pipeline.render(files, List.of("data", "knowledge-platform"), Outputs.INTEGRITY, out))
                .isEmpty();

        Path owned = Path.of("apps/data/platform-postgres");
        assertThat(Files.readString(out.resolve(owned.resolve("postgres-catalog.yaml"))))
                .contains("  name: postgres-catalog-565e7844099d\n")
                .contains("{\"admin\":{\"password\":\"password\",\"path\":\"secret/data/data/postgres/catalog\","
                        + "\"user\":\"user\"},\"connection\":\"postgres\",\"databases\":[{\"data\":\"knowledge-platform-data\","
                        + "\"name\":\"knowledge-platform_db\",\"owner\":\"knowledge-platform-owner\"}],"
                        + "\"host\":\"postgres.data-system.svc.cluster.local\",\"port\":5432}");
        assertThat(out.resolve(owned.resolve("postgres-catalog-networkpolicy.yaml")))
                .isRegularFile();
        assertThat(Files.readString(out.resolve(owned.resolve("kustomization.yaml"))))
                .contains("  - postgres-catalog.yaml\n");
        assertThat(out.resolve("estate/vso-secrets/postgres-catalog.yaml")).doesNotExist();
        assertThat(Files.readString(out.resolve("estate/vso-secrets/kustomization.yaml")))
                .doesNotContain("postgres-catalog");
        assertThat(out.resolve("estate/vso-secrets/policies/data-system-postgres-catalog.policy.json"))
                .isRegularFile();
    }

    @Test
    void renderingTwiceFromTheSameInputsWritesTheSameBytes(@TempDir Path first, @TempDir Path second)
            throws IOException {
        Pipeline.render(union(), Outputs.RENDERED_UNION.projects(), Outputs.INTEGRITY, first);
        Pipeline.render(union(), Outputs.RENDERED_UNION.projects(), Outputs.INTEGRITY, second);

        assertSameTree(second, first);
    }

    @Test
    void aSetTheChecksRefuseWritesNothingAndSaysWhy(@TempDir Path directory, @TempDir Path out) throws IOException {
        Path broken = Examples.write(
                directory,
                "notes.project.yml",
                Examples.read("minimal/notes.project.yml").replace("surface: http }", "surface: grpc }"));
        List<Path> files = Outputs.RENDERED_UNION.documents().stream()
                .map(file -> file.equals("minimal/notes.project.yml") ? broken : Examples.of(file))
                .toList();

        assertThat(Pipeline.render(files, Outputs.RENDERED_UNION.projects(), Outputs.INTEGRITY, out))
                .extracting(Diagnostic::code)
                .contains("E_UNKNOWN_SURFACE");
        assertThat(filesUnder(out)).isEmpty();
    }
}
