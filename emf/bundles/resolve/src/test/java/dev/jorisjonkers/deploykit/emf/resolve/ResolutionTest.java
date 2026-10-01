package dev.jorisjonkers.deploykit.emf.resolve;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import dev.jorisjonkers.deploykit.emf.metamodel.pinnedinputs.AssetFile;
import dev.jorisjonkers.deploykit.emf.metamodel.pinnedinputs.ClusterState;
import dev.jorisjonkers.deploykit.emf.metamodel.pinnedinputs.ImagesLock;
import dev.jorisjonkers.deploykit.emf.metamodel.pinnedinputs.LockedImage;
import dev.jorisjonkers.deploykit.emf.metamodel.pinnedinputs.Node;
import dev.jorisjonkers.deploykit.emf.metamodel.pinnedinputs.NodeContract;
import dev.jorisjonkers.deploykit.emf.metamodel.pinnedinputs.PinnedInputsFactory;
import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.Asset;
import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.DurabilityClass;
import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.EffectiveApplication;
import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.EffectiveProject;
import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.HardeningClass;
import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.Lifecycle;
import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.Platform;
import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.Process;
import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.ProjectIntentFactory;
import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.Runtime;
import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.Volume;
import dev.jorisjonkers.deploykit.emf.metamodel.resolveddeployment.ResolvedApplication;
import dev.jorisjonkers.deploykit.emf.metamodel.resolveddeployment.ResolvedDeployment;
import java.util.List;
import org.eclipse.emf.ecore.EObject;
import org.eclipse.emf.ecore.util.EcoreUtil;
import org.junit.jupiter.api.Test;

/**
 * The resolution run through its executor, on the smallest union it resolves: one project of one
 * job, under a Platform document with one node to place it on. The worked examples are resolved
 * through the pipeline, which reads them; this is the transformation's own seam.
 */
class ResolutionTest {

    private static final ProjectIntentFactory INTENT = ProjectIntentFactory.eINSTANCE;
    private static final PinnedInputsFactory PINNED = PinnedInputsFactory.eINSTANCE;
    private static final String INTEGRITY = "sha256:" + "5e".repeat(32);

    private static EffectiveProject project() {
        Process worker = INTENT.createProcess();
        worker.setName("worker");
        worker.setLifecycle(Lifecycle.JOB);
        worker.setImage("worker");
        worker.setRuntime(Runtime.NONE);
        worker.setPlacement(INTENT.createPlacement());
        worker.getPlacement().setMemory("64Mi");
        worker.getPlacement().setCpu("10m");
        Asset settings = INTENT.createAsset();
        settings.setFrom("config/worker.conf");
        settings.setMountAt("/etc/worker.conf");
        worker.getAssets().add(settings);
        EffectiveApplication application = INTENT.createEffectiveApplication();
        application.setId("batch");
        application.getProcesses().add(worker);
        EffectiveProject project = INTENT.createEffectiveProject();
        project.setProject("jobs");
        project.setOwner("joris");
        project.getApplications().add(application);
        return project;
    }

    private static Platform platform() {
        Platform platform = INTENT.createPlatform();
        platform.setMetadata(INTENT.createPlatformMetadata());
        platform.getMetadata().setCluster("production");
        platform.getMetadata().setProject("jorisjonkers.dev");
        platform.setSubstrate(INTENT.createSubstrate());
        platform.getSubstrate().setClusterDns("kube-system");
        platform.setHardening(HardeningClass.RESTRICTED);
        return platform;
    }

    private static List<EObject> pinned() {
        NodeContract contract = PINNED.createNodeContract();
        contract.setCluster("production");
        Node node = PINNED.createNode();
        node.setName("enschede-pi-1");
        node.setArch("arm64");
        node.setAllocatable(PINNED.createAllocatable());
        node.getAllocatable().setMemory("1Gi");
        node.getAllocatable().setCpu("2");
        contract.getNodes().add(node);
        ImagesLock lock = PINNED.createImagesLock();
        lock.setName("estate");
        LockedImage image = PINNED.createLockedImage();
        image.setAlias("worker");
        image.setRepository("ghcr.io/jorisjonkers-dev/jobs/worker");
        image.setDigest("sha256:" + "ab".repeat(32));
        image.setUid(1000);
        image.setGid(1000);
        lock.getImages().add(image);
        ClusterState snapshot = PINNED.createClusterState();
        snapshot.setCluster("production");
        AssetFile settings = PINNED.createAssetFile();
        settings.setProject("jobs");
        settings.setFrom("config/worker.conf");
        settings.setContent("threads = 4\n");
        return List.of(contract, lock, snapshot, settings);
    }

    @Test
    void theSmallestUnionResolvesToADeploymentWhoseApplicationRecordsItsOwnRevision() {
        ResolvedDeployment deployment = Resolution.resolve(List.of(project(), platform()), pinned(), "jobs", INTEGRITY);

        ResolvedApplication batch = deployment.getApplications().get(0);
        assertThat(batch.getNamespace()).isEqualTo("jobs-system");
        assertThat(batch.getProcesses().get(0).getImage())
                .isEqualTo("ghcr.io/jorisjonkers-dev/jobs/worker@sha256:" + "ab".repeat(32));
        assertThat(batch.getProcesses().get(0).getPlacement().getEligibleNodes())
                .containsExactly("enschede-pi-1");
        // An Asset is named for its Process, its file and the first digits of its content's digest.
        assertThat(batch.getProcesses().get(0).getAssets().get(0).getName()).matches("worker-worker-conf-[0-9a-f]{10}");
        // The one black box: the revision is the digest of the element, the provenance of its inputs.
        assertThat(batch.getRevision()).matches("sha256:[0-9a-f]{64}");
        assertThat(deployment.getProvenance().getRenderHash()).startsWith("sha256:");
        assertThat(deployment.getProvenance().getSchemaPackageIntegrity()).isEqualTo(INTEGRITY);
    }

    @Test
    void aProjectTheUnionDoesNotHoldResolvesToNothingAndSaysSo() {
        assertThatThrownBy(() -> Resolution.resolve(List.of(project(), platform()), pinned(), "absent", INTEGRITY))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageStartingWith("absent did not resolve");
    }

    @Test
    void aDerivationNoCaseReachesYetStopsTheRunWithTheTicketThatLandsIt() {
        // A Deployment beside a StatefulSet in one Application: one workload file cannot spell both.
        EffectiveProject project = project();
        Process stateful =
                EcoreUtil.copy(project.getApplications().get(0).getProcesses().get(0));
        stateful.setName("store");
        Volume volume = INTENT.createVolume();
        volume.setClaim("store-data");
        volume.setMountAt("/data");
        volume.setSize("1Gi");
        volume.setDurability(DurabilityClass.RECONSTRUCTIBLE);
        stateful.getVolumes().add(volume);
        project.getApplications().get(0).getProcesses().add(stateful);

        assertThatThrownBy(() -> Resolution.resolve(List.of(project, platform()), pinned(), "jobs", INTEGRITY))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("#95");
    }
}
