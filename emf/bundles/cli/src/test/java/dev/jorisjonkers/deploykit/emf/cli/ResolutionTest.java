package dev.jorisjonkers.deploykit.emf.cli;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import dev.jorisjonkers.deploykit.emf.metamodel.resolveddeployment.ResolvedDeployment;
import dev.jorisjonkers.deploykit.emf.metamodel.resolveddeployment.ResolvedDeploymentPackage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.util.List;
import org.eclipse.emf.common.util.URI;
import org.eclipse.emf.ecore.resource.Resource;
import org.eclipse.emf.ecore.resource.impl.ResourceSetImpl;
import org.eclipse.emf.ecore.util.EcoreUtil;
import org.eclipse.emf.ecore.xmi.impl.XMIResourceFactoryImpl;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

/** The resolution of minimal, through the QVT-Operational transformation (issue #90). */
class ResolutionTest {

    /** minimal, the foundation it composes with, and the pinned inputs beside them. */
    static final List<String> MINIMAL_SET = Outputs.RESOLVED.get("minimal").documents();

    static ResolvedDeployment minimal() throws IOException {
        Resolved resolved =
                Pipeline.resolve(MINIMAL_SET.stream().map(Examples::of).toList(), "notes", Outputs.INTEGRITY);
        assertThat(resolved.diagnostics()).isEmpty();
        return resolved.deployment();
    }

    private static ResolvedDeployment handWritten() {
        ResolvedDeploymentPackage.eINSTANCE.getName();
        ResourceSetImpl resources = new ResourceSetImpl();
        resources.getResourceFactoryRegistry().getExtensionToFactoryMap().put("*", new XMIResourceFactoryImpl());
        Path model =
                Examples.of("").getParent().getParent().getParent().resolve("emf/models/minimal.resolveddeployment");
        Resource resource = resources.getResource(URI.createFileURI(model.toString()), true);
        return (ResolvedDeployment) resource.getContents().get(0);
    }

    private static String xmi(ResolvedDeployment deployment) throws IOException {
        Resource resource = new XMIResourceFactoryImpl().createResource(URI.createURI("resolved.xmi"));
        resource.getContents().add(EcoreUtil.copy(deployment));
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        resource.save(out, null);
        return out.toString(StandardCharsets.UTF_8);
    }

    @Test
    void aResolutionKeepsTheTwoExtentsItWasResolvedFrom() throws IOException {
        Resolved resolved =
                Pipeline.resolve(MINIMAL_SET.stream().map(Examples::of).toList(), "notes", Outputs.INTEGRITY);

        assertThat(resolved.ok()).isTrue();
        // Five authored projects, their five lowerings, and the Platform document.
        assertThat(resolved.intent()).hasSize(11);
        assertThat(resolved.pinned()).hasSize(3);
    }

    @Test
    void aSetTheChecksRefuseIsNeverResolved(@TempDir Path directory) throws IOException {
        Path broken = Examples.write(
                directory,
                "notes.project.yml",
                Examples.read("minimal/notes.project.yml").replace("surface: http }", "surface: grpc }"));
        List<Path> files = MINIMAL_SET.stream()
                .map(file -> file.equals("minimal/notes.project.yml") ? broken : Examples.of(file))
                .toList();

        Resolved resolved = Pipeline.resolve(files, "notes", Outputs.INTEGRITY);

        assertThat(resolved.ok()).isFalse();
        assertThat(resolved.deployment()).isNull();
        assertThat(resolved.intent()).isEmpty();
        assertThat(resolved.diagnostics()).extracting(Diagnostic::code).contains("E_UNKNOWN_SURFACE");
    }

    @Test
    void anEnvFileTheReaderRefusesRefusesTheSet(@TempDir Path directory) throws IOException {
        Path project = Examples.write(directory, "notes.project.yml", Examples.read("minimal/notes.project.yml"));
        java.nio.file.Files.createDirectories(directory.resolve("env/notes-api"));
        Examples.write(directory.resolve("env/notes-api"), "base.env", "NODE_ENV=production\nNODE_ENV=test\n");
        List<Path> files = MINIMAL_SET.stream()
                .map(file -> file.equals("minimal/notes.project.yml") ? project : Examples.of(file))
                .toList();

        Resolved resolved = Pipeline.resolve(files, "notes", Outputs.INTEGRITY);

        assertThat(resolved.diagnostics())
                .extracting(Diagnostic::code)
                .containsExactly("E_SHARED_DECLARATION_DUPLICATED");
    }

    @Test
    void anAssetCarriesTheFileBesideItsProjectWordForWord() throws IOException {
        Resolved data = Pipeline.resolve(
                Outputs.RESOLVED.get("data").documents().stream()
                        .map(Examples::of)
                        .toList(),
                "data",
                Outputs.INTEGRITY);

        assertThat(data.deployment()
                        .getApplications()
                        .get(0)
                        .getProcesses()
                        .get(0)
                        .getAssets())
                .singleElement()
                .satisfies(asset ->
                        assertThat(asset.getContent()).isEqualTo(Examples.read("data/config/postgresql.conf")));
    }

    @Test
    void anAssetWhoseFileIsNotBesideItsProjectStopsTheResolution(@TempDir Path directory) throws IOException {
        Path data = Examples.write(directory, "data.project.yml", Examples.read("data/data.project.yml"));
        List<Path> files = Outputs.RESOLVED.get("data").documents().stream()
                .map(file -> file.equals("data/data.project.yml") ? data : Examples.of(file))
                .toList();

        assertThatThrownBy(() -> Pipeline.resolve(files, "data", Outputs.INTEGRITY))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageStartingWith("data did not resolve");
    }

    /**
     * REQ-038: an Application's revision is the digest of its own element, as the production
     * implementation writes it. Every committed projection records it, and the rendered tree carries
     * it, so this implementation derives the same one: it does not move when only the provenance
     * does, and it moves when a decision about the Application does.
     */
    @Test
    void theRevisionIsTheOneEveryCommittedProjectionRecordsAndMovesOnlyWithADecision(@TempDir Path directory)
            throws IOException {
        for (String example : List.of("minimal", "auth", "data", "delivery")) {
            Outputs.Resolving resolving = Outputs.RESOLVED.get(example);
            ResolvedDeployment deployment = Pipeline.resolve(
                            resolving.documents().stream().map(Examples::of).toList(),
                            resolving.project(),
                            Outputs.INTEGRITY)
                    .deployment();
            try (var oracles = java.nio.file.Files.list(Examples.of(example + "/expected"))) {
                for (Path oracle : oracles.filter(
                                file -> file.getFileName().toString().startsWith("resolved"))
                        .toList()) {
                    String text = java.nio.file.Files.readString(oracle);
                    String id = field(text, "id");
                    assertThat(deployment.getApplications())
                            .filteredOn(application -> application.getId().equals(id))
                            .singleElement()
                            .satisfies(application -> assertThat(application.getRevision())
                                    .as(oracle.toString())
                                    .isEqualTo(field(text, "revision")));
                }
            }
        }

        String recorded = minimal().getApplications().get(0).getRevision();
        Path moved = Examples.write(
                directory,
                "notes.project.yml",
                Examples.read("minimal/notes.project.yml").replace("memory: 256Mi", "memory: 512Mi"));
        Path captured = Examples.write(
                directory,
                "cluster-state.yml",
                Examples.read("platform/cluster-state.yml").replace("2026-09-30", "2026-10-01"));
        assertThat(revisionWith("minimal/notes.project.yml", moved)).isNotEqualTo(recorded);
        assertThat(revisionWith("platform/cluster-state.yml", captured)).isEqualTo(recorded);
    }

    /** minimal's revision, resolved with {@code replaced} in place of the example file {@code name}. */
    private static String revisionWith(String name, Path replaced) throws IOException {
        List<Path> files = MINIMAL_SET.stream()
                .map(file -> file.equals(name) ? replaced : Examples.of(file))
                .toList();
        return Pipeline.resolve(files, "notes", Outputs.INTEGRITY)
                .deployment()
                .getApplications()
                .get(0)
                .getRevision();
    }

    /** The value of the top-level string field {@code key} in a canonical JSON text. */
    private static String field(String json, String key) {
        java.util.regex.Matcher found = java.util.regex.Pattern.compile("\"" + key + "\":\"([^\"]*)\"")
                .matcher(json.substring(json.lastIndexOf("\"" + key + "\":")));
        assertThat(found.find()).isTrue();
        return found.group(1);
    }

    @Test
    void minimalResolvesToTheHandWrittenTargetModel() throws IOException {
        ResolvedDeployment resolved = minimal();

        assertThat(EcoreUtil.equals(resolved, handWritten())).as(xmi(resolved)).isTrue();
    }
}
