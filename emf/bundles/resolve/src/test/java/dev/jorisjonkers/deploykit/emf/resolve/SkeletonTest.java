package dev.jorisjonkers.deploykit.emf.resolve;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Path;
import java.util.Collections;
import org.eclipse.emf.common.util.Diagnostic;
import org.eclipse.emf.common.util.URI;
import org.eclipse.emf.ecore.EPackage;
import org.eclipse.emf.ecore.resource.ResourceSet;
import org.eclipse.emf.ecore.resource.impl.ResourceSetImpl;
import org.eclipse.emf.ecore.xmi.impl.EcoreResourceFactoryImpl;
import org.eclipse.m2m.qvt.oml.BasicModelExtent;
import org.eclipse.m2m.qvt.oml.ExecutionContextImpl;
import org.eclipse.m2m.qvt.oml.ExecutionDiagnostic;
import org.eclipse.m2m.qvt.oml.TransformationExecutor;
import org.junit.jupiter.api.Test;

// Walking skeleton (#81): a QVT-Operational transformation runs headless.
// Deleted by the Task 2 transformation ticket, whose suite covers QVTo.
class SkeletonTest {

    private static URI model(String file) {
        return URI.createFileURI(Path.of("model", file).toAbsolutePath().toString());
    }

    @Test
    void aQvtoIdentityTransformationRuns() {
        ResourceSet resources = new ResourceSetImpl();
        resources.getResourceFactoryRegistry().getExtensionToFactoryMap().put("ecore", new EcoreResourceFactoryImpl());
        EPackage notes = (EPackage)
                resources.getResource(model("notes.ecore"), true).getContents().get(0);
        BasicModelExtent source = new BasicModelExtent(Collections.singletonList(notes));
        BasicModelExtent target = new BasicModelExtent();

        ExecutionDiagnostic result =
                new TransformationExecutor(model("identity.qvto")).execute(new ExecutionContextImpl(), source, target);

        assertThat(result.getSeverity()).as(result.toString()).isEqualTo(Diagnostic.OK);
        assertThat(target.getContents()).singleElement().isInstanceOfSatisfying(EPackage.class, copy -> {
            assertThat(copy).isNotSameAs(notes);
            assertThat(copy.getName()).isEqualTo("notes");
            assertThat(copy.getNsURI()).isEqualTo("https://example.test/notes");
        });
    }
}
