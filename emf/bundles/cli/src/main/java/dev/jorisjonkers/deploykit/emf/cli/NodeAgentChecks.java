package dev.jorisjonkers.deploykit.emf.cli;

import dev.jorisjonkers.deploykit.emf.metamodel.pinnedinputs.NodeContract;
import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.NodeAgents;
import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.Platform;
import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.PoolAddress;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * What the node contract and a Platform document break together: a Node Agent they derive that the
 * Platform document's catalog names no image for (spec/v1/14-platform-intent.md#node-agents). Which
 * agents run is a fact of the contract's nodes and the Platform's pools, neither of which an
 * invariant over one metamodel can read, and the refusal is written at the catalog entry the
 * document lacks, which has no object to point at (docs/adr/emf/0143).
 */
final class NodeAgentChecks {

    static final String NO_NODE_AGENT_POLICY = "E_NO_NODE_AGENT_POLICY";

    /** The vendor whose cards {@code gpu-device} and {@code gpu-metrics} serve. */
    private static final String GPU_AGENT_VENDOR = "nvidia";

    private NodeAgentChecks() {}

    /** Every derived agent of {@code contract} and {@code platform} the catalog names nothing for. */
    static List<Diagnostic> check(Platform platform, NodeContract contract) {
        Set<String> sites =
                contract.getNodes().stream().map(node -> node.getSite()).collect(Collectors.toSet());
        boolean gpu = contract.getNodes().stream()
                .anyMatch(node -> node.getGpus().stream()
                        .anyMatch(card -> card.getVendor().equals(GPU_AGENT_VENDOR)));
        boolean speaker = platform.getL4Addresses().values().stream()
                .anyMatch(address -> address instanceof PoolAddress pool && sites.contains(pool.getSite()));
        NodeAgents catalog = platform.getNodeAgents();
        // An agent no node needs is not derived, and an agent the catalog names is not refused.
        Map<String, Boolean> unnamed = new LinkedHashMap<>();
        unnamed.put("gpu-device", gpu && (catalog == null || catalog.getGpuDevice() == null));
        unnamed.put("gpu-metrics", gpu && (catalog == null || catalog.getGpuMetrics() == null));
        unnamed.put(
                "node-metrics",
                !contract.getNodes().isEmpty() && (catalog == null || catalog.getNodeMetrics() == null));
        unnamed.put("l4-speaker", speaker && (catalog == null || catalog.getL4Speaker() == null));
        String document = platform.eResource().getURI().lastSegment();
        List<Diagnostic> refusals = new ArrayList<>();
        unnamed.forEach((agent, missing) -> {
            if (missing) {
                refusals.add(new Diagnostic(
                        NO_NODE_AGENT_POLICY,
                        document,
                        "/nodeAgents/" + agent,
                        agent + " runs on a node of the contract, and the catalog names no image for it"));
            }
        });
        return refusals;
    }
}
