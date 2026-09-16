package dev.jorisjonkers.deploykit.emf.cli;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.IOException;
import java.io.UncheckedIOException;
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
                    assertThat(diagnostic.document()).isEqualTo("notes.project.yml");
                    assertThat(diagnostic.path()).isEmpty();
                    assertThat(diagnostic.message()).startsWith("line ");
                })
                .isNotEmpty();
    }

    @Test
    void aNameThatLinksToNothingIsRefusedAtThePointerOfWhatWroteIt(@TempDir Path directory) throws IOException {
        String routed = MINIMAL.replace("applications:\n  - id: notes\n", """
                applications:
                  - id: notes
                    exposure:
                      - name: public
                        host: notes.jorisjonkers.dev
                        audience: lan
                        routes:
                          - { path: /, match: prefix, process: notes-api, surface: https }
                """)
                .replace("    runtime: node\n", "    runtime: node\n        provides: { http: 8080 }\n");

        Parsed parsed = Pipeline.intent(file(directory, routed));

        assertThat(parsed.diagnostics())
                .extracting(Diagnostic::code, Diagnostic::document, Diagnostic::path)
                .containsExactly(org.assertj.core.groups.Tuple.tuple(
                        "E_UNKNOWN_SURFACE", "notes.project.yml", "/applications/0/exposure/0/routes/0"));
    }

    @Test
    void anEmptyDocumentIsRefused(@TempDir Path directory) throws IOException {
        Parsed parsed = Pipeline.intent(file(directory, ""));

        assertThat(parsed.diagnostics())
                .extracting(Diagnostic::message)
                .contains("notes.project.yml holds no document");
    }

    @Test
    void aFileThatCannotBeReadIsAnErrorRatherThanARefusal(@TempDir Path directory) {
        assertThatThrownBy(() -> Pipeline.intent(directory.resolve("missing.project.yml")))
                .isInstanceOf(UncheckedIOException.class);
    }
}
