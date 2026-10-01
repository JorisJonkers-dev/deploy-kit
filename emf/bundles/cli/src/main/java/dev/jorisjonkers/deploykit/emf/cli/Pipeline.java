package dev.jorisjonkers.deploykit.emf.cli;

import com.google.inject.Injector;
import dev.jorisjonkers.deploykit.emf.metamodel.pinnedinputs.AssetFile;
import dev.jorisjonkers.deploykit.emf.metamodel.pinnedinputs.PinnedInputsFactory;
import dev.jorisjonkers.deploykit.emf.metamodel.pinnedinputs.PinnedInputsPackage;
import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.Asset;
import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.Platform;
import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.Project;
import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.ProjectIntentPackage;
import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.SharedIntent;
import dev.jorisjonkers.deploykit.emf.resolve.Lowering;
import dev.jorisjonkers.deploykit.emf.resolve.Resolution;
import dev.jorisjonkers.deploykit.emf.syntax.ClusterStateStandaloneSetup;
import dev.jorisjonkers.deploykit.emf.syntax.ImagesLockStandaloneSetup;
import dev.jorisjonkers.deploykit.emf.syntax.MigrationProofStandaloneSetup;
import dev.jorisjonkers.deploykit.emf.syntax.NodeContractStandaloneSetup;
import dev.jorisjonkers.deploykit.emf.syntax.PlatformIntentStandaloneSetup;
import dev.jorisjonkers.deploykit.emf.syntax.ProjectIntentStandaloneSetup;
import dev.jorisjonkers.deploykit.emf.syntax.linking.UnlinkedNames;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Stream;
import org.eclipse.emf.common.util.URI;
import org.eclipse.emf.ecore.EObject;
import org.eclipse.emf.ecore.EPackage;
import org.eclipse.emf.ecore.resource.Resource;
import org.eclipse.emf.ecore.resource.ResourceSet;
import org.eclipse.emf.ecore.resource.impl.ResourceSetImpl;
import org.eclipse.emf.ecore.util.EcoreUtil;
import org.eclipse.emf.ecore.xmi.impl.XMIResourceImpl;
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

    /** The code an env file earns whose scope directory names no level of the project file. */
    private static final String UNKNOWN_ENV_SCOPE = "E_UNKNOWN_ENV_SCOPE";

    private static final String PLATFORM = "platform.intent.yml";
    private static final String PROJECT = ".project.yml";

    /** The pinned inputs resolution reads beside the intent, each by its own file name. */
    private static final String NODE_CONTRACT = "node-contract.yml";

    private static final String IMAGES_LOCK = "images.lock.yml";
    private static final String CLUSTER_STATE = "cluster-state.yml";
    private static final String MIGRATION_PROOF = "migration-proof.yml";

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
     * The Effective Intent of the one project file at {@code path}: the file and the env files under
     * the {@code env/} directory beside it, lowered onto the Processes that hold them
     * (spec/v1/10-project-intent.md#the-effective-intent), or the diagnostics refusing either.
     */
    public static Parsed effective(Path path) throws IOException {
        Resource resource = read(List.of(path)).get(0);
        List<Diagnostic> refusals = new ArrayList<>(refusals(resource, false));
        EnvFiles.Read env = EnvFiles.read(envBeside(path));
        refusals.addAll(env.diagnostics());
        if (!refusals.isEmpty()) {
            return Parsed.refused(refusals);
        }
        Project project = (Project) resource.getContents().get(0);
        for (EnvFiles.Scoped scoped : env.files()) {
            Optional<SharedIntent> level = levelOf(project, scoped.scope());
            if (level.isEmpty()) {
                refusals.add(new Diagnostic(
                        UNKNOWN_ENV_SCOPE,
                        scoped.path(),
                        scoped.path(),
                        "this scope directory names nothing the project file declares"));
            } else {
                level.get().getEnv().add(scoped.file());
            }
        }
        return refusals.isEmpty() ? Parsed.of(IntentJson.of(Lowering.lower(project))) : Parsed.refused(refusals);
    }

    /**
     * The Resolved Deployment of {@code project}, from {@code files} read together: the Platform
     * document, every project file of the union with the env files beside each, and the pinned inputs
     * (spec/v1/20-resolved-deployment.md#pinned-inputs). Every document is checked first, and a set
     * the checks refuse is refused here with their diagnostics, before anything is resolved.
     */
    public static Resolved resolve(List<Path> files, String project, String schemaPackageIntegrity) throws IOException {
        List<Diagnostic> refusals = new ArrayList<>(check(files));
        if (!refusals.isEmpty()) {
            return Resolved.refused(refusals);
        }
        List<Resource> documents = read(files);
        List<EObject> intent = new ArrayList<>();
        List<EObject> pinned = new ArrayList<>();
        for (int i = 0; i < files.size(); i++) {
            EObject root = documents.get(i).getContents().get(0);
            switch (root) {
                case Project authored -> {
                    EnvFiles.Read env = EnvFiles.read(envBeside(files.get(i)));
                    refusals.addAll(env.diagnostics());
                    for (EnvFiles.Scoped scoped : env.files()) {
                        levelOf(authored, scoped.scope())
                                .ifPresent(level -> level.getEnv().add(scoped.file()));
                    }
                    // The authored Project stays in the extent beside its lowering: the Platform
                    // document's links point into it, and the transformation reads the lowering.
                    intent.add(authored);
                    intent.add(Lowering.lower(authored));
                    pinned.addAll(assetFiles(authored, files.get(i)));
                }
                case Platform platform -> intent.add(platform);
                default -> pinned.add(root);
            }
        }
        return refusals.isEmpty()
                ? Resolved.of(Resolution.resolve(intent, pinned, project, schemaPackageIntegrity), intent, pinned)
                : Resolved.refused(refusals);
    }

    /**
     * The file each Asset of {@code project} names, read as text from beside its project file
     * (spec/v1/10-project-intent.md#assets). A file that is not there is left out, and the
     * transformation, which reads one per Asset, stops on its absence.
     */
    private static List<AssetFile> assetFiles(Project project, Path file) throws IOException {
        List<AssetFile> read = new ArrayList<>();
        for (Asset asset : EcoreUtil2.getAllContentsOfType(project, Asset.class)) {
            Path content = file.toAbsolutePath().resolveSibling(asset.getFrom());
            if (Files.isRegularFile(content)) {
                AssetFile assetFile = PinnedInputsFactory.eINSTANCE.createAssetFile();
                assetFile.setProject(project.getProject());
                assetFile.setFrom(asset.getFrom());
                assetFile.setContent(Files.readString(content, StandardCharsets.UTF_8));
                read.add(assetFile);
            }
        }
        return read;
    }

    /** The env files under the {@code env/} directory beside {@code path}, in path order. */
    private static List<EnvFiles.Source> envBeside(Path path) throws IOException {
        Path env = path.toAbsolutePath().resolveSibling("env");
        if (!Files.isDirectory(env)) {
            return List.of();
        }
        try (Stream<Path> tree = Files.walk(env)) {
            List<EnvFiles.Source> sources = new ArrayList<>();
            for (Path file : tree.filter(file -> file.toString().endsWith(".env"))
                    .sorted()
                    .toList()) {
                sources.add(new EnvFiles.Source(file.toString(), Files.readString(file, StandardCharsets.UTF_8)));
            }
            return sources;
        }
    }

    /** The level of {@code project} a scope directory names, or nothing where it names none. */
    private static Optional<SharedIntent> levelOf(Project project, EnvFiles.Scope scope) {
        return switch (scope.level()) {
            case PROJECT -> Optional.of(project);
            case APPLICATION ->
                project.getApplications().stream()
                        .filter(application -> scope.name().equals(application.getId()))
                        .map(SharedIntent.class::cast)
                        .findFirst();
            case PROCESS ->
                project.getApplications().stream()
                        .flatMap(application -> application.getProcesses().stream())
                        .filter(process -> scope.name().equals(process.getName()))
                        .map(SharedIntent.class::cast)
                        .findFirst();
        };
    }

    /**
     * The parsed model of the one authored file at {@code path}, serialised as XMI: the same instance
     * of the metamodel the constraints are checked on, in the form Eclipse opens without the grammar. A
     * name that links into another document stays a proxy, because the file is read alone, and is
     * written relative to the authored file beside it, never as a path on the machine that ran it.
     */
    public static String xmi(Path path) throws IOException {
        return xmi(List.of(path)).get(path);
    }

    /**
     * The parsed models of {@code files} read together, each serialised as XMI as if written beside
     * its authored file, under the name {@link #xmiName} gives it. A name one file declares and another links to is
     * written as a reference from one XMI file to the other, so the set loads in Eclipse as it is read
     * here; a name no file declares stays a proxy against the authored file. A document the pipeline
     * refuses is written all the same, so its refusal can be reproduced by validating it. A file that
     * holds no document has no model and is left out.
     */
    public static Map<Path, String> xmi(List<Path> files) throws IOException {
        List<Resource> documents = read(files);
        EcoreUtil.Copier copier = new EcoreUtil.Copier();
        ResourceSet models = new ResourceSetImpl();
        Map<Path, Resource> written = new LinkedHashMap<>();
        for (int i = 0; i < files.size(); i++) {
            if (documents.get(i).getContents().isEmpty()) {
                continue;
            }
            Path file = files.get(i);
            Resource model = new ByPath(URI.createFileURI(
                    file.toAbsolutePath().resolveSibling(xmiName(file)).toString()));
            models.getResources().add(model);
            model.getContents().add(copier.copy(documents.get(i).getContents().get(0)));
            written.put(file, model);
        }
        // Only once every root is copied does a link into another document have a copy to point at.
        copier.copyReferences();
        Map<Path, String> xmi = new LinkedHashMap<>();
        for (Map.Entry<Path, Resource> model : written.entrySet()) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            model.getValue().save(out, null);
            xmi.put(model.getKey(), out.toString(StandardCharsets.UTF_8));
        }
        return xmi;
    }

    /**
     * An XMI resource that refers to its objects by containment path, never by ID. An Application's
     * {@code id} and a Process's {@code name} are both IDs, and one document may give an Application
     * and its Process the same name, so an ID would not name one object once the file is read back.
     */
    static final class ByPath extends XMIResourceImpl {
        ByPath(URI uri) {
            super(uri);
        }

        @Override
        public String getURIFragment(EObject object) {
            EObject root = EcoreUtil.getRootContainer(object);
            return root == object ? "/" : "//" + EcoreUtil.getRelativeURIFragmentPath(root, object);
        }
    }

    /**
     * What the XMI of an authored file is called: its own name with {@code .xmi} for {@code .yml}, so
     * {@code notes.project.yml} is {@code notes.project.xmi} and the two sort side by side.
     */
    public static String xmiName(Path file) {
        return file.getFileName().toString().replaceFirst("\\.yml$", "") + ".xmi";
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
    static List<Resource> read(List<Path> files) {
        // Outside OSGi nothing registers the metamodels, and the grammars' rules return their classes.
        EPackage.Registry.INSTANCE.putIfAbsent(ProjectIntentPackage.eNS_URI, ProjectIntentPackage.eINSTANCE);
        EPackage.Registry.INSTANCE.putIfAbsent(PinnedInputsPackage.eNS_URI, PinnedInputsPackage.eINSTANCE);
        Injector project = new ProjectIntentStandaloneSetup().createInjectorAndDoEMFRegistration();
        Map<String, Injector> languages = Map.of(
                PLATFORM, new PlatformIntentStandaloneSetup().createInjectorAndDoEMFRegistration(),
                NODE_CONTRACT, new NodeContractStandaloneSetup().createInjectorAndDoEMFRegistration(),
                IMAGES_LOCK, new ImagesLockStandaloneSetup().createInjectorAndDoEMFRegistration(),
                CLUSTER_STATE, new ClusterStateStandaloneSetup().createInjectorAndDoEMFRegistration(),
                MIGRATION_PROOF, new MigrationProofStandaloneSetup().createInjectorAndDoEMFRegistration());
        XtextResourceSet resources = project.getInstance(XtextResourceSet.class);
        List<Resource> documents = new ArrayList<>();
        for (Path file : files) {
            String name = file.getFileName().toString();
            Injector language = languages.entrySet().stream()
                    .filter(named -> name.endsWith(named.getKey()))
                    .map(Map.Entry::getValue)
                    .findFirst()
                    .orElse(project);
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
            if (UnlinkedNames.ACROSS_DOCUMENTS.contains(linking.getCode()) == together) {
                EObject owner = resource.getEObject(linking.getUriToProblem().fragment());
                unlinked.add(new Diagnostic(
                        linking.getCode(), resource.getURI().lastSegment(), Pointer.of(owner), linking.getMessage()));
            }
        }
        return unlinked;
    }
}
