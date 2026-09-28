package dev.jorisjonkers.deploykit.emf.cli;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.Application;
import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.Project;
import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.ProjectIntentFactory;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import org.eclipse.emf.common.util.URI;
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
                    cutover: continuous
            """;

    private static Path file(Path directory, String text) throws IOException {
        Path file = directory.resolve("notes.project.yml");
        Files.writeString(file, text);
        return file;
    }

    @Test
    void aModelIsWrittenAsXmiWithItsForeignNamesRelativeToTheFileBesideIt() throws IOException {
        // The Platform document alone: its tiers' proxies name Applications no file read with it
        // declares, so they stay proxies, and a proxy is written against the authored file, never as
        // a path on the machine that ran the pipeline.
        String platform = Pipeline.xmi(Examples.of("platform/platform.intent.yml"));

        assertThat(platform).contains("projectintent:Platform").contains("href=\"platform.intent.yml#");
        assertThat(platform).doesNotContain("file:");
    }

    @Test
    void aSetIsWrittenAsXmiWhoseDocumentsLinkToEachOther() throws IOException {
        // The tier's proxy names an Application the project file beside it declares, so read together
        // the Platform document's XMI refers to the project file's XMI, not to either authored file,
        // and each XMI is named after its authored file.
        Path platform = Examples.of("refusals/no-tier-for-audience/platform.intent.yml");
        Path project = Examples.of("refusals/no-tier-for-audience/refusals.project.yml");

        Map<Path, String> xmi = Pipeline.xmi(List.of(platform, project));

        assertThat(xmi).containsOnlyKeys(platform, project);
        assertThat(xmi.get(platform))
                .contains("href=\"refusals.project.xmi#//@applications.1\"")
                .doesNotContain(".yml#")
                .doesNotContain("file:");
        // The Application `api` and its Process `api` share a name, so a link is written as a path,
        // which names one object when the file is read back, rather than as the ambiguous ID.
        assertThat(xmi.get(project))
                .contains("projectintent:Project")
                .contains("process=\"//@applications.0/@processes.0\"")
                .doesNotContain("process=\"api\"");
        assertThat(Pipeline.xmiName(project)).isEqualTo("refusals.project.xmi");
    }

    @Test
    void anObjectIsNamedByItsPathFromTheRootNeverByItsId() {
        Project project = ProjectIntentFactory.eINSTANCE.createProject();
        Application application = ProjectIntentFactory.eINSTANCE.createApplication();
        application.setId("notes");
        project.getApplications().add(application);
        Pipeline.ByPath names = new Pipeline.ByPath(URI.createURI("notes.project.xmi"));

        assertThat(names.getURIFragment(project)).isEqualTo("/");
        assertThat(names.getURIFragment(application)).isEqualTo("//@applications.0");
    }

    @Test
    void anEmptyDocumentHasNoModelToWrite(@TempDir Path directory) throws IOException {
        assertThat(Pipeline.xmi(List.of(file(directory, "")))).isEmpty();
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
    void theRetiredCutoverValuesAreOutsideTheGrammar(@TempDir Path directory) throws IOException {
        for (String retired : new String[] {"rolling", "recreate"}) {
            Parsed parsed =
                    Pipeline.intent(file(directory, MINIMAL.replace("cutover: continuous", "cutover: " + retired)));

            assertThat(parsed.ok()).as(retired).isFalse();
            assertThat(parsed.diagnostics()).extracting(Diagnostic::code).containsOnly(Diagnostic.SCHEMA);
        }
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
