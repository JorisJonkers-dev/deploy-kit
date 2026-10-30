package dev.jorisjonkers.deploykit.emf.syntax.linking;

import static org.assertj.core.api.Assertions.assertThat;

import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.Application;
import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.Platform;
import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.Project;
import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.ProjectIntentPackage;
import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.Route;
import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.Scrape;
import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.Tier;
import dev.jorisjonkers.deploykit.emf.syntax.PlatformIntentStandaloneSetup;
import dev.jorisjonkers.deploykit.emf.syntax.ProjectIntentStandaloneSetup;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import org.eclipse.emf.common.util.URI;
import org.eclipse.emf.ecore.EPackage;
import org.eclipse.emf.ecore.resource.Resource;
import org.eclipse.xtext.EcoreUtil2;
import org.eclipse.xtext.linking.impl.XtextLinkingDiagnostic;
import org.eclipse.xtext.resource.IResourceFactory;
import org.eclipse.xtext.resource.XtextResourceSet;
import org.junit.jupiter.api.Test;

/** What a route's, a scrape's and a tier's names link to, and what a name that links to nothing becomes. */
class LinkingTest {

    private static final String DOCUMENT = """
            apiVersion: intent.jorisjonkers.dev/v1
            kind: Project
            schemaVersion: 1.0.0
            project: links
            owner: joris
            applications:
              - id: links
                observability:
                  scrape: { process: SCRAPE_PROCESS, surface: SCRAPE_SURFACE, path: /metrics }
                exposure:
                  - name: public
                    host: links.jorisjonkers.dev
                    audience: lan
                    routes:
                      - { path: /, match: prefix, process: ROUTE_PROCESS, surface: ROUTE_SURFACE }
                processes:
                  - name: links-api
                    lifecycle: application
                    image: links-api
                    runtime: node
                    provides: { http: 8080, metrics: 9090 }
                    placement: { memory: 64Mi, cpu: 10m }
                    cutover: continuous
              - id: elsewhere
                processes:
                  - name: elsewhere-api
                    lifecycle: application
                    image: elsewhere-api
                    runtime: node
                    provides: { http: 8080 }
                    placement: { memory: 64Mi, cpu: 10m }
                    cutover: continuous
            """;

    private static Resource parse(String routeProcess, String routeSurface, String scrapeProcess, String scrapeSurface)
            throws IOException {
        EPackage.Registry.INSTANCE.putIfAbsent(ProjectIntentPackage.eNS_URI, ProjectIntentPackage.eINSTANCE);
        XtextResourceSet resources = new ProjectIntentStandaloneSetup()
                .createInjectorAndDoEMFRegistration()
                .getInstance(XtextResourceSet.class);
        Resource resource = resources.createResource(URI.createURI("memory:/links.yml"));
        String text = DOCUMENT.replace("ROUTE_PROCESS", routeProcess)
                .replace("ROUTE_SURFACE", routeSurface)
                .replace("SCRAPE_PROCESS", scrapeProcess)
                .replace("SCRAPE_SURFACE", scrapeSurface);
        resource.load(new ByteArrayInputStream(text.getBytes(StandardCharsets.UTF_8)), Map.of());
        EcoreUtil2.resolveAll(resource);
        return resource;
    }

    private static List<String> codes(Resource resource) {
        return resource.getErrors().stream()
                .map(error -> ((XtextLinkingDiagnostic) error).getCode() + " " + error.getMessage())
                .toList();
    }

    private static Application links(Resource resource) {
        return ((Project) resource.getContents().get(0)).getApplications().get(0);
    }

    @Test
    void aRouteAndAScrapeLinkToTheVeryProcessAndSurfaceTheirApplicationHolds() throws IOException {
        Resource resource = parse("links-api", "http", "links-api", "metrics");
        Application application = links(resource);
        Route route = application.getExposure().get(0).getRoutes().get(0);
        Scrape scrape = application.getObservability().getScrape();

        assertThat(resource.getErrors()).isEmpty();
        assertThat(route.getProcess()).isSameAs(application.getProcesses().get(0));
        assertThat(route.getSurface().getKey()).isEqualTo("http");
        assertThat(scrape.getProcess()).isSameAs(application.getProcesses().get(0));
        assertThat(scrape.getSurface().getKey()).isEqualTo("metrics");
    }

    @Test
    void aProcessOfAnotherApplicationIsNotInScope() throws IOException {
        assertThat(codes(parse("elsewhere-api", "http", "links-api", "metrics")))
                .containsExactly("E_UNKNOWN_PROCESS no Process of this Application is named elsewhere-api");
    }

    @Test
    void aSurfaceTheProcessDoesNotProvideIsUnknown() throws IOException {
        assertThat(codes(parse("links-api", "https", "links-api", "metrics")))
                .containsExactly("E_UNKNOWN_SURFACE the Process provides no surface named https");
    }

    @Test
    void aSurfaceIsNotReportedWhenItsProcessDidNotLink() throws IOException {
        assertThat(codes(parse("links-api", "http", "nothing", "nothing")))
                .containsExactly("E_UNKNOWN_PROCESS no Process of this Application is named nothing");
    }

    private static final String PLATFORM = """
            apiVersion: intent.jorisjonkers.dev/v1
            kind: Platform
            schemaVersion: 1.0.0
            owner: joris
            metadata: { cluster: production, project: jorisjonkers.dev, nodeContract: "sha256:6f1c" }
            substrate:
              kubernetesVersion: v1.31.4+k3s1
              datastore: sqlite
              serverCount: 1
              secretsEncryption: true
              cni: flannel
              networkPolicyController: embedded
              clusterDns: kube-system
            bootstrap:
              flux:
                sourceRef: flux-system/platform
                artifacts:
                  repository: ghcr.io/o/render
                  signer:
                    issuer: "https://token.actions.githubusercontent.com"
                    subject: "https://github.com/o/estate/.github/workflows/compose.yml@refs/heads/main"
              vault: { unsealed: true }
              crds: [traefik.io/v1alpha1]
            tiers:
              - { name: lan, audiences: [lan], listener: plain, certificates: none, traefik: PROXY }
            durability: { reconstructible: {} }
            engines: {}
            monitors: { interval: 30s, timeout: 10s }
            hardening: restricted
            probes: { period: 10s, timeout: 5s, failures: 3 }
            ephemeral: { size: 64Mi }
            """;

    /** A Platform document read into the same resource set as {@link #DOCUMENT}, its tier naming {@code proxy}. */
    private static Resource platform(String proxy) throws IOException {
        return platform(proxy, "");
    }

    /** The same, with {@code extra} appended to the document: a block the tier tests do not need. */
    private static Resource platform(String proxy, String extra) throws IOException {
        Resource project = parse("links-api", "http", "links-api", "metrics");
        Resource platform = new PlatformIntentStandaloneSetup()
                .createInjectorAndDoEMFRegistration()
                .getInstance(IResourceFactory.class)
                .createResource(URI.createURI("memory:/platform.intent.yml"));
        project.getResourceSet().getResources().add(platform);
        platform.load(
                new ByteArrayInputStream((PLATFORM.replace("PROXY", proxy) + extra).getBytes(StandardCharsets.UTF_8)),
                Map.of());
        EcoreUtil2.resolveAll(platform);
        return platform;
    }

    @Test
    void aTiersProxyLinksToAnApplicationAnotherDocumentDeclares() throws IOException {
        Resource platform = platform("links/elsewhere");
        Tier tier = ((Platform) platform.getContents().get(0)).getTiers().get(0);

        assertThat(platform.getErrors()).isEmpty();
        assertThat(tier.getTraefik().getId()).isEqualTo("elsewhere");
        assertThat(tier.getTraefik().eResource()).isNotSameAs(platform);
    }

    @Test
    void aPrivilegedRoleNamedUnderAProjectThatDoesNotDeclareItLinksToNothing() throws IOException {
        // `links` declares `elsewhere`; no Project called `impostor` is read, so the id alone binds nothing.
        assertThat(codes(platform("impostor/elsewhere")))
                .containsExactly("E_UNKNOWN_TIER_PROXY no project file declares the Application impostor/elsewhere");
        assertThat(codes(platform("links/elsewhere", "secretStore: impostor/elsewhere\n")))
                .containsExactly("E_UNKNOWN_SECRET_STORE no project file declares an Application impostor/elsewhere"
                        + " whose Process provides an `http` surface");
    }

    @Test
    void aTiersProxyThatNoDocumentDeclaresIsUnknown() throws IOException {
        assertThat(codes(platform("links/traefik-lan")))
                .containsExactly("E_UNKNOWN_TIER_PROXY no project file declares the Application links/traefik-lan");
    }

    @Test
    void theTelemetryCollectorLinksOnlyToADeclaredApplicationThatReceivesOnOtlp() throws IOException {
        // `elsewhere` is declared, and provides only `http`: it is not a collector, so it is not in scope.
        assertThat(codes(platform(
                        "links/elsewhere", "telemetry: { collector: links/elsewhere, metrics: links/elsewhere }\n")))
                .containsExactly("E_UNKNOWN_TELEMETRY_COLLECTOR no project file declares an Application links/elsewhere"
                        + " whose Process provides an `otlp` surface");
        assertThat(codes(platform(
                        "links/elsewhere", "telemetry: { collector: links/gone, metrics: links/elsewhere }\n")))
                .containsExactly("E_UNKNOWN_TELEMETRY_COLLECTOR no project file declares an Application links/gone"
                        + " whose Process provides an `otlp` surface");
    }

    @Test
    void theReleaseGateAndTheMetricsStackLinkOnlyToWhatTheyNeed() throws IOException {
        // `elsewhere` provides `http`, so it may be the gate; `gone` is declared nowhere.
        String delivery = "delivery: { machinery: [links/elsewhere], gate: links/gone, "
                + "analysis: { interval: 30s, iterations: 4, threshold: 3, errorRate: 1%, latency: 500ms } }\n";

        assertThat(codes(platform(
                        "links/elsewhere", delivery + "telemetry: { collector: links/gone, metrics: links/gone }\n")))
                .contains(
                        "E_UNKNOWN_RELEASE_GATE no project file declares an Application links/gone whose Process provides"
                                + " an `http` surface",
                        "E_UNKNOWN_METRICS_STACK no project file declares the Application links/gone the metrics stack names");
    }

    @Test
    void theReporterLinksOnlyToADeclaredApplicationThatAnswersOnHttp() throws IOException {
        // `elsewhere` provides `http` beside the gate, so it may be the Reporter; `gone` is declared nowhere.
        String analysis = "analysis: { interval: 30s, iterations: 4, threshold: 3, errorRate: 1%, latency: 500ms } }\n";
        String linked = "delivery: { machinery: [links/elsewhere], gate: links/elsewhere, reporter: links/elsewhere, "
                + analysis;
        String unlinked =
                "delivery: { machinery: [links/elsewhere], gate: links/elsewhere, reporter: links/gone, " + analysis;

        assertThat(codes(platform("links/elsewhere", linked))).isEmpty();
        assertThat(codes(platform("links/elsewhere", unlinked)))
                .containsExactly("E_UNKNOWN_REPORTER the project file that declares the Release Gate declares no"
                        + " Application links/gone whose Process provides an `http` surface");
    }

    @Test
    void theReporterLinksToNothingWhereNoProjectFileDeclaresTheGate() throws IOException {
        // The Reporter is declared beside the gate, so a gate that links nowhere leaves it nowhere
        // to be declared, however many Applications of its name the set holds.
        String analysis = "analysis: { interval: 30s, iterations: 4, threshold: 3, errorRate: 1%, latency: 500ms } }\n";
        String refused = "E_UNKNOWN_REPORTER the project file that declares the Release Gate declares no"
                + " Application links/elsewhere whose Process provides an `http` surface";

        assertThat(codes(platform(
                        "links/elsewhere",
                        "delivery: { machinery: [links/elsewhere], gate: links/gone, reporter: links/elsewhere, "
                                + analysis)))
                .contains(refused);
        // A delivery policy that names no gate at all is the parser's to refuse; the Reporter
        // still links to nothing.
        assertThat(platform(
                                "links/elsewhere",
                                "delivery: { machinery: [links/elsewhere], reporter: links/elsewhere, " + analysis)
                        .getErrors())
                .filteredOn(XtextLinkingDiagnostic.class::isInstance)
                .extracting(error -> ((XtextLinkingDiagnostic) error).getCode() + " " + error.getMessage())
                .contains(refused);
    }

    @Test
    void theSecretStoreLinksOnlyToADeclaredApplicationThatAnswersOnHttp() throws IOException {
        // `elsewhere` provides `http`, so it may be the Secret Store; `gone` is declared nowhere.
        Resource platform = platform("links/elsewhere", "secretStore: links/elsewhere\n");

        assertThat(platform.getErrors()).isEmpty();
        assertThat(((Platform) platform.getContents().get(0)).getSecretStore().getId())
                .isEqualTo("elsewhere");
        assertThat(codes(platform("links/elsewhere", "secretStore: links/gone\n")))
                .containsExactly(
                        "E_UNKNOWN_SECRET_STORE no project file declares an Application links/gone whose Process"
                                + " provides an `http` surface");
    }

    @Test
    void theDeliveryMachineryLinksToDeclaredApplicationsAndReportsEachOneThatIsNot() throws IOException {
        String delivery = "delivery: { machinery: [links/elsewhere, links/gone], gate: links/elsewhere, "
                + "analysis: { interval: 30s, iterations: 4, threshold: 3, errorRate: 1%, latency: 500ms } }\n";

        assertThat(codes(platform("links/elsewhere", delivery)))
                .containsExactly(
                        "E_UNKNOWN_MACHINERY no project file declares the Application links/gone the delivery machinery names");
    }

    @Test
    void aHolderOfApiAccessLinksToADeclaredApplicationAndReportsEachOneThatIsNot() throws IOException {
        String server = "  server:\n    - { cidr: 10.43.0.1/32, port: 443 }\n";
        Resource platform = platform("links/elsewhere", "apiAccess:\n  holders: [links/elsewhere]\n" + server);

        assertThat(platform.getErrors()).isEmpty();
        assertThat(((Platform) platform.getContents().get(0))
                        .getApiAccess()
                        .getHolders()
                        .get(0)
                        .getId())
                .isEqualTo("elsewhere");
        assertThat(codes(
                        platform("links/elsewhere", "apiAccess:\n  holders: [links/elsewhere, links/gone]\n" + server)))
                .containsExactly("E_UNKNOWN_API_HOLDER no project file declares the Application links/gone the platform"
                        + " admits to hold Kubernetes API access");
    }
}
