package dev.jorisjonkers.deploykit.emf.resolve;

import static org.assertj.core.api.Assertions.assertThat;

import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.Application;
import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.Cutover;
import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.EffectiveApplication;
import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.EffectiveProject;
import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.KvGrant;
import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.Lifecycle;
import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.Placement;
import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.Process;
import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.Project;
import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.ProjectIntentFactory;
import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.ProjectIntentPackage;
import java.nio.file.Path;
import java.util.Collections;
import java.util.List;
import org.eclipse.emf.common.util.Diagnostic;
import org.eclipse.emf.common.util.URI;
import org.eclipse.m2m.qvt.oml.BasicModelExtent;
import org.eclipse.m2m.qvt.oml.ExecutionContextImpl;
import org.eclipse.m2m.qvt.oml.ExecutionDiagnostic;
import org.eclipse.m2m.qvt.oml.TransformationExecutor;
import org.junit.jupiter.api.Test;

/**
 * REQ-036: Shared Intent declared at the Project or an Application reaches every Process below it,
 * lists extend each other, and the lowest declaration of one thing holds
 * (spec/v1/10-project-intent.md#the-effective-intent).
 */
class LoweringTest {

    private static final ProjectIntentFactory MODEL = ProjectIntentFactory.eINSTANCE;

    /** One declaration of each shape the merge has to get right. */
    private static Project source() {
        Project project = MODEL.createProject();
        project.setApiVersion("intent.jorisjonkers.dev/v1");
        project.setKind("Project");
        project.setSchemaVersion("1.0.0");
        project.setProject("refusals");
        project.setOwner("joris");
        project.getSecrets().add(grant("secret/data/refusals/estate-ca"));
        project.getWritablePaths().add("/tmp");
        project.setPlacement(dimensions("enschede"));

        Application application = MODEL.createApplication();
        application.setId("shared-intent-merged");
        application.getSecrets().add(grant("secret/data/refusals/queue"));
        application.setCutover(Cutover.RECREATE);

        Process api = process("shared-intent-merged-api", "128Mi", "25m");
        api.getSecrets().add(grant("secret/data/refusals/bearer"));
        api.getWritablePaths().add("/var/cache/api");

        Process worker = process("shared-intent-merged-worker", "64Mi", "10m");
        worker.getPlacement().setSite("frankfurt");

        application.getProcesses().add(api);
        application.getProcesses().add(worker);
        project.getApplications().add(application);
        return project;
    }

    private static KvGrant grant(String path) {
        KvGrant grant = MODEL.createKvGrant();
        grant.setPath(path);
        grant.getKeys().add("token");
        return grant;
    }

    private static Placement dimensions(String site) {
        Placement placement = MODEL.createPlacement();
        placement.setSite(site);
        return placement;
    }

    private static Process process(String name, String memory, String cpu) {
        Process process = MODEL.createProcess();
        process.setName(name);
        process.setLifecycle(Lifecycle.APPLICATION);
        process.setImage(name);
        Placement placement = MODEL.createPlacement();
        placement.setMemory(memory);
        placement.setCpu(cpu);
        process.setPlacement(placement);
        return process;
    }

    private static EffectiveProject lower(Project project) {
        ProjectIntentPackage.eINSTANCE.getName();
        BasicModelExtent source = new BasicModelExtent(Collections.singletonList(project));
        BasicModelExtent target = new BasicModelExtent();

        ExecutionDiagnostic result = new TransformationExecutor(URI.createFileURI(
                        Path.of("model", "lower.qvto").toAbsolutePath().toString()))
                .execute(new ExecutionContextImpl(), source, target);

        assertThat(result.getSeverity()).as(result.toString()).isEqualTo(Diagnostic.OK);
        return (EffectiveProject) target.getContents().get(0);
    }

    private static Process lowered(EffectiveProject project, String name) {
        EffectiveApplication application = project.getApplications().get(0);
        return application.getProcesses().stream()
                .filter(process -> name.equals(process.getName()))
                .findFirst()
                .orElseThrow();
    }

    private static List<String> paths(Process process) {
        return process.getSecrets().stream()
                .map(KvGrant.class::cast)
                .map(KvGrant::getPath)
                .sorted()
                .toList();
    }

    @Test
    void everyProcessHoldsTheGrantsOfEveryLevelAboveItExtendedByItsOwn() {
        EffectiveProject lowered = lower(source());

        assertThat(paths(lowered(lowered, "shared-intent-merged-api")))
                .containsExactly(
                        "secret/data/refusals/bearer", "secret/data/refusals/estate-ca", "secret/data/refusals/queue");
        // A sibling holds fewer, so the lists extend rather than have to match.
        assertThat(paths(lowered(lowered, "shared-intent-merged-worker")))
                .containsExactly("secret/data/refusals/estate-ca", "secret/data/refusals/queue");
    }

    @Test
    void eachNodeDimensionComesFromTheLowestLevelThatSetItAndTheQuantitiesFromTheProcess() {
        EffectiveProject lowered = lower(source());

        Placement api = lowered(lowered, "shared-intent-merged-api").getPlacement();
        assertThat(api.getMemory()).isEqualTo("128Mi");
        assertThat(api.getSite()).isEqualTo("enschede");
        // The Process replaces `site`: each key merges on its own.
        Placement worker = lowered(lowered, "shared-intent-merged-worker").getPlacement();
        assertThat(worker.getMemory()).isEqualTo("64Mi");
        assertThat(worker.getSite()).isEqualTo("frankfurt");
    }

    @Test
    void theCutoverQuestionIsAnsweredOnceForTheReleaseUnitThatSwitchesTogether() {
        EffectiveProject lowered = lower(source());

        assertThat(lowered.getApplications().get(0).getProcesses())
                .allSatisfy(process -> assertThat(process.getCutover()).isEqualTo(Cutover.RECREATE));
    }

    @Test
    void theWritablePathsExtendAndTheLoweredLevelsHoldOnlyWhatDefinesThem() {
        EffectiveProject lowered = lower(source());

        assertThat(lowered(lowered, "shared-intent-merged-api").getWritablePaths())
                .containsExactly("/var/cache/api", "/tmp");
        assertThat(lowered(lowered, "shared-intent-merged-worker").getWritablePaths())
                .containsExactly("/tmp");
        // No SharedIntent at all, which is what makes the wrong level unreadable.
        assertThat(ProjectIntentPackage.eINSTANCE.getEffectiveApplication().getEAllStructuralFeatures())
                .extracting(feature -> feature.getName())
                .containsExactlyInAnyOrder("id", "observability", "exposure", "processes");
    }
}
