package dev.jorisjonkers.deploykit.emf.metamodel;

import static org.assertj.core.api.Assertions.assertThat;

import dev.jorisjonkers.deploykit.emf.metamodel.descriptor.DependencyEdges;
import dev.jorisjonkers.deploykit.emf.metamodel.json.CanonicalJson;
import dev.jorisjonkers.deploykit.emf.metamodel.resolveddeployment.Deliverable;
import dev.jorisjonkers.deploykit.emf.metamodel.resolveddeployment.PolicyPeer;
import dev.jorisjonkers.deploykit.emf.metamodel.resolveddeployment.ResolvedApplication;
import dev.jorisjonkers.deploykit.emf.metamodel.resolveddeployment.ResolvedDeployment;
import dev.jorisjonkers.deploykit.emf.metamodel.resolveddeployment.ResolvedDeploymentFactory;
import dev.jorisjonkers.deploykit.emf.metamodel.resolveddeployment.ResolvedDeploymentPackage;
import dev.jorisjonkers.deploykit.emf.metamodel.resolveddeployment.ResolvedEdge;
import dev.jorisjonkers.deploykit.emf.metamodel.resolveddeployment.ResolvedProcess;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;
import org.eclipse.emf.common.util.Diagnostic;
import org.eclipse.emf.common.util.URI;
import org.eclipse.emf.ecore.EClass;
import org.eclipse.emf.ecore.EClassifier;
import org.eclipse.emf.ecore.resource.Resource;
import org.eclipse.emf.ecore.resource.ResourceSet;
import org.eclipse.emf.ecore.resource.impl.ResourceSetImpl;
import org.eclipse.emf.ecore.util.Diagnostician;
import org.eclipse.emf.ecore.xmi.impl.XMIResourceFactoryImpl;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

/**
 * The Resolved Deployment target metamodel (#87), and the hand-written `minimal` model that is the
 * target half of both tracers before either exists.
 */
class ResolvedDeploymentTest {

    /** `emf/models/`, from the module's own directory. */
    private static final Path MODELS =
            Path.of("..", "..", "models").toAbsolutePath().normalize();

    /** The repository root, from the module's own directory. */
    private static final Path REPOSITORY =
            Path.of("..", "..", "..").toAbsolutePath().normalize();

    /**
     * The committed source descriptor, as text. A field rather than a local because CodeQL analyses
     * this file without the generated sources under `target/`, which `.github/codeql/codeql-config.yml`
     * excludes: a local whose only read sits inside an expression over a generated type reads as
     * never read.
     */
    private static final String DESCRIPTOR = descriptor();

    private static String descriptor() {
        try {
            return Files.readString(
                    REPOSITORY.resolve("spec/v1/examples/expected/descriptor.json"), StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    private static ResolvedDeployment minimal() {
        ResourceSet resources = new ResourceSetImpl();
        resources
                .getResourceFactoryRegistry()
                .getExtensionToFactoryMap()
                .put(Resource.Factory.Registry.DEFAULT_EXTENSION, new XMIResourceFactoryImpl());
        resources.getPackageRegistry().put(ResolvedDeploymentPackage.eNS_URI, ResolvedDeploymentPackage.eINSTANCE);
        URI uri = URI.createFileURI(MODELS.resolve("minimal.resolveddeployment").toString());
        return (ResolvedDeployment)
                resources.getResource(uri, true).getContents().get(0);
    }

    @Test
    void theHandWrittenMinimalModelValidatesAgainstTheMetamodel() {
        Diagnostic diagnostic = Diagnostician.INSTANCE.validate(minimal());

        assertThat(diagnostic.getChildren()).isEmpty();
        assertThat(diagnostic.getSeverity()).isEqualTo(Diagnostic.OK);
    }

    @Test
    void itsExportedDependencyEdgesEqualTheCommittedOracle() throws IOException {
        // notes holds no dependency edge, so the export is the empty list the
        // committed oracle carries. The shape is what both implementations match.
        Path oracle = REPOSITORY.resolve("spec/v1/examples/minimal/expected/dependencies.json");

        String exported = CanonicalJson.write(DependencyEdges.of(minimal()));

        assertThat(exported).isEqualTo(Files.readString(oracle, StandardCharsets.UTF_8));
    }

    @Test
    void aRunLeavesTheEdgesWhereTheContractLooksForThem(@TempDir Path directory) throws IOException {
        Path written = DependencyEdges.write(directory, minimal());

        assertThat(written).hasFileName(DependencyEdges.NAME);
        assertThat(Files.readString(written, StandardCharsets.UTF_8))
                .isEqualTo(CanonicalJson.write(DependencyEdges.of(minimal())));
    }

    @Test
    void everyResourceFamilyOfTheProposalHasATypedClassTheTemplatesWalk() {
        // The project proposal's generated-resources table, one row per family:
        // a namespace and indexes, workload resources with their identity,
        // network policy, edge routing, monitoring, and secret resources.
        assertThat(ResolvedDeploymentPackage.eINSTANCE.getEClassifiers().stream()
                        .filter(EClass.class::isInstance)
                        .map(EClass.class::cast)
                        .filter(type -> !type.isAbstract())
                        .filter(type -> ResolvedDeploymentPackage.eINSTANCE
                                .getDeliverable()
                                .isSuperTypeOf(type))
                        .map(EClassifier::getName)
                        .collect(Collectors.toSet()))
                .containsExactlyInAnyOrder(
                        "NamespaceFile",
                        "IndexFile",
                        "WorkloadFile",
                        "IdentityFile",
                        "NetworkPolicyFile",
                        "IngressRouteFile",
                        "MonitorFile",
                        "SecretFile");
    }

    @Test
    void theMinimalModelAssignsAPathToEveryFileTheRenderedTreeHolds() {
        // The paths under spec/v1/examples/minimal/rendered/, which is what the
        // Acceleo templates must write (#94).
        List<String> paths =
                minimal().getDeliverables().stream().map(Deliverable::getPath).toList();

        assertThat(paths)
                .containsExactlyInAnyOrder(
                        "namespace.yaml",
                        "kustomization.yaml",
                        "apps/notes/kustomization.yaml",
                        "apps/notes/workload.yaml",
                        "apps/notes/serviceaccount.yaml",
                        "apps/notes/servicemonitor.yaml",
                        "apps/notes/networkpolicy.yaml",
                        "edge/ingressroutes.yaml");
    }

    @Test
    void thePathsItAssignsAreThePathsTheRenderedTreeActuallyHolds() throws IOException {
        Path rendered = REPOSITORY.resolve("spec/v1/examples/minimal/rendered");
        try (var files = Files.walk(rendered)) {
            Set<String> onDisk = files.filter(Files::isRegularFile)
                    .map(file -> rendered.relativize(file).toString())
                    .filter(name -> name.endsWith(".yaml"))
                    .collect(Collectors.toSet());

            assertThat(minimal().getDeliverables().stream()
                            .map(Deliverable::getPath)
                            .collect(Collectors.toSet()))
                    .isEqualTo(onDisk);
        }
    }

    /**
     * `minimal` holds no dependency edge, which is the point of it, so the export's own shape is
     * proved on a model built here: one edge whose connection the policy names a peer for, and one
     * that resolves to an address with no peer of its own.
     */
    @Test
    void anEdgeExportsItsConsumer_itsProviderAndThePeersThePolicyAllows() {
        ResolvedDeploymentFactory make = ResolvedDeploymentFactory.eINSTANCE;
        ResolvedDeployment deployment = make.createResolvedDeployment();
        ResolvedApplication application = make.createResolvedApplication();
        application.setId("knowledge");
        ResolvedProcess process = make.createResolvedProcess();
        process.setName("knowledge-api");
        ResolvedEdge withPeer = make.createResolvedEdge();
        withPeer.setApplication("platform-postgres");
        withPeer.setSurface("postgres");
        withPeer.setAddress("platform-postgres.data-system.svc.cluster.local:5432");
        PolicyPeer peer = make.createPolicyPeer();
        peer.setNamespace("data-system");
        peer.setProcess("platform-postgres");
        peer.setPort(5432);
        withPeer.getPeers().add(peer);
        ResolvedEdge withoutPeer = make.createResolvedEdge();
        withoutPeer.setApplication("stalwart");
        withoutPeer.setSurface("smtp");
        withoutPeer.setAddress("10.0.0.12:25");
        process.getDependencies().add(withPeer);
        process.getDependencies().add(withoutPeer);
        application.getProcesses().add(process);
        deployment.getApplications().add(application);

        String exported = CanonicalJson.write(DependencyEdges.of(deployment));

        assertThat(exported)
                .isEqualTo("{\"applications\":[{\"edges\":["
                        + "{\"address\":\"platform-postgres.data-system.svc.cluster.local:5432\","
                        + "\"application\":\"platform-postgres\",\"consumer\":\"knowledge-api\","
                        + "\"peers\":[{\"namespace\":\"data-system\",\"port\":5432,"
                        + "\"process\":\"platform-postgres\"}],\"surface\":\"postgres\"},"
                        + "{\"address\":\"10.0.0.12:25\",\"application\":\"stalwart\","
                        + "\"consumer\":\"knowledge-api\",\"surface\":\"smtp\"}],"
                        + "\"id\":\"knowledge\"}]}");
    }

    /**
     * The descriptor covers the source metamodel only: target structures are compared through what
     * they generate, not structurally (docs/architecture.md#the-parity-contract). A target class
     * reaching the descriptor would put this implementation's shape into an oracle the other one
     * has to match, and the two shape layer 2 differently on purpose.
     */
    @Test
    void noClassOfTheTargetPackageReachesTheDescriptor() {
        // Cutover, Match and DurabilityClass are the source metamodel's own
        // vocabularies, carried here by the same names on purpose. Nothing else
        // shares a name: layer 1 has EnvVariable where layer 2 has EnvEntry,
        // because an author sets a variable and a render writes an entry.
        assertThat(ResolvedDeploymentPackage.eINSTANCE.getEClassifiers().stream()
                        .map(EClassifier::getName)
                        .filter(name -> DESCRIPTOR.contains("\"name\":\"" + name + "\""))
                        .collect(Collectors.toSet()))
                .containsExactlyInAnyOrder("Cutover", "Match", "DurabilityClass");
    }
}
