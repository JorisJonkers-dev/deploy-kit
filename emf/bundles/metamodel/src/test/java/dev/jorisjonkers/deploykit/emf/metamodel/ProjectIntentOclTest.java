package dev.jorisjonkers.deploykit.emf.metamodel;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
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

/**
 * What emf/README.md's step 3 shows an examiner, headless: Project Intent's Complete OCL document,
 * loaded beside the metamodel it constrains, refuses the one Project of the two that breaks an
 * invariant, and names that invariant. The models are read through the metamodel file, as the
 * Sample Reflective Ecore Model Editor reads them, never through the generated package.
 */
class ProjectIntentOclTest {

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

    /**
     * The metamodel file, answering its nsURI in this resource set alone: the document imports the
     * package by nsURI, and a test elsewhere in this JVM may have registered the generated one globally.
     */
    private static EPackage metamodel(ResourceSet resources) {
        EPackage intent = (EPackage) resources
                .getResource(uri("project-intent.ecore"), true)
                .getContents()
                .get(0);
        resources.getPackageRegistry().put(intent.getNsURI(), intent);
        return intent;
    }

    /**
     * The one model at {@code file}, validated in a resource set of its own with the document loaded,
     * as an editor holds it: an invariant across documents ranges over its resource set, so two
     * Projects read together would each refuse the other's name.
     */
    private static Diagnostic validate(String file) {
        OCL ocl = ocl();
        ResourceSet resources = ocl.getResourceSet();
        EPackage intent = metamodel(resources);
        EValidator.Registry.INSTANCE.put(intent, new CompleteOCLEObjectValidator(intent, uri("project-intent.ocl")));
        try {
            EObject project =
                    resources.getResource(uri(file), true).getContents().get(0);
            assertThat(project.eClass().getEPackage()).isSameAs(intent);
            return Diagnostician.INSTANCE.validate(project);
        } finally {
            EValidator.Registry.INSTANCE.remove(intent);
            ocl.dispose();
        }
    }

    /** Every invariant a validation reports, as Eclipse OCL names it: {@code Class::NAME}. */
    private static List<String> violated(Diagnostic diagnostic) {
        List<String> violated = new ArrayList<>();
        String message = diagnostic.getMessage();
        if (message != null && message.contains("' constraint is violated")) {
            violated.add(message.substring(message.indexOf('\'') + 1, message.indexOf("' constraint")));
        }
        diagnostic.getChildren().forEach(child -> violated.addAll(violated(child)));
        return violated;
    }

    @Test
    void theProjectValidatesClean() {
        Diagnostic accepted = validate("cache.xmi");

        assertThat(violated(accepted)).isEmpty();
        assertThat(accepted.getSeverity()).isEqualTo(Diagnostic.OK);
    }

    @Test
    void itsContinuousCutoverOverAVolumeBreaksExactlyOneInvariant() {
        Diagnostic refused = validate("cache-continuous.xmi");

        assertThat(violated(refused)).containsExactly("Process::E_CUTOVER_UNHONOURABLE");
        // Eclipse OCL reports a failed invariant as a warning unless the constraint says otherwise.
        assertThat(refused.getSeverity()).isEqualTo(Diagnostic.WARNING);
    }
}
