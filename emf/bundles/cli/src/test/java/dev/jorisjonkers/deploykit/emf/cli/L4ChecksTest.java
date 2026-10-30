package dev.jorisjonkers.deploykit.emf.cli;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.tuple;

import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.Application;
import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.L4Exposure;
import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.L4Protocol;
import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.Listener;
import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.NodeAddress;
import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.Platform;
import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.PoolAddress;
import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.Process;
import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.Project;
import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.ProjectIntentFactory;
import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.Tier;
import java.util.LinkedHashMap;
import java.util.Map;
import org.eclipse.emf.common.util.URI;
import org.eclipse.emf.ecore.InternalEObject;
import org.eclipse.emf.ecore.xmi.impl.XMIResourceImpl;
import org.junit.jupiter.api.Test;

/** What a Platform document's L4 Addresses and tiers and the project files beside it break together. */
class L4ChecksTest {

    private static final ProjectIntentFactory MODEL = ProjectIntentFactory.eINSTANCE;

    /** A Platform document read from `platform.intent.yml`, declaring a node's address and a pool. */
    private static Platform platform(String range) {
        Platform platform = MODEL.createPlatform();
        NodeAddress node = MODEL.createNodeAddress();
        node.setNode("edge-1");
        NodeAddress again = MODEL.createNodeAddress();
        again.setNode("edge-1");
        PoolAddress pool = MODEL.createPoolAddress();
        pool.setSite("enschede");
        pool.setRange(range);
        platform.getL4Addresses().put("edge-node", node);
        platform.getL4Addresses().put("edge-node-2", again);
        platform.getL4Addresses().put("lan-mqtt", pool);
        new XMIResourceImpl(URI.createURI("platform.intent.yml")).getContents().add(platform);
        return platform;
    }

    private static Project project(String name, String... processes) {
        Project project = MODEL.createProject();
        project.setProject(name);
        Application application = MODEL.createApplication();
        application.setId(name + "-app");
        for (String named : processes) {
            Process process = MODEL.createProcess();
            process.setName(named);
            application.getProcesses().add(process);
        }
        project.getApplications().add(application);
        return project;
    }

    private static void expose(Project project, String process, String address, L4Protocol protocol, int port) {
        Application application = project.getApplications().get(0);
        L4Exposure exposure = MODEL.createL4Exposure();
        exposure.setProcess(application.getProcesses().stream()
                .filter(p -> p.getName().equals(process))
                .findFirst()
                .orElseThrow());
        exposure.setAddress(address);
        exposure.setProtocol(protocol);
        exposure.setPort(port);
        application.getL4Exposure().add(exposure);
    }

    private static Tier tier(Platform platform, String name, Listener listener, String address, Application proxy) {
        Tier tier = MODEL.createTier();
        tier.setName(name);
        tier.setListener(listener);
        tier.setAddress(address);
        tier.setTraefik(proxy);
        platform.getTiers().add(tier);
        return tier;
    }

    private static Map<Project, String> named(Project... projects) {
        Map<Project, String> named = new LinkedHashMap<>();
        for (Project project : projects) {
            named.put(project, project.getProject() + ".project.yml");
        }
        return named;
    }

    @Test
    void aTierThatNamesAnAddressNeedsAProxyProcessThatAnswersEveryPortItsListenerDerives() {
        Platform platform = platform("192.168.0.97/32");
        Project edge = project("edge", "proxy");
        Process proxy = edge.getApplications().get(0).getProcesses().get(0);
        proxy.getProvides().put("web", 8000);
        Application app = edge.getApplications().get(0);
        tier(platform, "public", Listener.TLS, "edge-node", app);
        tier(platform, "lan", Listener.PLAIN, "lan-mqtt", app);
        tier(platform, "internal", Listener.TLS, null, app);

        assertThat(L4Checks.check(platform, named(edge)))
                .extracting(Diagnostic::code, Diagnostic::document, Diagnostic::path, Diagnostic::message)
                .containsExactly(tuple(
                        L4Checks.TIER_SURFACE_MISSING,
                        "platform.intent.yml",
                        "/tiers/0",
                        "no Process of edge-app provides every surface the public tier's listener reaches"));
        proxy.getProvides().put("websecure", 8443);
        assertThat(L4Checks.check(platform, named(edge))).isEmpty();
    }

    @Test
    void aProxyNoProjectFileDeclaresIsNotThisChecksToRefuse() {
        Platform platform = platform("192.168.0.97/32");
        Application unlinked = MODEL.createApplication();
        ((InternalEObject) unlinked).eSetProxyURI(URI.createURI("edge.project.yml#//@applications.0"));
        tier(platform, "public", Listener.TLS, "edge-node", unlinked);

        assertThat(L4Checks.check(platform, named())).isEmpty();
    }

    @Test
    void aNodesPortTwoOwnersDialIsRefusedAtEachAndATiersPortIsTheTiersOwn() {
        Platform platform = platform("192.168.0.97/32");
        Project edge = project("edge", "proxy");
        edge.getApplications().get(0).getProcesses().get(0).getProvides().put("web", 8000);
        tier(
                platform,
                "lan",
                Listener.PLAIN,
                "edge-node",
                edge.getApplications().get(0));
        Project mail = project("mail", "smtp", "other");
        expose(mail, "smtp", "edge-node", L4Protocol.TCP, 80);
        expose(mail, "smtp", "edge-node", L4Protocol.TCP, 25);
        expose(mail, "smtp", "edge-node", L4Protocol.TCP, 25);
        expose(mail, "smtp", "edge-node", L4Protocol.UDP, 53);
        expose(mail, "other", "edge-node", L4Protocol.TCP, 53);
        expose(mail, "smtp", "lan-mqtt", L4Protocol.TCP, 80);

        assertThat(L4Checks.check(platform, named(edge, mail)))
                .extracting(Diagnostic::code, Diagnostic::document, Diagnostic::path, Diagnostic::message)
                .containsExactly(
                        tuple(
                                L4Checks.NODE_PORT_TAKEN,
                                "mail.project.yml",
                                "/applications/0/l4Exposure/0",
                                "smtp dials tcp 80 on a node another owner dials it on too"),
                        tuple(
                                L4Checks.NODE_PORT_TAKEN,
                                "platform.intent.yml",
                                "/tiers/0/address",
                                "proxy dials tcp 80 on a node another owner dials it on too"));
    }

    @Test
    void twoProjectsProcessesOfOneNameAreTwoOwners() {
        Platform platform = platform("192.168.0.97/32");
        Project data = project("data", "dns");
        expose(data, "dns", "edge-node", L4Protocol.UDP, 53);
        Project utility = project("utility", "dns");
        expose(utility, "dns", "edge-node", L4Protocol.UDP, 53);

        assertThat(L4Checks.check(platform, named(data, utility)))
                .extracting(Diagnostic::document)
                .containsExactly("data.project.yml", "utility.project.yml");
    }

    @Test
    void oneProcessOnTwoOfANodesAddressesDialsItsPortTwice() {
        Platform platform = platform("192.168.0.97/32");
        Project mail = project("mail", "smtp");
        expose(mail, "smtp", "edge-node", L4Protocol.TCP, 25);
        expose(mail, "smtp", "edge-node-2", L4Protocol.TCP, 25);

        assertThat(L4Checks.check(platform, named(mail)))
                .extracting(Diagnostic::path)
                .containsExactly("/applications/0/l4Exposure/0", "/applications/0/l4Exposure/1");
    }

    @Test
    void aPoolHoldsAsManyProcessesAsItsRangeHoldsAddresses() {
        Project data = project("data", "mqtt", "other");
        expose(data, "mqtt", "lan-mqtt", L4Protocol.TCP, 1883);
        expose(data, "mqtt", "lan-mqtt", L4Protocol.TCP, 8883);
        expose(data, "other", "edge-node", L4Protocol.TCP, 1883);
        Project mail = project("mail", "mqtt");
        expose(mail, "mqtt", "lan-mqtt", L4Protocol.TCP, 1883);

        assertThat(L4Checks.check(platform("192.168.0.97/31"), named(data, mail)))
                .isEmpty();
        assertThat(L4Checks.check(platform("192.168.0.97"), named(data, mail)))
                .as("a range naming no prefix length holds no count to exceed")
                .isEmpty();
        assertThat(L4Checks.check(platform("192.168.0.97/32"), named(data, mail)))
                .extracting(Diagnostic::code, Diagnostic::document, Diagnostic::path, Diagnostic::message)
                .containsExactly(tuple(
                        L4Checks.L4_ADDRESS_EXHAUSTED,
                        "platform.intent.yml",
                        "/l4Addresses/lan-mqtt",
                        "2 Processes are exposed on lan-mqtt, whose range holds 1 addresses"));
    }

    @Test
    void aTiersDerivedPortTakesAnAddressOfItsPool() {
        Platform platform = platform("192.168.0.97/32");
        Project edge = project("edge", "proxy");
        edge.getApplications().get(0).getProcesses().get(0).getProvides().put("web", 8000);
        tier(platform, "lan", Listener.PLAIN, "lan-mqtt", edge.getApplications().get(0));
        Project data = project("data", "mqtt");
        expose(data, "mqtt", "lan-mqtt", L4Protocol.TCP, 1883);

        assertThat(L4Checks.check(platform, named(edge, data)))
                .extracting(Diagnostic::code)
                .containsExactly(L4Checks.L4_ADDRESS_EXHAUSTED);
        assertThat(L4Checks.check(platform, named(edge))).isEmpty();
    }
}
