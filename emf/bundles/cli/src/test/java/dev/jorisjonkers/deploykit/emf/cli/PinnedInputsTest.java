package dev.jorisjonkers.deploykit.emf.cli;

import static org.assertj.core.api.Assertions.assertThat;

import dev.jorisjonkers.deploykit.emf.metamodel.pinnedinputs.ClusterState;
import dev.jorisjonkers.deploykit.emf.metamodel.pinnedinputs.ImagesLock;
import dev.jorisjonkers.deploykit.emf.metamodel.pinnedinputs.Node;
import dev.jorisjonkers.deploykit.emf.metamodel.pinnedinputs.NodeContract;
import java.util.List;
import org.eclipse.emf.ecore.resource.Resource;
import org.junit.jupiter.api.Test;

/** The pinned inputs beside the Platform document, each read by the language its file name says. */
class PinnedInputsTest {

    private static Resource read(String relative) {
        Resource resource = Pipeline.read(List.of(Examples.of(relative))).get(0);
        assertThat(resource.getErrors()).isEmpty();
        return resource;
    }

    @Test
    void theNodeContractListsEveryNodeInItsOwnOrderWithWhatEachCanHold() {
        NodeContract contract =
                (NodeContract) read("platform/node-contract.yml").getContents().get(0);

        assertThat(contract.getCluster()).isEqualTo("production");
        assertThat(contract.getNodes()).extracting(Node::getName).hasSize(7).startsWith("enschede-t1000-1");
        Node first = contract.getNodes().get(0);
        assertThat(first.getAllocatable().getMemory()).isEqualTo("31488Mi");
        assertThat(first.getCapabilities()).containsExactly("nvidia", "samba", "lan-ingress", "adguard");
        assertThat(first.getGpus().get(0).getMemoryMib()).isEqualTo(4096);
        assertThat(first.getDisks()).hasSize(3);
    }

    @Test
    void theImagesLockFilesEachImageUnderItsAlias() {
        ImagesLock lock =
                (ImagesLock) read("platform/images.lock.yml").getContents().get(0);

        assertThat(lock.getName()).isEqualTo("estate");
        assertThat(lock.getImages())
                .filteredOn(image -> image.getAlias().equals("notes-api"))
                .singleElement()
                .satisfies(image -> {
                    assertThat(image.getRepository()).isEqualTo("ghcr.io/jorisjonkers-dev/notes/notes-api");
                    assertThat(image.getDigest()).startsWith("sha256:9c1e5a4b");
                    assertThat(image.getUid()).isEqualTo(1000);
                });
    }

    @Test
    void anEmptySnapshotHoldsNoBindingAndNoPlacement() {
        ClusterState state =
                (ClusterState) read("platform/cluster-state.yml").getContents().get(0);

        assertThat(state.getCapturedAt()).isEqualTo("2026-09-30T00:00:00Z");
        assertThat(state.getBindings()).isEmpty();
        assertThat(state.getPlacements()).isEmpty();
    }
}
