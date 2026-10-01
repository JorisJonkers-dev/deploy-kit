package dev.jorisjonkers.deploykit.emf.render;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import dev.jorisjonkers.deploykit.emf.metamodel.resolveddeployment.ResolvedDeployment;
import dev.jorisjonkers.deploykit.emf.metamodel.resolveddeployment.ResolvedDeploymentPackage;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.stream.Stream;
import org.eclipse.emf.common.util.URI;
import org.eclipse.emf.ecore.resource.ResourceSet;
import org.eclipse.emf.ecore.resource.impl.ResourceSetImpl;
import org.eclipse.emf.ecore.xmi.impl.XMIResourceFactoryImpl;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

// The rendering seam (emf/docs/architecture.md#text-generation): the hand-written minimal model in,
// its Deliverable Set out, compared byte for byte with the committed tree and nothing in between.
class RenderingTest {

    private static final Path EMF = Path.of("../..").toAbsolutePath().normalize();
    private static final Path EXAMPLES = EMF.resolveSibling("spec/v1/examples");
    private static final Path PROJECT = Path.of("apps/notes");

    private static ResolvedDeployment minimal() {
        ResolvedDeploymentPackage.eINSTANCE.getName();
        ResourceSet resources = new ResourceSetImpl();
        resources.getResourceFactoryRegistry().getExtensionToFactoryMap().put("*", new XMIResourceFactoryImpl());
        return (ResolvedDeployment) resources
                .getResource(
                        URI.createFileURI(
                                EMF.resolve("models/minimal.resolveddeployment").toString()),
                        true)
                .getContents()
                .get(0);
    }

    private static List<Path> filesUnder(Path root) throws IOException {
        try (Stream<Path> walk = Files.walk(root)) {
            return walk.filter(Files::isRegularFile)
                    .map(root::relativize)
                    .sorted()
                    .toList();
        }
    }

    @Test
    void minimalsProjectTreeIsTheCommittedOneByteForByte(@TempDir Path out) throws IOException {
        Rendering.render(List.of(minimal()), out);

        Path committed = EXAMPLES.resolve("minimal/rendered").resolve(PROJECT);
        Path rendered = out.resolve(PROJECT);
        assertThat(filesUnder(rendered)).isEqualTo(filesUnder(committed));
        for (Path file : filesUnder(rendered)) {
            assertThat(Files.readString(rendered.resolve(file)))
                    .as(file.toString())
                    .isEqualTo(Files.readString(committed.resolve(file)));
        }
    }

    @Test
    void minimalsRouteIsTheEstateTreesOneByteForByte(@TempDir Path out) throws IOException {
        Rendering.render(List.of(minimal()), out);

        // The tier's index lists every Application the tier serves, so only the estate's render
        // writes it whole; the route itself is minimal's own.
        Path route = Path.of("apps/edge/public-frankfurt/notes-public.yaml");
        assertThat(Files.readString(out.resolve(route)))
                .isEqualTo(Files.readString(EXAMPLES.resolve("_estate/rendered").resolve(route)));
    }

    @Test
    void aTemplateThatDoesNotParseFailsTheRenderingWithWhatAcceleoSaid(@TempDir Path out) {
        assertThatThrownBy(() -> Rendering.render(List.of(minimal()), out, "unindented"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageStartingWith("the rendering did not complete: ")
                .hasMessageContaining("Acceleo parsing error");
    }
}
