package dev.jorisjonkers.deploykit.emf.cli;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import org.junit.jupiter.api.Test;

/** What a refusal carries: the code, the document and the path the parity contract compares, and a message. */
class DiagnosticTest {

    @Test
    void aDiagnosticCarriesItsCodeDocumentPathAndMessage() {
        Diagnostic diagnostic = new Diagnostic(
                Diagnostic.SCHEMA, "notes.project.yml", "/applications/0/processes/0/runtime", "refused");

        assertThat(diagnostic.code()).isEqualTo("schema");
        assertThat(diagnostic.document()).isEqualTo("notes.project.yml");
        assertThat(diagnostic.path()).isEqualTo("/applications/0/processes/0/runtime");
        assertThat(diagnostic.message()).isEqualTo("refused");
    }

    @Test
    void aParsedDocumentIsEitherAnIntentOrRefusals() {
        Diagnostic diagnostic = new Diagnostic(Diagnostic.SCHEMA, "notes.project.yml", "", "refused");

        assertThat(Parsed.refused(List.of(diagnostic)).ok()).isFalse();
        assertThat(Parsed.refused(List.of(diagnostic)).intent()).isEmpty();
        assertThat(Parsed.of(java.util.Map.of("project", "notes")).ok()).isTrue();
        assertThat(Parsed.of(java.util.Map.of("project", "notes")).diagnostics())
                .isEmpty();
    }
}
