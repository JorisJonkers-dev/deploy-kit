package dev.jorisjonkers.deploykit.emf.cli;

import static org.assertj.core.api.Assertions.assertThat;

import dev.jorisjonkers.deploykit.emf.metamodel.pinnedinputs.Gpu;
import dev.jorisjonkers.deploykit.emf.metamodel.pinnedinputs.Node;
import dev.jorisjonkers.deploykit.emf.metamodel.pinnedinputs.NodeContract;
import dev.jorisjonkers.deploykit.emf.metamodel.pinnedinputs.PinnedInputsFactory;
import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.NodeAddress;
import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.NodeAgentPolicy;
import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.NodeAgents;
import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.Platform;
import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.PoolAddress;
import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.ProjectIntentFactory;
import java.util.List;
import org.eclipse.emf.common.util.URI;
import org.eclipse.emf.ecore.xmi.impl.XMIResourceImpl;
import org.junit.jupiter.api.Test;

/** Which Node Agents the node contract and the Platform document derive, and which the catalog names no image for. */
class NodeAgentChecksTest {

    private static final ProjectIntentFactory INTENT = ProjectIntentFactory.eINSTANCE;

    private static Node node(String name, String site, String... vendors) {
        Node node = PinnedInputsFactory.eINSTANCE.createNode();
        node.setName(name);
        node.setSite(site);
        for (String vendor : vendors) {
            Gpu card = PinnedInputsFactory.eINSTANCE.createGpu();
            card.setVendor(vendor);
            node.getGpus().add(card);
        }
        return node;
    }

    private static NodeContract contract(Node... nodes) {
        NodeContract contract = PinnedInputsFactory.eINSTANCE.createNodeContract();
        contract.getNodes().addAll(List.of(nodes));
        return contract;
    }

    /** A Platform document with a pool at {@code site} when given one, and a catalog of the named agents. */
    private static Platform platform(
            String site, boolean gpuDevice, boolean gpuMetrics, boolean nodeMetrics, boolean speaker) {
        Platform platform = INTENT.createPlatform();
        new XMIResourceImpl(URI.createURI("platform.intent.yml")).getContents().add(platform);
        if (site != null) {
            PoolAddress pool = INTENT.createPoolAddress();
            pool.setSite(site);
            platform.getL4Addresses().put("pool", pool);
        }
        // A node's own address derives nothing to announce.
        platform.getL4Addresses().put("own", INTENT.createNodeAddress());
        NodeAgents catalog = INTENT.createNodeAgents();
        if (gpuDevice) {
            catalog.setGpuDevice(policy());
        }
        if (gpuMetrics) {
            catalog.setGpuMetrics(policy());
        }
        if (nodeMetrics) {
            catalog.setNodeMetrics(policy());
        }
        if (speaker) {
            catalog.setL4Speaker(INTENT.createSpeakerPolicy());
        }
        platform.setNodeAgents(catalog);
        return platform;
    }

    private static NodeAgentPolicy policy() {
        return INTENT.createNodeAgentPolicy();
    }

    private static List<String> paths(Platform platform, NodeContract contract) {
        return NodeAgentChecks.check(platform, contract).stream()
                .map(Diagnostic::path)
                .toList();
    }

    @Test
    void everyAgentTheFactsDeriveWhoseCatalogEntryIsMissingIsRefusedAtThatEntry() {
        NodeContract everything = contract(node("a", "s", "nvidia"));

        assertThat(paths(platform("s", false, false, false, false), everything))
                .containsExactly(
                        "/nodeAgents/gpu-device",
                        "/nodeAgents/gpu-metrics",
                        "/nodeAgents/node-metrics",
                        "/nodeAgents/l4-speaker");
        assertThat(paths(platform("s", true, true, true, true), everything)).isEmpty();
        assertThat(paths(platform("s", false, true, true, true), everything)).containsExactly("/nodeAgents/gpu-device");
        assertThat(paths(platform("s", true, false, true, true), everything))
                .containsExactly("/nodeAgents/gpu-metrics");
        assertThat(paths(platform("s", true, true, false, true), everything))
                .containsExactly("/nodeAgents/node-metrics");
        assertThat(paths(platform("s", true, true, true, false), everything)).containsExactly("/nodeAgents/l4-speaker");
    }

    @Test
    void anAgentNoNodeNeedsIsNotDerivedAndSoNeverRefused() {
        assertThat(paths(platform("s", false, false, false, false), contract(node("a", "s", "amd"))))
                .containsExactly("/nodeAgents/node-metrics", "/nodeAgents/l4-speaker");
        assertThat(paths(platform("elsewhere", false, false, true, false), contract(node("a", "s"))))
                .isEmpty();
        assertThat(paths(platform(null, false, false, false, false), contract()))
                .isEmpty();
    }

    @Test
    void aPlatformWithNoCatalogAtAllIsRefusedForEveryAgentItDerives() {
        Platform bare = platform("s", false, false, false, false);
        bare.setNodeAgents(null);

        assertThat(paths(bare, contract(node("a", "s", "nvidia")))).hasSize(4);
        assertThat(bare.getL4Addresses().values()).anyMatch(NodeAddress.class::isInstance);
        assertThat(NodeAgentChecks.check(bare, contract(node("a", "s"))))
                .extracting(Diagnostic::code, Diagnostic::document)
                .containsExactly(
                        org.assertj.core.groups.Tuple.tuple("E_NO_NODE_AGENT_POLICY", "platform.intent.yml"),
                        org.assertj.core.groups.Tuple.tuple("E_NO_NODE_AGENT_POLICY", "platform.intent.yml"));
    }
}
