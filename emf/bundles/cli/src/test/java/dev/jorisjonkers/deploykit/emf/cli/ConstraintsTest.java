package dev.jorisjonkers.deploykit.emf.cli;

import static org.assertj.core.api.Assertions.assertThat;

import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.ProjectIntentPackage;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

/** The constraints a parsed document answers, and the diagnostics a violation becomes. */
class ConstraintsTest {

    private static final String REFUSED = """
            apiVersion: intent.jorisjonkers.dev/v1
            kind: Project
            schemaVersion: 1.0.0
            project: refusals
            owner: joris
            applications:
              - id: unwired
                observability:
                  alertClass: page
                processes:
                  - name: unwired-worker
                    lifecycle: application
                    image: unwired-worker
                    runtime: node
                    placement:
                      memory: 128Mi
                      cpu: 25m
                    cutover: continuous
            """;

    private static Path file(Path directory, String text) throws IOException {
        Path file = directory.resolve("unwired.project.yml");
        Files.writeString(file, text);
        return file;
    }

    @Test
    void aViolationCarriesTheInvariantsNameAndThePointerOfWhatItRefused(@TempDir Path directory) throws IOException {
        Parsed parsed = Pipeline.intent(file(directory, REFUSED));

        assertThat(parsed.ok()).isFalse();
        assertThat(parsed.intent()).isEmpty();
        assertThat(parsed.diagnostics()).singleElement().satisfies(diagnostic -> {
            assertThat(diagnostic.code()).isEqualTo("E_ALERT_CLASS_WITHOUT_SIGNAL");
            assertThat(diagnostic.document()).isEqualTo("unwired.project.yml");
            assertThat(diagnostic.path()).isEqualTo("/applications/0/observability");
            assertThat(diagnostic.message()).contains("E_ALERT_CLASS_WITHOUT_SIGNAL");
        });
    }

    private static final String ACCEPTED = """
            apiVersion: intent.jorisjonkers.dev/v1
            kind: Project
            schemaVersion: 1.0.0
            project: refusals
            owner: joris
            applications:
              - id: wired
                observability:
                  alertClass: page
                  scrape:
                    process: wired-worker
                    surface: http
                    path: /metrics
                processes:
                  - name: wired-worker
                    lifecycle: application
                    image: wired-worker
                    runtime: node
                    provides:
                      http: 8080
                    placement:
                      memory: 128Mi
                      cpu: 25m
                    cutover: continuous
            """;

    @Test
    void aDocumentThatBreaksNoConstraintCarriesNoDiagnostic(@TempDir Path directory) throws IOException {
        Parsed parsed = Pipeline.intent(file(directory, ACCEPTED));

        assertThat(parsed.diagnostics()).isEmpty();
        assertThat(parsed.intent()).containsKey("applications");
    }

    @Test
    void theConstraintsAreTheFileTheMetamodelCarries() {
        assertThat(Constraints.beside(ProjectIntentPackage.class, "project-intent.ocl")
                        .toString())
                .endsWith("project-intent.ocl");
    }
}
