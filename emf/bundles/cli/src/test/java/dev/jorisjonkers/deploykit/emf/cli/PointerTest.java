package dev.jorisjonkers.deploykit.emf.cli;

import static org.assertj.core.api.Assertions.assertThat;

import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.Application;
import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.LibraryDeclaration;
import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.Observability;
import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.Platform;
import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.Process;
import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.Project;
import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.ProjectIntentFactory;
import org.eclipse.emf.ecore.EObject;
import org.junit.jupiter.api.Test;

/** Where an object sits in its document, as the pointer a diagnostic carries. */
class PointerTest {

    private static final ProjectIntentFactory MODEL = ProjectIntentFactory.eINSTANCE;

    @Test
    void theRootIsTheEmptyPointer() {
        assertThat(Pointer.of(MODEL.createProject())).isEmpty();
    }

    @Test
    void aFeatureHoldingManyValuesCarriesTheIndex() {
        Project project = MODEL.createProject();
        Application first = MODEL.createApplication();
        Application second = MODEL.createApplication();
        project.getApplications().add(first);
        project.getApplications().add(second);
        Process process = MODEL.createProcess();
        second.getProcesses().add(process);

        assertThat(Pointer.of(first)).isEqualTo("/applications/0");
        assertThat(Pointer.of(second)).isEqualTo("/applications/1");
        assertThat(Pointer.of(process)).isEqualTo("/applications/1/processes/0");
    }

    @Test
    void aFeatureHoldingOneValueCarriesItsNameAlone() {
        Project project = MODEL.createProject();
        Application application = MODEL.createApplication();
        Observability observability = MODEL.createObservability();
        project.getApplications().add(application);
        application.setObservability(observability);

        assertThat(Pointer.of(observability)).isEqualTo("/applications/0/observability");
    }

    @Test
    void aMapEntryCarriesItsKeyAndItsValueSitsAtTheEntry() {
        Platform platform = MODEL.createPlatform();
        LibraryDeclaration media = MODEL.createLibraryDeclaration();
        platform.getLibraries().put("a/b", MODEL.createLibraryDeclaration());
        platform.getLibraries().put("media", media);

        assertThat(Pointer.of(media)).isEqualTo("/libraries/media");
        assertThat(Pointer.of((EObject) platform.getLibraries().get(0))).isEqualTo("/libraries/a~1b");
    }
}
