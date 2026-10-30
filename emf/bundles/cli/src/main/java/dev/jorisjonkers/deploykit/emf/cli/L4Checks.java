package dev.jorisjonkers.deploykit.emf.cli;

import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.Application;
import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.L4AddressDeclaration;
import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.L4Exposure;
import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.Listener;
import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.NodeAddress;
import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.Platform;
import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.PoolAddress;
import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.Process;
import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.Project;
import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.Tier;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.OptionalLong;
import java.util.Set;

/**
 * What the L4 Addresses and the tiers' proxies of a Platform document and its project files break
 * together (spec/v1/14-platform-intent.md#l4-addresses, #tiers): a tier whose proxy answers its
 * listener on no Process, a pool with fewer addresses than Processes exposed on it, and a node's port
 * two owners dial. A tier that names an address derives an exposure on its proxy for each port its
 * listener derives, beside the exposures a project file authors.
 */
final class L4Checks {

    static final String TIER_SURFACE_MISSING = "E_TIER_SURFACE_MISSING";
    static final String L4_ADDRESS_EXHAUSTED = "E_L4_ADDRESS_EXHAUSTED";
    static final String NODE_PORT_TAKEN = "E_NODE_PORT_TAKEN";

    /** The ports a listener derives on a tier's proxy, each to the surface the proxy answers it on. */
    private static final Map<Listener, Map<Integer, String>> LISTENER_PORTS = Map.of(
            Listener.PLAIN, Map.of(80, "web"), Listener.TLS, new LinkedHashMap<>(Map.of(80, "web", 443, "websecure")));

    /** One exposure, authored or derived: where it is written, who owns it, and what it dials. */
    private record Entry(
            String document,
            String path,
            String owner,
            String project,
            String process,
            String address,
            String protocol,
            int port) {}

    private L4Checks() {}

    static List<Diagnostic> check(Platform platform, Map<Project, String> projects) {
        String document = platform.eResource().getURI().lastSegment();
        List<Diagnostic> refusals = new ArrayList<>();
        List<Entry> entries = new ArrayList<>();
        for (Map.Entry<Project, String> named : projects.entrySet()) {
            Project project = named.getKey();
            for (int a = 0; a < project.getApplications().size(); a++) {
                Application application = project.getApplications().get(a);
                for (L4Exposure exposure : application.getL4Exposure()) {
                    entries.add(new Entry(
                            named.getValue(),
                            Pointer.of(exposure),
                            named.getValue() + "/" + a,
                            project.getProject(),
                            // Every name links before this is asked: an unlinked one refused the document.
                            exposure.getProcess().getName(),
                            exposure.getAddress(),
                            exposure.getProtocol().getLiteral(),
                            exposure.getPort()));
                }
            }
        }
        for (int t = 0; t < platform.getTiers().size(); t++) {
            Tier tier = platform.getTiers().get(t);
            Application proxy = tier.getTraefik();
            // A tier with no address derives nothing, and a proxy no project file declares is
            // E_UNKNOWN_TIER_PROXY's.
            if (tier.getAddress() == null || proxy.eIsProxy()) {
                continue;
            }
            Optional<Process> answers = proxyProcessOf(proxy, tier.getListener());
            if (answers.isEmpty()) {
                refusals.add(new Diagnostic(
                        TIER_SURFACE_MISSING,
                        document,
                        "/tiers/" + t,
                        "no Process of " + proxy.getId() + " provides every surface the " + tier.getName()
                                + " tier's listener reaches"));
                continue;
            }
            for (int port : LISTENER_PORTS.get(tier.getListener()).keySet()) {
                entries.add(new Entry(
                        document,
                        "/tiers/" + t + "/address",
                        document + "/" + t,
                        ((Project) proxy.eContainer()).getProject(),
                        answers.get().getName(),
                        tier.getAddress(),
                        "tcp",
                        port));
            }
        }
        refusals.addAll(exhausted(platform, document, entries));
        refusals.addAll(taken(platform, entries));
        return refusals;
    }

    /** The Process of a proxy that provides every surface the listener reaches, if one does. */
    private static Optional<Process> proxyProcessOf(Application proxy, Listener listener) {
        return proxy.getProcesses().stream()
                .filter(process -> LISTENER_PORTS.get(listener).values().stream()
                        .allMatch(surface -> process.getProvides().containsKey(surface)))
                .findFirst();
    }

    /** Every pool exposed on by more Processes than its range holds addresses. */
    private static List<Diagnostic> exhausted(Platform platform, String document, List<Entry> entries) {
        List<Diagnostic> refusals = new ArrayList<>();
        for (Map.Entry<String, L4AddressDeclaration> address :
                platform.getL4Addresses().entrySet()) {
            if (address.getValue() instanceof PoolAddress pool) {
                Set<String> processes = new LinkedHashSet<>();
                for (Entry entry : entries) {
                    if (address.getKey().equals(entry.address())) {
                        processes.add(entry.project() + "/" + entry.process());
                    }
                }
                OptionalLong capacity = held(pool.getRange());
                if (capacity.isEmpty()) {
                    continue;
                }
                long held = capacity.getAsLong();
                if (processes.size() > held) {
                    refusals.add(new Diagnostic(
                            L4_ADDRESS_EXHAUSTED,
                            document,
                            "/l4Addresses/" + address.getKey(),
                            processes.size() + " Processes are exposed on " + address.getKey() + ", whose range holds "
                                    + held + " addresses"));
                }
            }
        }
        return refusals;
    }

    /** How many addresses {@code range} holds, by its prefix length; none known when it names none. */
    private static OptionalLong held(String range) {
        try {
            return OptionalLong.of(1L << (32 - Integer.parseInt(range.substring(range.indexOf('/') + 1))));
        } catch (NumberFormatException e) {
            return OptionalLong.empty();
        }
    }

    /** Every exposure on a node's own address whose node, protocol and port another owner dials too. */
    private static List<Diagnostic> taken(Platform platform, List<Entry> entries) {
        Map<String, Set<String>> owners = new LinkedHashMap<>();
        Map<Entry, String> keys = new LinkedHashMap<>();
        for (Entry entry : entries) {
            if (platform.getL4Addresses().get(entry.address()) instanceof NodeAddress node) {
                String key = node.getNode() + "/" + entry.protocol() + "/" + entry.port();
                keys.put(entry, key);
                owners.computeIfAbsent(key, k -> new LinkedHashSet<>())
                        .add(entry.owner() + "/" + entry.process() + "/" + entry.address());
            }
        }
        List<Diagnostic> refusals = new ArrayList<>();
        keys.forEach((entry, key) -> {
            if (owners.get(key).size() > 1) {
                refusals.add(new Diagnostic(
                        NODE_PORT_TAKEN,
                        entry.document(),
                        entry.path(),
                        entry.process() + " dials " + entry.protocol() + " " + entry.port() + " on a node another owner"
                                + " dials it on too"));
            }
        });
        return refusals;
    }
}
