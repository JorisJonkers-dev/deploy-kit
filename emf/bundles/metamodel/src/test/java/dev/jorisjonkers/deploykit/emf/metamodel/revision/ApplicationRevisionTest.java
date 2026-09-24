package dev.jorisjonkers.deploykit.emf.metamodel.revision;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import dev.jorisjonkers.deploykit.emf.metamodel.resolveddeployment.ReconcileUnit;
import dev.jorisjonkers.deploykit.emf.metamodel.resolveddeployment.ResolvedApplication;
import dev.jorisjonkers.deploykit.emf.metamodel.resolveddeployment.ResolvedDeployment;
import dev.jorisjonkers.deploykit.emf.metamodel.resolveddeployment.ResolvedDeploymentFactory;
import dev.jorisjonkers.deploykit.emf.metamodel.resolveddeployment.ResolvedDeploymentPackage;
import dev.jorisjonkers.deploykit.emf.metamodel.resolveddeployment.ResolvedProcess;
import dev.jorisjonkers.deploykit.emf.metamodel.resolveddeployment.Switchover;
import java.nio.file.Path;
import org.eclipse.emf.common.util.URI;
import org.eclipse.emf.ecore.resource.Resource;
import org.eclipse.emf.ecore.resource.ResourceSet;
import org.eclipse.emf.ecore.resource.impl.ResourceSetImpl;
import org.eclipse.emf.ecore.xmi.impl.XMIResourceFactoryImpl;
import org.junit.jupiter.api.Test;

/**
 * REQ-038 (docs/requirements.md): an Application's revision is the digest of its own element of the
 * Resolved Deployment, so it moves exactly when a decision about the Application does.
 */
class ApplicationRevisionTest {

    /** `emf/models/`, from the module's own directory. */
    private static final Path MODELS =
            Path.of("..", "..", "models").toAbsolutePath().normalize();

    /** A fresh copy of the hand-written `minimal` model's one Application. */
    private static ResolvedApplication notes() {
        ResourceSet resources = new ResourceSetImpl();
        resources
                .getResourceFactoryRegistry()
                .getExtensionToFactoryMap()
                .put(Resource.Factory.Registry.DEFAULT_EXTENSION, new XMIResourceFactoryImpl());
        resources.getPackageRegistry().put(ResolvedDeploymentPackage.eNS_URI, ResolvedDeploymentPackage.eINSTANCE);
        URI uri = URI.createFileURI(MODELS.resolve("minimal.resolveddeployment").toString());
        ResolvedDeployment deployment = (ResolvedDeployment)
                resources.getResource(uri, true).getContents().get(0);
        return deployment.getApplications().get(0);
    }

    @Test
    void theRevisionMovesExactlyWhenADecisionAboutTheApplicationDoes() {
        ResolvedApplication notes = notes();
        String recorded = notes.getRevision();

        // The committed model records its own revision.
        assertThat(ApplicationRevision.of(notes)).isEqualTo(recorded);

        // The revision is not an input to itself.
        notes.setRevision("sha256:0000");
        assertThat(ApplicationRevision.of(notes)).isEqualTo(recorded);

        // An attribute, an enumeration literal, a contained object and a reference each move it.
        ResolvedApplication replicas = notes();
        replicas.getProcesses().get(0).setReplicas(2);
        assertThat(ApplicationRevision.of(replicas)).isNotEqualTo(recorded);

        ResolvedApplication switchover = notes();
        switchover.getProcesses().get(0).setSwitchover(Switchover.STOP_START);
        assertThat(ApplicationRevision.of(switchover)).isNotEqualTo(recorded);

        ResolvedApplication gate = notes();
        gate.getReleaseGate().setDeadline("61s");
        assertThat(ApplicationRevision.of(gate)).isNotEqualTo(recorded);

        ResolvedApplication unit = notes();
        unit.getReconcileUnit().setName("apps-elsewhere");
        assertThat(ApplicationRevision.of(unit)).isNotEqualTo(recorded);

        // The ordering the Application's unit carries is a decision about it too.
        ResolvedApplication ordering = notes();
        ReconcileUnit core = ResolvedDeploymentFactory.eINSTANCE.createReconcileUnit();
        core.setName("apps-core");
        ((ResolvedDeployment) ordering.eContainer()).getReconcileUnits().add(core);
        ordering.getReconcileUnit().getAfter().add(core);
        assertThat(ApplicationRevision.of(ordering)).isNotEqualTo(recorded);
    }

    @Test
    void anOptionalFeatureCountsOnlyWhenSet() {
        ResolvedApplication notes = notes();
        String recorded = ApplicationRevision.of(notes);
        ResolvedProcess process = notes.getProcesses().get(0);

        process.unsetSwitchover();
        assertThat(ApplicationRevision.of(notes)).isNotEqualTo(recorded);

        process.setSwitchover(Switchover.BLUE_GREEN);
        assertThat(ApplicationRevision.of(notes)).isEqualTo(recorded);
    }

    @Test
    void itIsASha256Digest() {
        assertThat(ApplicationRevision.of(notes())).matches("sha256:[0-9a-f]{64}");
    }

    @Test
    void anAlgorithmThePlatformLacksIsAnErrorNotADigest() {
        assertThatThrownBy(() -> ApplicationRevision.digest("NO-SUCH-DIGEST", "x"))
                .isInstanceOf(IllegalStateException.class);
    }
}
