package dev.jorisjonkers.deploykit.emf.cli;

import com.google.inject.Injector;
import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.ProjectIntentPackage;
import dev.jorisjonkers.deploykit.emf.syntax.PlatformIntentStandaloneSetup;
import dev.jorisjonkers.deploykit.emf.syntax.ProjectIntentStandaloneSetup;
import dev.jorisjonkers.deploykit.emf.syntax.linking.UnlinkedNames;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import org.eclipse.emf.common.util.URI;
import org.eclipse.emf.ecore.EObject;
import org.eclipse.emf.ecore.EPackage;
import org.eclipse.emf.ecore.resource.Resource;
import org.eclipse.xtext.EcoreUtil2;
import org.eclipse.xtext.linking.impl.XtextLinkingDiagnostic;
import org.eclipse.xtext.resource.IResourceFactory;
import org.eclipse.xtext.resource.XtextResourceSet;

/**
 * The pipeline entry: authored files in, their parsed intent or the diagnostics that refused them out.
 * It is the seam the parity suite runs every case through.
 *
 * <p>Which language reads a file is the file name's to say: {@code platform.intent.yml} is a Platform
 * document and {@code *.project.yml} a project file. A set of files is read into one resource set, so
 * a tier's proxy links to an Application another file declares.
 */
public final class Pipeline {

    /** The Complete OCL file the metamodel carries, beside its classes. */
    private static final String CONSTRAINTS = "project-intent.ocl";

    private static final String PLATFORM = "platform.intent.yml";
    private static final String PROJECT = ".project.yml";

    private Pipeline() {}

    /** The parsed intent of the one authored file at {@code path}, or the diagnostics refusing it. */
    public static Parsed intent(Path path) {
        Resource resource = read(List.of(path)).get(0);
        List<Diagnostic> refusals = refusals(resource, false);
        return refusals.isEmpty()
                ? Parsed.of(IntentJson.of(resource.getContents().get(0)))
                : Parsed.refused(refusals);
    }

    /**
     * The diagnostics refusing {@code files} read together: each file's own first, and only when every
     * file holds, what a Platform document and the project files beside it break together. A file that
     * is neither document is not read.
     *
     * <p>Each file is first read alone, where a constraint across documents holds trivially, and the set
     * is read together only once every file holds, where the constraints of one document already do. So
     * the second reading refuses exactly what the documents break together, which is nothing when no
     * Platform document is among them.
     */
    public static List<Diagnostic> check(List<Path> files) {
        List<Path> documents = files.stream()
                .filter(file ->
                        isPlatform(file) || file.getFileName().toString().endsWith(PROJECT))
                .toList();
        List<Diagnostic> refusals = new ArrayList<>();
        for (Path document : documents) {
            refusals.addAll(refusals(read(List.of(document)).get(0), false));
        }
        if (!refusals.isEmpty()) {
            return refusals;
        }
        for (Resource document : read(documents)) {
            refusals.addAll(refusals(document, true));
        }
        return refusals;
    }

    private static boolean isPlatform(Path file) {
        return file.getFileName().toString().endsWith(PLATFORM);
    }

    /** Every file loaded into one resource set, by the language its name says, then linked. */
    private static List<Resource> read(List<Path> files) {
        // Outside OSGi nothing registers the metamodel, and the grammars' rules return its classes.
        EPackage.Registry.INSTANCE.putIfAbsent(ProjectIntentPackage.eNS_URI, ProjectIntentPackage.eINSTANCE);
        Injector project = new ProjectIntentStandaloneSetup().createInjectorAndDoEMFRegistration();
        Injector platform = new PlatformIntentStandaloneSetup().createInjectorAndDoEMFRegistration();
        XtextResourceSet resources = project.getInstance(XtextResourceSet.class);
        List<Resource> documents = new ArrayList<>();
        for (Path file : files) {
            Injector language = isPlatform(file) ? platform : project;
            Resource document = language.getInstance(IResourceFactory.class)
                    .createResource(URI.createFileURI(file.toAbsolutePath().toString()));
            resources.getResources().add(document);
            try {
                document.load(resources.getLoadOptions());
            } catch (IOException e) {
                throw new UncheckedIOException(e);
            }
            documents.add(document);
        }
        // Linking is lazy: every reference is resolved once every file is loaded, so a name that links to
        // nothing is among the errors and a name another file declares is not.
        documents.forEach(EcoreUtil2::resolveAll);
        return documents;
    }

    /**
     * What refuses one document: its shape, then its constraints and its names. A tier's proxy is a name
     * only a set of documents can link, so it is read {@code together} and every other name is not.
     */
    private static List<Diagnostic> refusals(Resource resource, boolean together) {
        String file = resource.getURI().lastSegment();
        List<Diagnostic> refusals = new ArrayList<>();
        for (Resource.Diagnostic error : resource.getErrors()) {
            if (!(error instanceof XtextLinkingDiagnostic)) {
                refusals.add(new Diagnostic(
                        Diagnostic.SCHEMA, file, "", "line " + error.getLine() + ": " + error.getMessage()));
            }
        }
        if (resource.getContents().isEmpty()) {
            refusals.add(new Diagnostic(Diagnostic.SCHEMA, file, "", file + " holds no document"));
        }
        if (!refusals.isEmpty()) {
            return refusals;
        }
        refusals.addAll(Constraints.check(
                resource.getContents().get(0), Constraints.beside(ProjectIntentPackage.class, CONSTRAINTS)));
        refusals.addAll(unlinked(resource, together));
        return refusals;
    }

    /**
     * The names in {@code resource} that link to nothing: a tier's proxy when {@code together}, and
     * every other name when not. Only a document whose shape holds is asked, so every error it carries
     * is a link.
     */
    private static List<Diagnostic> unlinked(Resource resource, boolean together) {
        List<Diagnostic> unlinked = new ArrayList<>();
        for (Resource.Diagnostic error : resource.getErrors()) {
            XtextLinkingDiagnostic linking = (XtextLinkingDiagnostic) error;
            if (UnlinkedNames.UNKNOWN_TIER_PROXY.equals(linking.getCode()) == together) {
                EObject owner = resource.getEObject(linking.getUriToProblem().fragment());
                unlinked.add(new Diagnostic(
                        linking.getCode(), resource.getURI().lastSegment(), Pointer.of(owner), linking.getMessage()));
            }
        }
        return unlinked;
    }
}
