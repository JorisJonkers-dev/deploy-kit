package dev.jorisjonkers.deploykit.emf.cli;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

/** The pipeline entry: an authored file in, its intent or the diagnostics that refused it out. */
class PipelineTest {

    private static final String MINIMAL = """
            apiVersion: intent.jorisjonkers.dev/v1
            kind: Project
            schemaVersion: 1.0.0
            project: notes
            owner: joris
            applications:
              - id: notes
                processes:
                  - name: notes-api
                    lifecycle: application
                    image: notes-api
                    runtime: node
                    placement:
                      memory: 256Mi
                      cpu: 50m
                    cutover: rolling
            """;

    private static Path file(Path directory, String text) throws IOException {
        Path file = directory.resolve("notes.project.yml");
        Files.writeString(file, text);
        return file;
    }

    @Test
    void anAuthoredDocumentParsesToItsIntent(@TempDir Path directory) throws IOException {
        Parsed parsed = Pipeline.intent(file(directory, MINIMAL));

        assertThat(parsed.ok()).isTrue();
        assertThat(parsed.diagnostics()).isEmpty();
        assertThat(parsed.intent()).containsEntry("project", "notes").containsEntry("owner", "joris");
    }

    @Test
    void yamlOutsideTheGrammarIsRefusedWithADiagnostic(@TempDir Path directory) throws IOException {
        Parsed parsed = Pipeline.intent(file(directory, MINIMAL.replace("runtime: node", "runtime: rust")));

        assertThat(parsed.ok()).isFalse();
        assertThat(parsed.intent()).isEmpty();
        assertThat(parsed.diagnostics())
                .allSatisfy(diagnostic -> {
                    assertThat(diagnostic.code()).isEqualTo(Diagnostic.SCHEMA);
                    assertThat(diagnostic.path()).isEmpty();
                    assertThat(diagnostic.message()).startsWith("line ");
                })
                .isNotEmpty();
    }

    @Test
    void anEmptyDocumentIsRefused(@TempDir Path directory) throws IOException {
        Parsed parsed = Pipeline.intent(file(directory, ""));

        assertThat(parsed.diagnostics())
                .extracting(Diagnostic::message)
                .contains("notes.project.yml holds no document");
    }
}
