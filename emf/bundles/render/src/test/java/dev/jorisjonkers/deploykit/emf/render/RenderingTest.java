package dev.jorisjonkers.deploykit.emf.render;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import dev.jorisjonkers.deploykit.emf.metamodel.resolveddeployment.AdapterName;
import dev.jorisjonkers.deploykit.emf.metamodel.resolveddeployment.NamespaceFile;
import dev.jorisjonkers.deploykit.emf.metamodel.resolveddeployment.ResolvedDeployment;
import dev.jorisjonkers.deploykit.emf.metamodel.resolveddeployment.ResolvedDeploymentFactory;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

// The rendering seam (emf/docs/architecture.md#text-generation): a Resolved Deployment in, its files
// out, with nothing in between. Every committed tree is compared, from the transformation's output,
// through the pipeline's one entry (RenderedTreeTest in the cli bundle).
class RenderingTest {

    /** A Deployment holding one Deliverable: the namespace of a project. */
    private static ResolvedDeployment namespaceOnly() {
        ResolvedDeploymentFactory model = ResolvedDeploymentFactory.eINSTANCE;
        NamespaceFile namespace = model.createNamespaceFile();
        namespace.setPath("apps/notes/namespace.yaml");
        namespace.setAdapter(AdapterName.KUBERNETES);
        namespace.setNamespace("notes-system");
        ResolvedDeployment deployment = model.createResolvedDeployment();
        deployment.getDeliverables().add(namespace);
        return deployment;
    }

    @Test
    void aDeliverableIsWrittenAtItsPathUnderTheOneHeader(@TempDir Path out) throws IOException {
        Rendering.render(List.of(namespaceOnly()), out);

        assertThat(Files.readString(out.resolve("apps/notes/namespace.yaml"))).isEqualTo("""
                        # GENERATED. Never hand-edit.
                        ---
                        apiVersion: v1
                        kind: Namespace
                        metadata:
                          name: notes-system
                          labels:
                            app.kubernetes.io/managed-by: deploy-kit
                        """);
    }

    @Test
    void theCallersDeploymentsAreLeftWhereTheyWere(@TempDir Path out) {
        ResolvedDeployment deployment = namespaceOnly();

        Rendering.render(List.of(deployment), out);

        assertThat(deployment.eResource()).isNull();
        assertThat(deployment.getDeliverables()).hasSize(1);
    }

    @Test
    void aTemplateThatDoesNotParseFailsTheRenderingWithWhatAcceleoSaid(@TempDir Path out) {
        assertThatThrownBy(() -> Rendering.render(List.of(namespaceOnly()), out, "unindented"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageStartingWith("the rendering did not complete: ")
                .hasMessageContaining("Acceleo parsing error");
    }
}
