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
import org.eclipse.emf.ecore.resource.Resource;
import org.eclipse.emf.ecore.resource.impl.ResourceImpl;
import org.eclipse.emf.ecore.resource.impl.ResourceSetImpl;
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

    /** One failed invariant: its code, the object it refused, the feature it names, and what Eclipse said. */
    record Violation(String code, EObject object, String feature, String message) {}

    /**
     * Evaluates {@code document} against the constraints at {@code constraints}, in document order. An
     * invariant may read the other documents of the resource set the document was read into.
     */
    public static List<dev.jorisjonkers.deploykit.emf.cli.Diagnostic> check(EObject document, URI constraints) {
        String file = document.eResource().getURI().lastSegment();
        List<dev.jorisjonkers.deploykit.emf.cli.Diagnostic> refusals = new ArrayList<>();
        for (Violation violation : violations(document, constraints)) {
            // An invariant named CODE__feature refuses one feature of the object, and its path says so.
            refusals.add(new dev.jorisjonkers.deploykit.emf.cli.Diagnostic(
                    violation.code(),
                    file,
                    Pointer.of(violation.object()) + (violation.feature().isEmpty() ? "" : "/" + violation.feature()),
                    violation.message()));
        }
        return refusals;
    }

    /**
     * Every invariant of {@code constraints} that {@code document} and what it contains fail, in
     * document order, each with the object it refused. The document needs no resource of its own.
     */
    static List<Violation> violations(EObject document, URI constraints) {
        CompleteOCLStandaloneSetup.doSetup();
        EPackage metamodel = document.eClass().getEPackage();
        EValidator previous = EValidator.Registry.INSTANCE.getEValidator(metamodel);
        EValidator.Registry.INSTANCE.put(metamodel, new CompleteOCLEObjectValidator(metamodel, constraints));
        // An invariant is evaluated in the resource set of its object, so a model a transformation
        // built is held in one of its own for as long as it is asked.
        Resource held = document.eResource() == null ? new ResourceImpl() : null;
        if (held != null) {
            new ResourceSetImpl().getResources().add(held);
            held.getContents().add(document);
        }
        try {
            // Validation walks the document's own containment, so every refusal points into its file.
            return violations(Diagnostician.INSTANCE.validate(document));
        } finally {
            EValidator.Registry.INSTANCE.put(metamodel, previous);
            if (held != null) {
                held.getContents().remove(document);
            }
        }
    }

    private static List<Violation> violations(Diagnostic diagnostic) {
        List<Violation> violations = new ArrayList<>();
        Matcher violated = VIOLATED.matcher(diagnostic.getMessage());
        if (violated.find()) {
            // A violation carries the object it refused as its first datum.
            String[] named = violated.group(1).split("__", 2);
            violations.add(new Violation(
                    named[0],
                    (EObject) diagnostic.getData().get(0),
                    named.length == 1 ? "" : named[1],
                    diagnostic.getMessage()));
        }
        for (Diagnostic child : diagnostic.getChildren()) {
            violations.addAll(violations(child));
        }
        return violations;
    }
}
