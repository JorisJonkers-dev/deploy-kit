package dev.jorisjonkers.deploykit.emf.cli;

import static org.assertj.core.api.Assertions.assertThat;

import dev.jorisjonkers.deploykit.emf.cli.EnvFiles.Scope;
import dev.jorisjonkers.deploykit.emf.cli.EnvFiles.Source;
import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.EnvLiteral;
import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.EnvVariable;
import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.Placeholder;
import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.PlaceholderKind;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;

/** REQ-037: the dotenv subset chapter 10 fixes, read into the model. */
class EnvFilesTest {

    private static EnvFiles.Read read(String text) {
        return EnvFiles.read(List.of(new Source("env/w/base.env", text)));
    }

    private static List<String> names(EnvFiles.Read read) {
        return read.files().get(0).file().getEntries().stream()
                .map(EnvVariable::getName)
                .toList();
    }

    @Test
    void readsALiteralAPlaceholderCommentsAndBlankLines() {
        EnvFiles.Read read = read("# a comment\n\nMODE=lite\nDB_HOST=${dependency:platform-postgres.host}\n");

        assertThat(read.ok()).as(read.diagnostics().toString()).isTrue();
        assertThat(names(read)).containsExactly("MODE", "DB_HOST");
        List<EnvVariable> entries = read.files().get(0).file().getEntries();
        assertThat(((EnvLiteral) entries.get(0).getValue()).getText()).isEqualTo("lite");
        Placeholder host = (Placeholder) entries.get(1).getValue();
        assertThat(host.getKind()).isEqualTo(PlaceholderKind.DEPENDENCY);
        assertThat(host.getSource()).isEqualTo("platform-postgres.host");
    }

    @Test
    void refusesEveryLineOutsideTheSubset() {
        assertThat(read("MODE\n").ok()).isFalse();
        assertThat(read("=lite\n").ok()).isFalse();
        assertThat(read("9LIVES=yes\n").ok()).isFalse();
        assertThat(read("DSN=${secret:secret/data/p#u}/db\n").ok()).isFalse();
        assertThat(read("DSN=${unknown:x}\n").ok()).isFalse();
        assertThat(read("DSN=${secret}\n").ok()).isFalse();
        assertThat(read("DSN=${:x}\n").ok()).isFalse();
        assertThat(read("DSN=${secret:a}b}\n").ok()).isFalse();
        assertThat(read("DSN=prefix-${secret:x}\n").ok()).isFalse();
        assertThat(read("DSN=${secret:}\n").ok()).isFalse();
        assertThat(read("DSN=\n").ok()).isFalse();
        assertThat(read("TOKEN=a#b\n").ok()).isFalse();
    }

    @Test
    void namesTheLineAndTheFileEveryRefusalConcerns() {
        EnvFiles.Read read = read("A=1\n# a comment\nMODE\n");

        assertThat(read.diagnostics()).singleElement().satisfies(refusal -> {
            assertThat(refusal.document()).isEqualTo("env/w/base.env");
            assertThat(refusal.path()).isEqualTo("env/w/base.env:3");
        });
    }

    @Test
    void carriesEachFileWithThePathAndTheScopeItWasReadUnder() {
        EnvFiles.Scoped scoped = EnvFiles.read(
                        List.of(new Source("platform/env/_applications/knowledge/base.env", "A=1\n")))
                .files()
                .get(0);

        assertThat(scoped.path()).isEqualTo("platform/env/_applications/knowledge/base.env");
        assertThat(scoped.scope().level()).isEqualTo(Scope.Level.APPLICATION);
        assertThat(scoped.scope().name()).isEqualTo("knowledge");
    }

    @Test
    void keepsAnEqualsInsideAValueAndRefusesOneVariableSetTwice() {
        EnvFiles.Read dsn = read("DSN=host=db;port=5432\n");

        assertThat(((EnvLiteral) dsn.files().get(0).file().getEntries().get(0).getValue()).getText())
                .isEqualTo("host=db;port=5432");
        EnvFiles.Read twice = read("MODE=lite\nMODE=full\n");
        assertThat(twice.diagnostics()).extracting(Diagnostic::code).containsExactly("E_SHARED_DECLARATION_DUPLICATED");
    }

    @Test
    void namesTheClusterTargetAnOverlayCarriesAndNoneForBase() {
        assertThat(read("A=1\n").files().get(0).file().getCluster()).isNull();
        EnvFiles.Read overlay = EnvFiles.read(List.of(new Source("env/w/production.env", "A=1\n")));

        assertThat(overlay.files().get(0).file().getCluster()).isEqualTo("production");
    }

    @Test
    void scopesAFileByTheDirectoryThatHoldsIt() {
        assertThat(EnvFiles.scopeOf("platform/env/_project/base.env"))
                .contains(new Scope(Scope.Level.PROJECT, "_project"));
        assertThat(EnvFiles.scopeOf("platform/env/_applications/knowledge/base.env"))
                .contains(new Scope(Scope.Level.APPLICATION, "knowledge"));
        assertThat(EnvFiles.scopeOf("platform/env/knowledge-api/base.env"))
                .get()
                .satisfies(scope -> {
                    assertThat(scope.level()).isEqualTo(Scope.Level.PROCESS);
                    assertThat(scope.name()).isEqualTo("knowledge-api");
                });
        // A scope is a directory, so a file sitting directly in env/ names none,
        // and the Application scope has to say which Application.
        assertThat(EnvFiles.scopeOf("platform/knowledge.project.yml")).isEqualTo(Optional.empty());
        assertThat(EnvFiles.scopeOf("platform/env/w/base.yml")).isEqualTo(Optional.empty());
        assertThat(EnvFiles.scopeOf("platform/env/base.env")).isEqualTo(Optional.empty());
        assertThat(EnvFiles.scopeOf("platform/env/_applications/base.env")).isEqualTo(Optional.empty());
        assertThat(EnvFiles.scopeOf("platform/env/w/deep/base.env")).isEqualTo(Optional.empty());
        assertThat(EnvFiles.read(List.of(new Source("notes.yml", ""))).ok()).isFalse();
    }
}
