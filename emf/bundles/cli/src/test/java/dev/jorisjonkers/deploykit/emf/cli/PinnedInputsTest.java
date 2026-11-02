package dev.jorisjonkers.deploykit.emf.cli;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.tuple;

import dev.jorisjonkers.deploykit.emf.metamodel.pinnedinputs.ClusterState;
import dev.jorisjonkers.deploykit.emf.metamodel.pinnedinputs.Disk;
import dev.jorisjonkers.deploykit.emf.metamodel.pinnedinputs.ImagesLock;
import dev.jorisjonkers.deploykit.emf.metamodel.pinnedinputs.Node;
import dev.jorisjonkers.deploykit.emf.metamodel.pinnedinputs.NodeContract;
import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.Media;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
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

    /** REQ-034: the seven nodes, the capability counts chapter 60 states, and a medium no Process may ask for. */
    @Test
    void theNodeContractPublishesTheSevenNodesTheirCapabilitiesAndAMediumNoProcessMayAskFor() {
        NodeContract contract =
                (NodeContract) read("platform/node-contract.yml").getContents().get(0);

        assertThat(contract.getNodes())
                .extracting(Node::getName, Node::getSite)
                .containsExactly(
                        tuple("enschede-t1000-1", "enschede"),
                        tuple("enschede-rx7900xtx-1", "enschede"),
                        tuple("enschede-gtx-960m-1", "enschede"),
                        tuple("enschede-pi-1", "enschede"),
                        tuple("enschede-pi-2", "enschede"),
                        tuple("enschede-pi-3", "enschede"),
                        tuple("frankfurt-contabo-1", "frankfurt"));
        Map<String, Long> counts = contract.getNodes().stream()
                .flatMap(node -> node.getCapabilities().stream())
                .collect(Collectors.groupingBy(capability -> capability, Collectors.counting()));
        assertThat(counts)
                .containsExactlyInAnyOrderEntriesOf(Map.of(
                        "adguard", 5L,
                        "lan-ingress", 3L,
                        "nvidia", 2L,
                        "samba", 1L,
                        "public-ingress", 1L,
                        "llm-host", 1L,
                        "backup-store", 1L,
                        "amd-gpu", 1L));
        // The contract's media are the wider vocabulary: the Pis boot from SD cards, which no
        // Process's `placement.disk.media` may name.
        assertThat(contract.getNodes().stream().flatMap(node -> node.getDisks().stream()))
                .extracting(Disk::getMedia)
                .contains("sdcard");
        assertThat(Media.VALUES).extracting(Media::getLiteral).doesNotContain("sdcard");
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
