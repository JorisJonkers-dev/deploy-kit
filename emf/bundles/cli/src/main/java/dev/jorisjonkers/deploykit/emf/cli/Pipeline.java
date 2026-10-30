package dev.jorisjonkers.deploykit.emf.cli;

import com.google.inject.Injector;
import dev.jorisjonkers.deploykit.emf.metamodel.pinnedinputs.AssetFile;
import dev.jorisjonkers.deploykit.emf.metamodel.pinnedinputs.ImagesLock;
import dev.jorisjonkers.deploykit.emf.metamodel.pinnedinputs.PinnedInputsFactory;
import dev.jorisjonkers.deploykit.emf.metamodel.pinnedinputs.PinnedInputsPackage;
import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.AlertRules;
import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.Application;
import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.Asset;
import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.AssetDeclaration;
import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.Dashboard;
import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.Platform;
import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.Project;
import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.ProjectIntentPackage;
import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.SharedIntent;
import dev.jorisjonkers.deploykit.emf.metamodel.resolveddeployment.ResolvedDeployment;
import dev.jorisjonkers.deploykit.emf.render.Rendering;
import dev.jorisjonkers.deploykit.emf.resolve.Lowering;
import dev.jorisjonkers.deploykit.emf.resolve.Resolution;
import dev.jorisjonkers.deploykit.emf.syntax.ClusterStateStandaloneSetup;
import dev.jorisjonkers.deploykit.emf.syntax.ImagesLockStandaloneSetup;
import dev.jorisjonkers.deploykit.emf.syntax.MigrationProofStandaloneSetup;
import dev.jorisjonkers.deploykit.emf.syntax.NodeContractStandaloneSetup;
import dev.jorisjonkers.deploykit.emf.syntax.PlatformIntentStandaloneSetup;
import dev.jorisjonkers.deploykit.emf.syntax.ProjectIntentStandaloneSetup;
import dev.jorisjonkers.deploykit.emf.syntax.linking.UnlinkedNames;
import dev.jorisjonkers.deploykit.emf.syntax.schema.Shapes;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.SortedSet;
import java.util.TreeSet;
import java.util.regex.Pattern;
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
import org.eclipse.xtext.Grammar;
import org.eclipse.xtext.IGrammarAccess;
import org.eclipse.xtext.linking.impl.XtextLinkingDiagnostic;
import org.eclipse.xtext.resource.IResourceFactory;
import org.eclipse.xtext.resource.XtextResource;
import org.eclipse.xtext.resource.XtextResourceSet;

/**
 * The pipeline entry: authored files in, their parsed intent or the diagnostics that refused them out.
 * It is the seam the parity suite runs every case through.
 *
 * <p>Which language reads a file is the file name's to say: {@code platform.intent.yml} is a Platform
 * document and {@code *.project.yml} a project file. A set handed to {@link #check} also reads any other
 * YAML file whose document says {@code kind: Project} as one, as a composition fixture standing in for a
 * published fragment does (spec/v1/10-project-intent.md#two-artefacts). A set of files is read into one
 * resource set, so a tier's proxy links to an Application another file declares.
 */
public final class Pipeline {

    /** The Complete OCL file the metamodel carries, beside its classes. */
    private static final String CONSTRAINTS = "project-intent.ocl";

    /** The code an Asset earns whose file is not beside its project file. */
    private static final String ASSET_NOT_FOUND = "E_ASSET_NOT_FOUND";

    /** The code an env file earns whose scope directory names no level of the project file. */
    private static final String UNKNOWN_ENV_SCOPE = "E_UNKNOWN_ENV_SCOPE";

    /** The codes of what a Process holds across its levels and its env files, asked of a document that holds. */
    private static final java.util.Set<String> ACROSS_THE_UNION =
            java.util.Set.of("E_SELF_WITHOUT_VAULT_CLIENT", "E_CLIENT_PLACEHOLDER_WITHOUT_SECRET");

    /** The code an image earns that a pod runs as its own user where the lock holds it as root. */
    private static final String IMAGE_RUNS_AS_ROOT = "E_IMAGE_RUNS_AS_ROOT";

    /** The code a Project the mesh enrols earns where no project file declares it. */
    private static final String UNKNOWN_ENROLLED_PROJECT = "E_UNKNOWN_ENROLLED_PROJECT";

    private static final String PLATFORM = "platform.intent.yml";
    private static final String PROJECT = ".project.yml";
    private static final String YAML = ".yml";

    /** A document's own {@code kind: Project}, at the top level, with an optional comment after it. */
    private static final Pattern DECLARES_PROJECT = Pattern.compile("(?m)^kind:[ \\t]*Project[ \\t]*(#.*)?$");

    /** The pinned inputs resolution reads beside the intent, each by its own file name. */
    private static final String NODE_CONTRACT = "node-contract.yml";

    private static final String IMAGES_LOCK = "images.lock.yml";
    private static final String CLUSTER_STATE = "cluster-state.yml";
    private static final String MIGRATION_PROOF = "migration-proof.yml";

    private Pipeline() {}

    /** The parsed intent of the one authored file at {@code path}, or the diagnostics refusing it. */
    public static Parsed intent(Path path) {
        // Checked with the env files beside it, since what a Process reads through them is part of what
        // is checked of it; the intent is the authored document alone.
        Resource checked = read(List.of(path)).get(0);
        withEnv(checked, path);
        List<Diagnostic> refusals = refusals(checked, false);
        return refusals.isEmpty()
                ? Parsed.of(
                        IntentJson.of(read(List.of(path)).get(0).getContents().get(0)))
                : Parsed.refused(refusals);
    }

    /**
     * The Effective Intent of the one project file at {@code path}: the file and the env files under
     * the {@code env/} directory beside it, lowered onto the Processes that hold them
     * (spec/v1/10-project-intent.md#the-effective-intent), or the diagnostics refusing either.
     */
    public static Parsed effective(Path path) throws IOException {
        Resource resource = read(List.of(path)).get(0);
        // What a Process reads through its env files is part of what is checked of it.
        withEnv(resource, path);
        List<Diagnostic> refusals = new ArrayList<>(refusals(resource, false));
        EnvFiles.Read env = EnvFiles.read(envBeside(path));
        refusals.addAll(env.diagnostics());
        if (!refusals.isEmpty()) {
            return Parsed.refused(refusals);
        }
        Project project = (Project) resource.getContents().get(0);
        for (EnvFiles.Scoped scoped : env.files()) {
            if (levelOf(project, scoped.scope()).isEmpty()) {
                refusals.add(new Diagnostic(
                        UNKNOWN_ENV_SCOPE,
                        scoped.path(),
                        scoped.path(),
                        "this scope directory names nothing the project file declares"));
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
        Authored authored = authored(files);
        if (!authored.ok()) {
            return Resolved.refused(authored.diagnostics());
        }
        List<EObject> intent = new ArrayList<>();
        for (EObject root : authored.intent()) {
            intent.add(root);
            // The authored Project stays in the extent beside its lowering: the Platform document's
            // links point into it, and the transformation reads the lowering.
            if (root instanceof Project document) {
                intent.add(Lowering.lower(document));
            }
        }
        return Resolved.of(
                Resolution.resolve(intent, authored.pinned(), project, schemaPackageIntegrity),
                intent,
                authored.pinned());
    }

    /**
     * {@code files} read together as the resolution reads them, before any project is lowered: every
     * authored Project with the env files beside it on the levels they name, the Platform document, and
     * the pinned inputs with the file each Asset names. A set the checks refuse is refused here.
     */
    public static Authored authored(List<Path> files) throws IOException {
        List<Diagnostic> refusals = new ArrayList<>(check(files));
        if (!refusals.isEmpty()) {
            return Authored.refused(refusals);
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
                    intent.add(authored);
                    pinned.addAll(assetFiles(authored, files.get(i)));
                }
                case Platform platform -> intent.add(platform);
                default -> pinned.add(root);
            }
        }
        return refusals.isEmpty() ? Authored.of(intent, pinned) : Authored.refused(refusals);
    }

    /**
     * The Deliverable Sets of {@code projects}, from {@code files} read together, written under
     * {@code root} in one pass: every document parsed and checked, each project lowered and resolved,
     * and the templates run over the Resolved Deployments (spec/v1/30-deliverables.md): lower, then
     * resolve, then render. Rendered together, the projects write the estate-scoped share they hold
     * between them, which each resolution plans beside its own model. A set the checks
     * refuse writes nothing, and its diagnostics are returned.
     */
    public static List<Diagnostic> render(
            List<Path> files, List<String> projects, String schemaPackageIntegrity, Path root) throws IOException {
        List<ResolvedDeployment> deployments = new ArrayList<>();
        for (String project : projects) {
            Resolved resolved = resolve(files, project, schemaPackageIntegrity);
            if (!resolved.ok()) {
                return resolved.diagnostics();
            }
            deployments.add(resolved.deployment());
        }
        Rendering.render(deployments, root);
        return List.of();
    }

    /**
     * The file each Asset of {@code project} names, read as text from beside its project file
     * (spec/v1/10-project-intent.md#assets). Every one is there, or {@link #check} refused the set
     * with E_ASSET_NOT_FOUND.
     */
    private static List<AssetFile> assetFiles(Project project, Path file) throws IOException {
        // An Asset, mounted or seeded, and every dashboard and alert rules file the project names
        // are read from beside it; only an Asset's absence is refused before resolution.
        List<String> named = new ArrayList<>();
        EcoreUtil2.getAllContentsOfType(project, AssetDeclaration.class).forEach(asset -> named.add(asset.getFrom()));
        EcoreUtil2.getAllContentsOfType(project, Dashboard.class).forEach(board -> named.add(board.getFrom()));
        EcoreUtil2.getAllContentsOfType(project, AlertRules.class).forEach(rules -> named.add(rules.getFrom()));
        List<AssetFile> read = new ArrayList<>();
        for (String from : named) {
            Optional<Path> beside = besideProject(file, from);
            if (beside.isPresent()) {
                AssetFile assetFile = PinnedInputsFactory.eINSTANCE.createAssetFile();
                assetFile.setProject(project.getProject());
                assetFile.setFrom(from);
                assetFile.setContent(Files.readString(beside.get(), StandardCharsets.UTF_8));
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
                .filter(file -> isPlatform(file) || isProject(file))
                .toList();
        List<Diagnostic> refusals = new ArrayList<>();
        for (Path document : documents) {
            Resource alone = read(List.of(document)).get(0);
            withEnv(alone, document);
            refusals.addAll(refusals(alone, false));
        }
        if (!refusals.isEmpty()) {
            return refusals;
        }
        List<Resource> read = read(documents);
        List<ShippedFiles.Placed> placed = new ArrayList<>();
        List<String> projects = new ArrayList<>();
        Map<Project, String> named = new LinkedHashMap<>();
        Optional<Platform> platform = Optional.empty();
        for (int i = 0; i < documents.size(); i++) {
            Path file = documents.get(i);
            if (read.get(i).getContents().get(0) instanceof Project project) {
                // What a Process holds reaches it through the env files beside its project too.
                attachEnv(project, file);
                refusals.addAll(unreadAssets(project, file));
                refusals.addAll(ShippedFiles.check(
                        project, file.getFileName().toString(), from -> textBeside(file, from), placed));
                projects.add(project.getProject());
                named.put(project, file.getFileName().toString());
            } else {
                // Only a project file and the Platform document are among the documents.
                platform = Optional.of((Platform) read.get(i).getContents().get(0));
            }
        }
        refusals.addAll(ShippedFiles.acrossTheEstate(placed, platform));
        platform.ifPresent(document -> refusals.addAll(unknownEnrolled(document, projects)));
        platform.ifPresent(document -> refusals.addAll(L4Checks.check(document, named)));
        files.stream()
                .filter(file -> file.getFileName().toString().equals(IMAGES_LOCK))
                .findFirst()
                .ifPresent(lock -> refusals.addAll(rootImages(lock, named.keySet())));
        for (Resource document : read) {
            refusals.addAll(refusals(document, true));
        }
        return refusals;
    }

    /**
     * Every Project the mesh enrols that no project file of the set declares
     * (spec/v1/14-platform-intent.md#the-mesh).
     */
    private static List<Diagnostic> unknownEnrolled(Platform platform, List<String> projects) {
        List<Diagnostic> unknown = new ArrayList<>();
        if (platform.getMesh() != null) {
            List<String> enrolled = platform.getMesh().getEnrolled();
            for (int i = 0; i < enrolled.size(); i++) {
                if (!projects.contains(enrolled.get(i))) {
                    unknown.add(new Diagnostic(
                            UNKNOWN_ENROLLED_PROJECT,
                            platform.eResource().getURI().lastSegment(),
                            Pointer.of(platform.getMesh()) + "/enrolled/" + i,
                            "no project file declares the Project " + enrolled.get(i) + " the mesh enrols"));
                }
            }
        }
        return unknown;
    }

    /**
     * Every image a pod runs as its own user that the images lock holds with uid 0
     * (spec/v1/10-project-intent.md#the-uid-is-a-pinned-input-and-the-volume-needs-a-group): the
     * posture runs every pod as non-root, and the kubelet refuses such a pod. A lock that does not
     * parse is refused for its shape, not here.
     */
    private static List<Diagnostic> rootImages(Path lock, Collection<Project> projects) {
        Resource read = read(List.of(lock)).get(0);
        return read.getErrors().isEmpty()
                ? read.getContents().stream()
                        .map(ImagesLock.class::cast)
                        .findFirst()
                        .map(images -> {
                            Map<String, Integer> uids = new LinkedHashMap<>();
                            images.getImages().forEach(image -> uids.put(image.getAlias(), image.getUid()));
                            return rootAliases(uids, projects).stream()
                                    .map(alias -> new Diagnostic(
                                            IMAGE_RUNS_AS_ROOT,
                                            lock.getFileName().toString(),
                                            "/images/" + alias,
                                            "the images lock holds " + alias
                                                    + " with uid 0, and every pod runs as non-root"))
                                    .toList();
                        })
                        .orElse(List.of())
                : List.of();
    }

    /**
     * The aliases, sorted, of every image a pod of {@code projects} runs as its own user, a Process's
     * or a migration's, that {@code uids} holds as root, for each project whose every image, a
     * sidecar's too, the lock holds: an alias the lock does not hold is the share's own refusal.
     */
    static SortedSet<String> rootAliases(Map<String, Integer> uids, Collection<Project> projects) {
        SortedSet<String> root = new TreeSet<>();
        for (Project project : projects) {
            Set<String> aliases = new TreeSet<>();
            Set<String> ownUser = new TreeSet<>();
            for (Application application : project.getApplications()) {
                for (dev.jorisjonkers.deploykit.emf.metamodel.projectintent.Process process :
                        application.getProcesses()) {
                    ownUser.add(process.getImage());
                    process.getSidecars().forEach(sidecar -> aliases.add(sidecar.getImage()));
                }
                // Only a migration over the platform's runner runs an image of its own.
                if (application.getMigration()
                        instanceof dev.jorisjonkers.deploykit.emf.metamodel.projectintent.ManagedMigration) {
                    ownUser.add(application.getId() + "-migration");
                }
            }
            aliases.addAll(ownUser);
            if (uids.keySet().containsAll(aliases)) {
                ownUser.stream().filter(alias -> uids.get(alias) == 0).forEach(root::add);
            }
        }
        return root;
    }

    /** The env files beside {@code file} on the levels they name, where {@code resource} holds a project. */
    private static void withEnv(Resource resource, Path file) {
        // A document whose shape breaks is refused for its shape before anything it holds is asked.
        if (!resource.getContents().isEmpty() && resource.getContents().get(0) instanceof Project project) {
            attachEnv(project, file);
        }
    }

    /** The text of the file {@code from} names beside {@code file}, if one is there. */
    private static Optional<String> textBeside(Path file, String from) {
        return besideProject(file, from).map(path -> {
            try {
                return Files.readString(path, StandardCharsets.UTF_8);
            } catch (IOException e) {
                throw new UncheckedIOException(e);
            }
        });
    }

    /** The env files beside {@code file}, each on the level its scope directory names. */
    private static void attachEnv(Project project, Path file) {
        try {
            for (EnvFiles.Scoped scoped : EnvFiles.read(envBeside(file)).files()) {
                levelOf(project, scoped.scope())
                        .ifPresent(level -> level.getEnv().add(scoped.file()));
            }
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    /**
     * The file {@code from} names below the directory of {@code file}, if one is there: a path that
     * leaves that directory, absolute or through {@code ..}, names no file beside the project, exactly
     * as the production implementation, which reads only the files of the set, finds none.
     */
    private static Optional<Path> besideProject(Path file, String from) {
        Path directory = file.toAbsolutePath().normalize().getParent();
        Path target = directory.resolve(from).normalize();
        return target.startsWith(directory) && Files.isRegularFile(target) ? Optional.of(target) : Optional.empty();
    }

    /**
     * Every Asset of {@code project} whose file is not beside {@code file}: an Asset mounts a file its
     * fragment carries (spec/v1/10-project-intent.md#assets).
     */
    private static List<Diagnostic> unreadAssets(Project project, Path file) {
        List<Diagnostic> unread = new ArrayList<>();
        for (Asset asset : EcoreUtil2.getAllContentsOfType(project, Asset.class)) {
            if (besideProject(file, asset.getFrom()).isEmpty()) {
                unread.add(new Diagnostic(
                        ASSET_NOT_FOUND,
                        file.getFileName().toString(),
                        Pointer.of(asset) + "/from",
                        "no file " + asset.getFrom() + " is read beside the project file"));
            }
        }
        return unread;
    }

    private static boolean isPlatform(Path file) {
        return file.getFileName().toString().endsWith(PLATFORM);
    }

    /** A project file by its name, or another YAML file, never the Platform document, whose document says it is one. */
    private static boolean isProject(Path file) {
        String name = file.getFileName().toString();
        if (name.endsWith(PROJECT)) {
            return true;
        }
        if (!name.endsWith(YAML)) {
            return false;
        }
        try {
            return DECLARES_PROJECT
                    .matcher(Files.readString(file, StandardCharsets.UTF_8))
                    .find();
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
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
        List<Resource.Diagnostic> syntax = new ArrayList<>();
        for (Resource.Diagnostic error : resource.getErrors()) {
            if (!(error instanceof XtextLinkingDiagnostic)) {
                syntax.add(error);
            }
        }
        refusals.addAll(shape(resource, file, syntax));
        if (refusals.isEmpty() && resource.getContents().isEmpty()) {
            refusals.add(new Diagnostic(Diagnostic.SCHEMA, file, "", file + " holds no document"));
        }
        if (!refusals.isEmpty()) {
            return refusals;
        }
        List<Diagnostic> constraints = Constraints.check(
                resource.getContents().get(0), Constraints.beside(ProjectIntentPackage.class, CONSTRAINTS));
        // What a Process holds across its levels and env files is asked only of a document that holds
        // on its own, as the production implementation asks it of the union after each document.
        boolean holds = constraints.stream().allMatch(refusal -> ACROSS_THE_UNION.contains(refusal.code()));
        refusals.addAll(
                holds
                        ? constraints
                        : constraints.stream()
                                .filter(refusal -> !ACROSS_THE_UNION.contains(refusal.code()))
                                .toList());
        refusals.addAll(unlinked(resource, together));
        return refusals;
    }

    /**
     * Where a document's shape is wrong, as the schema's refusals say it: one diagnostic for every node
     * that is wrong, at its JSON pointer. The parser stops at its first error and cannot say where in
     * the document that is, so the grammar's own rules are read against the whole file; what the
     * parser said stands only when they find nothing.
     */
    private static List<Diagnostic> shape(Resource resource, String file, List<Resource.Diagnostic> syntax) {
        List<Diagnostic> shape = new ArrayList<>();
        if (resource instanceof XtextResource xtext) {
            try (java.io.InputStream in =
                    resource.getResourceSet().getURIConverter().createInputStream(resource.getURI())) {
                String text = new String(in.readAllBytes(), StandardCharsets.UTF_8);
                Grammar grammar = xtext.getResourceServiceProvider()
                        .get(IGrammarAccess.class)
                        .getGrammar();
                for (Shapes.Issue issue : Shapes.check(text, grammar)) {
                    shape.add(new Diagnostic(Diagnostic.SCHEMA, file, issue.path(), issue.message()));
                }
            } catch (IOException e) {
                throw new UncheckedIOException(e);
            }
        }
        if (!shape.isEmpty()) {
            return shape;
        }
        List<Diagnostic> parsed = new ArrayList<>();
        for (Resource.Diagnostic error : syntax) {
            parsed.add(
                    new Diagnostic(Diagnostic.SCHEMA, file, "", "line " + error.getLine() + ": " + error.getMessage()));
        }
        return parsed;
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
                // A name below its owner carries where it sits as the diagnostic's one datum.
                String below = linking.getData().length == 0 ? "" : linking.getData()[0];
                unlinked.add(new Diagnostic(
                        linking.getCode(),
                        resource.getURI().lastSegment(),
                        Pointer.of(owner) + below,
                        linking.getMessage()));
            }
        }
        return unlinked;
    }
}
