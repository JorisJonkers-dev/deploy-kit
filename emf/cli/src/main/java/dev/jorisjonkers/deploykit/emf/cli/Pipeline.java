package dev.jorisjonkers.deploykit.emf.cli;

import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.ProjectIntentPackage;
import dev.jorisjonkers.deploykit.emf.syntax.ProjectIntentStandaloneSetup;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import org.eclipse.emf.common.util.URI;
import org.eclipse.emf.ecore.EPackage;
import org.eclipse.emf.ecore.resource.Resource;
import org.eclipse.xtext.resource.XtextResourceSet;

/**
 * The pipeline entry: an authored project file in, its parsed intent or the diagnostics that refused
 * it out. It is the seam the parity suite runs every case through.
 */
public final class Pipeline {

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
        List<Diagnostic> refusals = new ArrayList<>();
        for (Resource.Diagnostic error : resource.getErrors()) {
            refusals.add(new Diagnostic(Diagnostic.SCHEMA, "", "line " + error.getLine() + ": " + error.getMessage()));
        }
        if (resource.getContents().isEmpty()) {
            refusals.add(new Diagnostic(Diagnostic.SCHEMA, "", path.getFileName() + " holds no document"));
        }
        return refusals.isEmpty()
                ? Parsed.of(IntentJson.of(resource.getContents().get(0)))
                : Parsed.refused(refusals);
    }
}
