package dev.jorisjonkers.deploykit.emf.cli;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.tuple;

import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.Application;
import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.Project;
import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.ProjectIntentFactory;
import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.Sidecar;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

/**
 * Where the pipeline decides what its constraints cannot see: a Process's env files reach it before it
 * is checked, what a Process holds across the union is asked only of a document that holds on its own,
 * and the mesh's Projects and the images lock are read beside the documents.
 */
class PipelineRefusalsTest {

    /** A Process holding a `self` grant, which it can read only through its own Vault client. */
    private static final String SELF = """
            apiVersion: intent.jorisjonkers.dev/v1
            kind: Project
            schemaVersion: 1.0.0
            project: refusals
            owner: joris
            applications:
              - id: reader
                processes:
                  - name: reader-api
                    lifecycle: application
                    image: reader-api
                    runtime: node
                    placement: { memory: 128Mi, cpu: 25m }
                    probes: none
                    cutover: interrupted
                    secrets:
                      - path: secret/data/refusals-system/token
                        keys: [token]
                        access: read
                        delivery: self
                        rotation: { tolerates: restart }
            """;

    private static Path project(Path directory, boolean wired) throws IOException {
        Files.createDirectories(directory);
        Path file = Examples.write(directory, "refusals.project.yml", SELF);
        if (wired) {
            Files.createDirectories(directory.resolve("env/reader-api"));
            Files.writeString(directory.resolve("env/reader-api/base.env"), "VAULT_ROLE=${identity:vaultRole}\n");
        }
        return file;
    }

    private static List<String> codes(List<Diagnostic> diagnostics) {
        return diagnostics.stream().map(Diagnostic::code).toList();
    }

    @Test
    void aProcessIsCheckedWithTheEnvFilesBesideItsProjectFile(@TempDir Path directory) throws IOException {
        Path unwired = project(directory.resolve("unwired"), false);
        Path wired = project(directory.resolve("wired"), true);

        assertThat(Pipeline.intent(unwired).diagnostics())
                .extracting(Diagnostic::code, Diagnostic::document, Diagnostic::path)
                .containsExactly(
                        tuple("E_SELF_WITHOUT_VAULT_CLIENT", "refusals.project.yml", "/applications/0/processes/0"));
        assertThat(codes(Pipeline.effective(unwired).diagnostics())).containsExactly("E_SELF_WITHOUT_VAULT_CLIENT");
        assertThat(codes(Pipeline.check(List.of(unwired)))).containsExactly("E_SELF_WITHOUT_VAULT_CLIENT");
        assertThat(Pipeline.intent(wired).ok()).isTrue();
        assertThat(Pipeline.effective(wired).ok()).isTrue();
        assertThat(Pipeline.check(List.of(wired))).isEmpty();
    }

    @Test
    void anEnvScopeThatNamesNothingIsRefusedOnlyOfADocumentThatHolds(@TempDir Path directory) throws IOException {
        Path file = project(directory, true);
        Files.createDirectories(directory.resolve("env/ghost"));
        Files.writeString(directory.resolve("env/ghost/base.env"), "A=b\n");

        List<Diagnostic> refusals = Pipeline.effective(file).diagnostics();
        assertThat(codes(refusals)).containsExactly("E_UNKNOWN_ENV_SCOPE");
        assertThat(refusals.get(0).path()).endsWith("env/ghost/base.env");
        Files.writeString(file, SELF.replace("delivery: self", "delivery: self\n            colour: red"));
        assertThat(codes(Pipeline.effective(file).diagnostics())).doesNotContain("E_UNKNOWN_ENV_SCOPE");
    }

    @Test
    void aDocumentWithNoContentIsRefusedForItsShape(@TempDir Path directory) {
        Path empty = Examples.write(directory, "refusals.project.yml", "");

        assertThat(codes(Pipeline.intent(empty).diagnostics())).containsExactly(Diagnostic.SCHEMA);
        Path comment = Examples.write(directory, "comment.project.yml", "# a project file that declares nothing\n");
        assertThat(codes(Pipeline.intent(comment).diagnostics())).containsExactly(Diagnostic.SCHEMA);
    }

    @Test
    void theFilesAProjectShipsAreReadBesideIt(@TempDir Path directory) throws IOException {
        Path file = Examples.write(
                directory,
                "refusals.project.yml",
                SELF.replace("delivery: self", "delivery: env")
                        .replace(
                                "    processes:",
                                "    dashboards:\n      - from: board.json\n      - from: absent.json\n    processes:"));
        Examples.write(directory, "board.json", "{\"uid\": \"board\"}");

        assertThat(Pipeline.check(List.of(file)))
                .extracting(Diagnostic::code, Diagnostic::path)
                .containsExactly(tuple(ShippedFiles.DASHBOARD_NOT_FOUND, "/applications/0/dashboards/1/from"));
    }

    @Test
    void aShippedFileThatCannotBeReadFailsTheCheckRatherThanReadingAsAbsent(@TempDir Path directory)
            throws IOException {
        Path file = Examples.write(
                directory,
                "refusals.project.yml",
                SELF.replace("delivery: self", "delivery: env")
                        .replace("    processes:", "    dashboards:\n      - from: board.json\n    processes:"));
        Path board = Examples.write(directory, "board.json", "{\"uid\": \"board\"}");
        Files.setPosixFilePermissions(board, java.util.Set.of());
        try {
            assertThatThrownBy(() -> Pipeline.check(List.of(file)))
                    .isInstanceOf(UncheckedIOException.class)
                    .hasStackTraceContaining("textBeside");
        } finally {
            Files.setPosixFilePermissions(board, java.nio.file.attribute.PosixFilePermissions.fromString("rw-------"));
        }
    }

    @Test
    void whatAProcessHoldsAcrossTheUnionIsAskedOnlyOfADocumentThatHolds() {
        // The owner role's `self` grant is wired by no Vault client, and is refused for the owner role alone.
        assertThat(Pipeline.intent(Examples.of("refusals/owner-role-granted.project.yml"))
                        .diagnostics())
                .extracting(Diagnostic::code, Diagnostic::path)
                .containsExactly(tuple("E_OWNER_ROLE_GRANTED", "/applications/0/processes/0/secrets/0"));
    }

    @Test
    void aProjectTheMeshEnrolsIsOneAProjectFileDeclares() {
        Path set = Examples.of("refusals/unknown-enrolled-project");

        assertThat(Pipeline.check(List.of(set.resolve("platform.intent.yml"), set.resolve("refusals.project.yml"))))
                .extracting(Diagnostic::code, Diagnostic::document, Diagnostic::path, Diagnostic::message)
                .containsExactly(tuple(
                        "E_UNKNOWN_ENROLLED_PROJECT",
                        "platform.intent.yml",
                        "/mesh/enrolled/1",
                        "no project file declares the Project notes the mesh enrols"));
        Path meshless = Examples.of("refusals/asset-not-found");
        assertThat(codes(Pipeline.check(List.of(meshless.resolve("platform.intent.yml")))))
                .doesNotContain("E_UNKNOWN_ENROLLED_PROJECT");
    }

    @Test
    void theL4AddressesAndTiersAreCheckedAgainstTheProjectFilesBesideThem() {
        Path set = Examples.of("refusals/tier-surface-missing");

        assertThat(Pipeline.check(List.of(set.resolve("platform.intent.yml"), set.resolve("refusals.project.yml"))))
                .extracting(Diagnostic::code, Diagnostic::document, Diagnostic::path)
                .containsExactly(tuple("E_TIER_SURFACE_MISSING", "platform.intent.yml", "/tiers/0"));
    }

    @Test
    void anImageTheLockHoldsAsRootIsRefusedAtTheLock(@TempDir Path directory) throws IOException {
        Path set = Examples.of("refusals/image-runs-as-root");
        Path project = set.resolve("refusals.project.yml");
        Path lock = set.resolve("images.lock.yml");

        assertThat(Pipeline.check(List.of(lock, project)))
                .extracting(Diagnostic::code, Diagnostic::document, Diagnostic::path, Diagnostic::message)
                .containsExactly(tuple(
                        "E_IMAGE_RUNS_AS_ROOT",
                        "images.lock.yml",
                        "/images/api",
                        "the images lock holds api with uid 0, and every pod runs as non-root"));
        String text = Files.readString(lock);
        Path copy = Examples.write(directory, "refusals.project.yml", Files.readString(project));
        Examples.write(directory, "images.lock.yml", text.replace("uid: 0", "uid: 1000"));
        assertThat(Pipeline.check(List.of(directory.resolve("images.lock.yml"), copy)))
                .isEmpty();
        Examples.write(directory, "images.lock.yml", text + "\nimages: [");
        assertThat(Pipeline.check(List.of(directory.resolve("images.lock.yml"), copy)))
                .isEmpty();
        Examples.write(directory, "images.lock.yml", "");
        assertThat(Pipeline.check(List.of(directory.resolve("images.lock.yml"), copy)))
                .isEmpty();
        Examples.write(directory, "images.lock.yml", "# a lock that locks nothing\n");
        assertThat(Pipeline.check(List.of(directory.resolve("images.lock.yml"), copy)))
                .isEmpty();
    }

    @Test
    void anImageRunsAsItsOwnUserForAProcessOrAMigrationAndASidecarsIsLockedButNotAsked() {
        ProjectIntentFactory model = ProjectIntentFactory.eINSTANCE;
        Project project = model.createProject();
        Application application = model.createApplication();
        application.setId("api");
        application.setMigration(model.createManagedMigration());
        var process = model.createProcess();
        process.setImage("api");
        Sidecar sidecar = model.createSidecar();
        sidecar.setImage("exporter");
        process.getSidecars().add(sidecar);
        application.getProcesses().add(process);
        project.getApplications().add(application);

        assertThat(Pipeline.rootAliases(Map.of("api", 0, "api-migration", 0, "exporter", 0), List.of(project)))
                .containsExactly("api", "api-migration");
        assertThat(Pipeline.rootAliases(Map.of("api", 1000, "api-migration", 0, "exporter", 0), List.of(project)))
                .containsExactly("api-migration");
        // An alias the lock does not hold, the sidecar's too, is the share's own refusal.
        assertThat(Pipeline.rootAliases(Map.of("api", 0, "api-migration", 0), List.of(project)))
                .isEmpty();
        assertThat(Pipeline.rootAliases(Map.of("api", 0, "exporter", 0), List.of(project)))
                .isEmpty();
        // An image that moves its own schema, or moves none, runs no migration image.
        application.setMigration(model.createSelfMigration());
        assertThat(Pipeline.rootAliases(Map.of("api", 0, "exporter", 0), List.of(project)))
                .containsExactly("api");
    }
}
