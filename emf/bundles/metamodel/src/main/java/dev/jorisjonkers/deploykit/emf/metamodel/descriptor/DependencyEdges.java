package dev.jorisjonkers.deploykit.emf.metamodel.descriptor;

import dev.jorisjonkers.deploykit.emf.metamodel.json.CanonicalJson;
import dev.jorisjonkers.deploykit.emf.metamodel.resolveddeployment.ResolvedApplication;
import dev.jorisjonkers.deploykit.emf.metamodel.resolveddeployment.ResolvedDeployment;
import dev.jorisjonkers.deploykit.emf.metamodel.resolveddeployment.ResolvedEdge;
import dev.jorisjonkers.deploykit.emf.metamodel.resolveddeployment.ResolvedProcess;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * The resolved dependency edges of a Resolved Deployment model, in the shape the parity contract
 * fixes: one entry per Application, each an {@code id} and its {@code edges}, and an Application
 * with no dependency carrying an empty list
 * (docs/architecture.md#the-parity-contract).
 *
 * <p>This is the half of resolution both implementations must agree on before either renders, so it
 * is compared as canonical JSON against {@code spec/v1/examples/<case>/expected/dependencies.json}.
 * The Resolved Deployment itself is not compared: the two implementations shape layer 2 differently
 * on purpose (emf/docs/architecture.md#metamodels).
 */
public final class DependencyEdges {

    /** The name a run writes, the oracle's own. */
    public static final String NAME = "dependencies.json";

    private DependencyEdges() {}

    /** The edges of {@code deployment}, as the nested maps and lists the canonical writer takes. */
    public static Map<String, Object> of(ResolvedDeployment deployment) {
        List<Object> applications = new ArrayList<>();
        for (ResolvedApplication application : deployment.getApplications()) {
            applications.add(entry(application));
        }
        return Map.of("applications", applications);
    }

    /** Writes {@code deployment}'s edges under {@code directory}, and returns the file. */
    public static Path write(Path directory, ResolvedDeployment deployment) throws IOException {
        Files.createDirectories(directory);
        return Files.writeString(directory.resolve(NAME), CanonicalJson.write(of(deployment)), StandardCharsets.UTF_8);
    }

    private static Map<String, Object> entry(ResolvedApplication application) {
        List<Object> edges = new ArrayList<>();
        for (ResolvedProcess process : application.getProcesses()) {
            for (ResolvedEdge edge : process.getDependencies()) {
                edges.add(edge(process, edge));
            }
        }
        Map<String, Object> entry = new LinkedHashMap<>();
        entry.put("id", application.getId());
        entry.put("edges", edges);
        return entry;
    }

    private static Map<String, Object> edge(ResolvedProcess consumer, ResolvedEdge edge) {
        Map<String, Object> written = new LinkedHashMap<>();
        written.put("consumer", consumer.getName());
        written.put("application", edge.getApplication());
        written.put("surface", edge.getSurface());
        written.put("address", edge.getAddress());
        List<Object> peers = new ArrayList<>();
        edge.getPeers()
                .forEach(peer -> peers.add(Map.of(
                        "namespace", peer.getNamespace(),
                        "process", peer.getProcess(),
                        "port", (long) peer.getPort())));
        if (!peers.isEmpty()) {
            written.put("peers", peers);
        }
        return written;
    }
}
