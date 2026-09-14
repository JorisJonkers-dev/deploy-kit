package dev.jorisjonkers.deploykit.emf.metamodel;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Path;
import org.eclipse.emf.common.util.Diagnostic;
import org.eclipse.emf.common.util.URI;
import org.eclipse.emf.ecore.EObject;
import org.eclipse.emf.ecore.EPackage;
import org.eclipse.emf.ecore.EValidator;
import org.eclipse.emf.ecore.resource.ResourceSet;
import org.eclipse.emf.ecore.util.Diagnostician;
import org.eclipse.emf.ecore.xmi.impl.EcoreResourceFactoryImpl;
import org.eclipse.emf.ecore.xmi.impl.XMIResourceFactoryImpl;
import org.eclipse.ocl.pivot.utilities.OCL;
import org.eclipse.ocl.xtext.completeocl.CompleteOCLStandaloneSetup;
import org.eclipse.ocl.xtext.completeocl.validation.CompleteOCLEObjectValidator;
import org.junit.jupiter.api.Test;

// Walking skeleton (#81): Ecore and Complete OCL run headless. Deleted by the
// Task 1 metamodel ticket, whose suite covers both.
class SkeletonTest {

    private static final Path MODEL = Path.of("model").toAbsolutePath();

    private static URI uri(String file) {
        return URI.createFileURI(MODEL.resolve(file).toString());
    }

    private static OCL ocl() {
        CompleteOCLStandaloneSetup.doSetup();
        OCL ocl = OCL.newInstance(OCL.NO_PROJECTS);
        ResourceSet resources = ocl.getResourceSet();
        resources.getResourceFactoryRegistry().getExtensionToFactoryMap().put("ecore", new EcoreResourceFactoryImpl());
        resources.getResourceFactoryRegistry().getExtensionToFactoryMap().put("xmi", new XMIResourceFactoryImpl());
        return ocl;
    }

    private static EPackage register(ResourceSet resources) {
        EPackage skeleton = (EPackage)
                resources.getResource(uri("skeleton.ecore"), true).getContents().get(0);
        resources.getPackageRegistry().put(skeleton.getNsURI(), skeleton);
        return skeleton;
    }

    private static EObject load(ResourceSet resources, String file) {
        return resources.getResource(uri(file), true).getContents().get(0);
    }

    @Test
    void anEcoreMetamodelLoadsAndAnInstanceValidates() {
        OCL ocl = ocl();
        EPackage skeleton = register(ocl.getResourceSet());

        assertThat(skeleton.getEClassifiers()).extracting("name").containsExactly("Project", "Application");
        assertThat(Diagnostician.INSTANCE
                        .validate(load(ocl.getResourceSet(), "notes.xmi"))
                        .getSeverity())
                .isEqualTo(Diagnostic.OK);
        ocl.dispose();
    }

    @Test
    void aCompleteOclInvariantFiresOnAnInstance() {
        OCL ocl = ocl();
        EPackage skeleton = register(ocl.getResourceSet());
        EValidator.Registry.INSTANCE.put(skeleton, new CompleteOCLEObjectValidator(skeleton, uri("skeleton.ocl")));
        try {
            assertThat(Diagnostician.INSTANCE
                            .validate(load(ocl.getResourceSet(), "notes.xmi"))
                            .getSeverity())
                    .isEqualTo(Diagnostic.OK);
            Diagnostic refused = Diagnostician.INSTANCE.validate(load(ocl.getResourceSet(), "empty.xmi"));
            // Eclipse OCL reports a failed invariant as a warning unless the constraint says otherwise.
            assertThat(refused.getSeverity()).isEqualTo(Diagnostic.WARNING);
            assertThat(refused.getChildren())
                    .singleElement()
                    .extracting(Diagnostic::getMessage)
                    .asString()
                    .contains("skeletonHasAnApplication");
        } finally {
            EValidator.Registry.INSTANCE.remove(skeleton);
            ocl.dispose();
        }
    }
}
