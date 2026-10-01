package dev.jorisjonkers.deploykit.emf.cli;

import static org.assertj.core.api.Assertions.assertThat;

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
    void minimalResolvesToTheHandWrittenTargetModel() throws IOException {
        ResolvedDeployment resolved = minimal();

        assertThat(EcoreUtil.equals(resolved, handWritten())).as(xmi(resolved)).isTrue();
    }
}
