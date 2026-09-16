package dev.jorisjonkers.deploykit.emf.cli;

import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.eclipse.emf.common.util.Diagnostic;
import org.eclipse.emf.common.util.URI;
import org.eclipse.emf.ecore.EObject;
import org.eclipse.emf.ecore.EPackage;
import org.eclipse.emf.ecore.EValidator;
import org.eclipse.emf.ecore.util.Diagnostician;
import org.eclipse.ocl.xtext.completeocl.CompleteOCLStandaloneSetup;
import org.eclipse.ocl.xtext.completeocl.validation.CompleteOCLEObjectValidator;

/**
 * The Complete OCL constraints of a metamodel, evaluated over one parsed document. An invariant is
 * named by the diagnostic code it emits and its context is the object the diagnostic points at, so a
 * violation becomes a {@link dev.jorisjonkers.deploykit.emf.cli.Diagnostic} without a lookup table
 * (emf/docs/architecture.md#constraints). Every failed invariant is reported, never only the first.
 */
public final class Constraints {

    /** The invariant name inside the message Eclipse OCL builds for a violation. */
    private static final Pattern VIOLATED = Pattern.compile("'[^']*::([A-Za-z0-9_]+)' constraint is violated");

    /** The constraints the metamodel carries, as the build puts them beside its classes. */
    public static URI beside(Class<?> metamodel, String file) {
        return URI.createURI(metamodel.getResource("/" + file).toString());
    }

    private Constraints() {}

    /**
     * Evaluates {@code document} against the constraints at {@code constraints}, in document order. An
     * invariant may read the other documents of the resource set the document was read into.
     */
    public static List<dev.jorisjonkers.deploykit.emf.cli.Diagnostic> check(EObject document, URI constraints) {
        CompleteOCLStandaloneSetup.doSetup();
        EPackage metamodel = document.eClass().getEPackage();
        EValidator previous = EValidator.Registry.INSTANCE.getEValidator(metamodel);
        EValidator.Registry.INSTANCE.put(metamodel, new CompleteOCLEObjectValidator(metamodel, constraints));
        try {
            // Validation walks the document's own containment, so every refusal points into its file.
            return refusals(document.eResource().getURI().lastSegment(), Diagnostician.INSTANCE.validate(document));
        } finally {
            EValidator.Registry.INSTANCE.put(metamodel, previous);
        }
    }

    private static List<dev.jorisjonkers.deploykit.emf.cli.Diagnostic> refusals(String file, Diagnostic diagnostic) {
        List<dev.jorisjonkers.deploykit.emf.cli.Diagnostic> refusals = new ArrayList<>();
        Matcher violated = VIOLATED.matcher(diagnostic.getMessage());
        if (violated.find()) {
            // A violation carries the object it refused as its first datum.
            EObject refused = (EObject) diagnostic.getData().get(0);
            refusals.add(new dev.jorisjonkers.deploykit.emf.cli.Diagnostic(
                    violated.group(1), file, Pointer.of(refused), diagnostic.getMessage()));
        }
        for (Diagnostic child : diagnostic.getChildren()) {
            refusals.addAll(refusals(file, child));
        }
        return refusals;
    }
}
