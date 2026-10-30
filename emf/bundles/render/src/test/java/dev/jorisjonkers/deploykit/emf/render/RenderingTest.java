package dev.jorisjonkers.deploykit.emf.render;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import dev.jorisjonkers.deploykit.emf.metamodel.resolveddeployment.AdapterName;
import dev.jorisjonkers.deploykit.emf.metamodel.resolveddeployment.GeneratedKeysFile;
import dev.jorisjonkers.deploykit.emf.metamodel.resolveddeployment.NamespaceFile;
import dev.jorisjonkers.deploykit.emf.metamodel.resolveddeployment.ResolvedDeployment;
import dev.jorisjonkers.deploykit.emf.metamodel.resolveddeployment.ResolvedDeploymentFactory;
import dev.jorisjonkers.deploykit.emf.metamodel.resolveddeployment.ResolvedGeneratedKey;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.stream.Stream;
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
    void aGeneratedKeyCarriesTheLocationItAdoptsItsValueFrom(@TempDir Path out) throws IOException {
        ResolvedDeploymentFactory model = ResolvedDeploymentFactory.eINSTANCE;
        GeneratedKeysFile keys = model.createGeneratedKeysFile();
        keys.setPath("estate/vso-secrets/policies/tribelt-system.generated.json");
        keys.setAdapter(AdapterName.VAULT_POLICY);
        for (String name : List.of("session_key", "visitor_hmac_key")) {
            ResolvedGeneratedKey key = model.createResolvedGeneratedKey();
            key.setPath("secret/data/tribelt-system/keys");
            key.setKey(name);
            key.setBytes(32);
            key.setEncoding("hex");
            keys.getKeys().add(key);
        }
        keys.getKeys().get(0).setAdoptPath("secret/data/platform/tribelt");
        keys.getKeys().get(0).setAdoptKey("session_key");
        ResolvedDeployment deployment = model.createResolvedDeployment();
        deployment.getDeliverables().add(keys);

        Rendering.render(List.of(deployment), out);

        assertThat(Files.readString(out.resolve("estate/vso-secrets/policies/tribelt-system.generated.json")))
                .isEqualTo("""
                        {
                          "keys": [
                            {
                              "path": "secret/data/tribelt-system/keys",
                              "key": "session_key",
                              "bytes": 32,
                              "encoding": "hex",
                              "adopt": {
                                "path": "secret/data/platform/tribelt",
                                "key": "session_key"
                              }
                            },
                            {
                              "path": "secret/data/tribelt-system/keys",
                              "key": "visitor_hmac_key",
                              "bytes": 32,
                              "encoding": "hex"
                            }
                          ]
                        }
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

    @Test
    void aRenderingLeavesNothingAside(@TempDir Path out) {
        Rendering.render(List.of(namespaceOnly()), out);

        assertThat(Rendering.asideOf(out)).doesNotExist();
    }

    @Test
    void aRenderingWritesOverWhatIsAlreadyAtAPath(@TempDir Path out) throws IOException {
        Path namespace = out.resolve("apps/notes/namespace.yaml");
        Files.createDirectories(namespace.getParent());
        Files.writeString(namespace, "stale");

        Rendering.render(List.of(namespaceOnly()), out);

        assertThat(Files.readString(namespace)).contains("name: notes-system");
    }

    @Test
    void aTemplateThatFailsHalfwayLeavesTheRootAsItWasAndNothingAside(@TempDir Path directory) throws IOException {
        Path out = directory.resolve("out");
        Files.createDirectories(out);
        Files.writeString(out.resolve("kept.yaml"), "kept");

        assertThatThrownBy(() -> Rendering.render(List.of(namespaceOnly()), out, "halfway"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageStartingWith("the rendering did not complete: ");

        try (Stream<Path> files = Files.walk(out)) {
            assertThat(files.filter(Files::isRegularFile).map(out::relativize).map(Path::toString))
                    .containsExactly("kept.yaml");
        }
        assertThat(Rendering.asideOf(out)).doesNotExist();
    }

    @Test
    void whatAFailedRenderingLeftAsideIsClearedByTheNext(@TempDir Path directory) throws IOException {
        Path out = directory.resolve("out");
        Path leftover = Rendering.asideOf(out).resolve("apps/stale.yaml");
        Files.createDirectories(leftover.getParent());
        Files.writeString(leftover, "stale");

        Rendering.render(List.of(namespaceOnly()), out);

        assertThat(out.resolve("apps/stale.yaml")).doesNotExist();
        assertThat(Rendering.asideOf(out)).doesNotExist();
    }

    @Test
    void aRootThatCannotHoldTheFilesFailsTheRenderingAndLeavesNothingAside(@TempDir Path directory) throws IOException {
        Path out = Files.writeString(directory.resolve("out"), "a file, not a directory");

        assertThatThrownBy(() -> Rendering.render(List.of(namespaceOnly()), out))
                .isInstanceOf(UncheckedIOException.class);

        assertThat(Files.readString(out)).isEqualTo("a file, not a directory");
        assertThat(Rendering.asideOf(out)).doesNotExist();
    }

    @Test
    void aRenderingWhoseFilesAreRefusedWritesNothingAndSaysWhy(@TempDir Path out) {
        List<String> refused = Rendering.render(List.of(namespaceOnly()), out, aside -> {
            assertThat(aside.resolve("apps/notes/namespace.yaml")).exists();
            return List.of("refused");
        });

        assertThat(refused).containsExactly("refused");
        assertThat(out).isEmptyDirectory();
        assertThat(Rendering.asideOf(out)).doesNotExist();
    }

    @Test
    void aRenderingWhoseFilesAreNotRefusedIsWritten(@TempDir Path out) {
        assertThat(Rendering.render(List.of(namespaceOnly()), out, aside -> List.<String>of()))
                .isEmpty();
        assertThat(out.resolve("apps/notes/namespace.yaml")).exists();
    }
}
