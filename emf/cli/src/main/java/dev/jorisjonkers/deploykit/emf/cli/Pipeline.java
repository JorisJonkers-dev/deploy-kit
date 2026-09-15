package dev.jorisjonkers.deploykit.emf.cli;

import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.ProjectIntentPackage;
import dev.jorisjonkers.deploykit.emf.syntax.ProjectIntentStandaloneSetup;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import org.eclipse.emf.common.util.URI;
import org.eclipse.emf.ecore.EObject;
import org.eclipse.emf.ecore.EPackage;
import org.eclipse.emf.ecore.resource.Resource;
import org.eclipse.xtext.EcoreUtil2;
import org.eclipse.xtext.linking.impl.XtextLinkingDiagnostic;
import org.eclipse.xtext.resource.XtextResourceSet;

/**
 * The pipeline entry: an authored project file in, its parsed intent or the diagnostics that refused
 * it out. It is the seam the parity suite runs every case through.
 */
public final class Pipeline {

    /** The Complete OCL file the metamodel carries, beside its classes. */
    private static final String CONSTRAINTS = "project-intent.ocl";

    private Pipeline() {}

    /** The parsed intent of the project file at {@code path}, or the diagnostics refusing it. */
    public static Parsed intent(Path path) {
        // Outside OSGi nothing registers the metamodel, and the grammar's rules return its classes.
        EPackage.Registry.INSTANCE.putIfAbsent(ProjectIntentPackage.eNS_URI, ProjectIntentPackage.eINSTANCE);
        XtextResourceSet resources = new ProjectIntentStandaloneSetup()
                .createInjectorAndDoEMFRegistration()
                .getInstance(XtextResourceSet.class);
        Resource resource =
                resources.getResource(URI.createFileURI(path.toAbsolutePath().toString()), true);
        // Linking is lazy: every reference is resolved before the errors are read, so a name that links to
        // nothing is among them.
        EcoreUtil2.resolveAll(resource);
        List<Diagnostic> refusals = new ArrayList<>();
        List<Diagnostic> unlinked = new ArrayList<>();
        for (Resource.Diagnostic error : resource.getErrors()) {
            if (error instanceof XtextLinkingDiagnostic linking) {
                EObject owner = resource.getEObject(linking.getUriToProblem().fragment());
                unlinked.add(new Diagnostic(linking.getCode(), Pointer.of(owner), linking.getMessage()));
            } else {
                refusals.add(
                        new Diagnostic(Diagnostic.SCHEMA, "", "line " + error.getLine() + ": " + error.getMessage()));
            }
        }
        if (resource.getContents().isEmpty()) {
            refusals.add(new Diagnostic(Diagnostic.SCHEMA, "", path.getFileName() + " holds no document"));
        }
        if (!refusals.isEmpty()) {
            return Parsed.refused(refusals);
        }
        EObject document = resource.getContents().get(0);
        List<Diagnostic> broken = new ArrayList<>(
                Constraints.check(document, Constraints.beside(ProjectIntentPackage.class, CONSTRAINTS)));
        broken.addAll(unlinked);
        return broken.isEmpty() ? Parsed.of(IntentJson.of(document)) : Parsed.refused(broken);
    }
}
