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
                  alertClass: urgent
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
            bootstrap:
              flux: { sourceRef: flux-system/platform }
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
        Resource project = parse("links-api", "http", "links-api", "metrics");
        Resource platform = new PlatformIntentStandaloneSetup()
                .createInjectorAndDoEMFRegistration()
                .getInstance(IResourceFactory.class)
                .createResource(URI.createURI("memory:/platform.intent.yml"));
        project.getResourceSet().getResources().add(platform);
        platform.load(
                new ByteArrayInputStream(PLATFORM.replace("PROXY", proxy).getBytes(StandardCharsets.UTF_8)), Map.of());
        EcoreUtil2.resolveAll(platform);
        return platform;
    }

    @Test
    void aTiersProxyLinksToAnApplicationAnotherDocumentDeclares() throws IOException {
        Resource platform = platform("elsewhere");
        Tier tier = ((Platform) platform.getContents().get(0)).getTiers().get(0);

        assertThat(platform.getErrors()).isEmpty();
        assertThat(tier.getTraefik().getId()).isEqualTo("elsewhere");
        assertThat(tier.getTraefik().eResource()).isNotSameAs(platform);
    }

    @Test
    void aTiersProxyThatNoDocumentDeclaresIsUnknown() throws IOException {
        assertThat(codes(platform("traefik-lan")))
                .containsExactly("E_UNKNOWN_TIER_PROXY no project file declares the Application traefik-lan");
    }
}
