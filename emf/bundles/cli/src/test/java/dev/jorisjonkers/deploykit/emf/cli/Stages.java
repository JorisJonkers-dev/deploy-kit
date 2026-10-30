package dev.jorisjonkers.deploykit.emf.cli;

import dev.jorisjonkers.deploykit.emf.metamodel.descriptor.DependencyEdges;
import dev.jorisjonkers.deploykit.emf.metamodel.json.CanonicalJson;
import dev.jorisjonkers.deploykit.emf.metamodel.pinnedinputs.PinnedInputsPackage;
import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.EffectiveProject;
import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.Project;
import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.ProjectIntentPackage;
import dev.jorisjonkers.deploykit.emf.metamodel.resolveddeployment.ResolvedDeployment;
import dev.jorisjonkers.deploykit.emf.metamodel.resolveddeployment.ResolvedDeploymentPackage;
import dev.jorisjonkers.deploykit.emf.resolve.Lowering;
import dev.jorisjonkers.deploykit.emf.resolve.Resolution;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.stream.Stream;
import org.eclipse.emf.common.util.URI;
import org.eclipse.emf.ecore.EObject;
import org.eclipse.emf.ecore.resource.Resource;
import org.eclipse.emf.ecore.resource.ResourceSet;
import org.eclipse.emf.ecore.resource.impl.ResourceSetImpl;
import org.eclipse.emf.ecore.util.EcoreUtil;
import org.eclipse.emf.ecore.xmi.impl.XMIResourceFactoryImpl;

/**
 * The stage harness: each stage of the pipeline run in-process on its own, file in and file out
 * (emf/docs/architecture.md#stage-tests). A case is a directory, {@code stages/<stage>/<case>/},
 * whose {@code expected/} holds what the stage writes. Only {@code parse} holds an {@code input/}:
 * every later stage reads the {@code expected/} of the stage before it, the same files, so one
 * golden serves in two roles and two stages cannot drift apart.
 *
 * <ul>
 *   <li>{@code parse}: the authored documents under {@code input/}, read together, to {@link
 *       #INTENT_MODEL} (every authored Project with its env files, and the Platform document), {@link
 *       #PINNED_MODEL} (the pinned inputs with each Asset's file), and each intent document's parsed
 *       intent as {@code <document>.json}.
 *   <li>{@code lower}: each Project of {@code parse}'s {@link #INTENT_MODEL}, lowered, to {@link
 *       #EFFECTIVE_MODEL} and {@code <project>.effective.json}.
 *   <li>{@code resolve}: both extents, from {@code parse} and {@code lower}, resolved for each project
 *       {@link #PROJECTS} names, to {@code <project>.resolveddeployment} and {@code
 *       <project>.dependencies.json}.
 *   <li>{@code render}: every Resolved Deployment of {@code resolve}, rendered together, to the tree.
 * </ul>
 *
 * <p>A case of a later stage with no case of the stage before is <em>given</em>: its {@code
 * expected/} is written by hand rather than by the stage, so the stage after it can be driven by a
 * model no earlier stage produces yet. A given {@code resolve} case is how a {@code render} case
 * reads a Resolved Deployment the resolution cannot write yet. A {@code render} case whose {@code
 * expected/} files are copies of the production implementation's oracles names each in {@link
 * #ORACLES}, one {@code <expected path> <oracle path>} pair a line, the oracle path below {@code
 * spec/v1/examples/}, and the copies must equal their oracles byte for byte.
 *
 * <p>With {@code -Dgolden.update=true} a run rewrites these {@code expected/} trees from what the
 * stages wrote, for review in {@code git diff}, save a given case and a case of copied oracles. It
 * never writes anywhere else: the oracles under {@code spec/v1/examples/} belong to the production
 * implementation and are never regenerated here.
 */
final class Stages {

    /** The stages, in the order they run and the order a golden update must rewrite them in. */
    static final List<String> ORDER = List.of("parse", "lower", "resolve", "render");

    /** The property that turns a run into a golden update. */
    static final String UPDATE = "golden.update";

    static final String INTENT_MODEL = "intent.xmi";
    static final String PINNED_MODEL = "pinned.xmi";
    static final String EFFECTIVE_MODEL = "effective.xmi";
    static final String RESOLVED_MODEL = ".resolveddeployment";

    /** The file a resolve case names the projects it resolves in, one per line. */
    static final String PROJECTS = "projects";

    /** The file a render case names the oracle each expected file is a copy of in. */
    static final String ORACLES = "oracles";

    static final String INPUT = "input";
    static final String EXPECTED = "expected";

    /** The pinned inputs, each by its own file name, beside the two intent documents' kinds. */
    private static final Set<String> PINNED =
            Set.of("node-contract.yml", "images.lock.yml", "cluster-state.yml", "migration-proof.yml");

    private static final String PLATFORM = "platform.intent.yml";
    private static final String PROJECT = ".project.yml";

    private Stages() {}

    /** {@code emf/bundles/cli/src/test/resources/stages}, in the working copy rather than on the class path. */
    static Path root() {
        return Examples.repository().resolve("emf/bundles/cli/src/test/resources/stages");
    }

    /** The cases of {@code stage}, by name, sorted. */
    static List<String> cases(String stage) {
        Path directory = root().resolve(stage);
        if (!Files.isDirectory(directory)) {
            return List.of();
        }
        try (Stream<Path> entries = Files.list(directory)) {
            return entries.filter(Files::isDirectory)
                    .map(path -> path.getFileName().toString())
                    .sorted()
                    .toList();
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    /** Whether case {@code name} of {@code stage} is given: a later stage's case with no case of the stage before. */
    static boolean given(String stage, String name) {
        int at = ORDER.indexOf(stage);
        return at > 0 && !cases(ORDER.get(at - 1)).contains(name);
    }

    /** The cases of {@code stage} the stage itself writes, every case but a given one. */
    static List<String> produced(String stage) {
        return cases(stage).stream().filter(name -> !given(stage, name)).toList();
    }

    /**
     * The oracle each expected file of render case {@code name} is a copy of, by its path below
     * {@code expected/}, the oracle's below {@code spec/v1/examples/}; nothing for a case of this
     * implementation's own goldens.
     */
    static Map<String, String> oracles(String name) throws IOException {
        Path file = root().resolve("render").resolve(name).resolve(ORACLES);
        Map<String, String> oracles = new TreeMap<>();
        if (!Files.isRegularFile(file)) {
            return oracles;
        }
        for (String line : Files.readAllLines(file)) {
            String[] pair = line.strip().split("\\s+");
            if (pair.length == 2) {
                oracles.put(pair[0], pair[1]);
            } else if (!line.isBlank()) {
                throw new IllegalArgumentException(file + ": not an <expected> <oracle> pair: " + line);
            }
        }
        return oracles;
    }

    static Path expected(String stage, String name) {
        return root().resolve(stage).resolve(name).resolve(EXPECTED);
    }

    static boolean updating() {
        return Boolean.getBoolean(UPDATE);
    }

    /** What {@code stage} writes for case {@code name}, by path below its {@code expected/}. */
    static Map<String, byte[]> run(String stage, String name) throws IOException {
        return switch (stage) {
            case "parse" -> parse(name);
            case "lower" -> lower(name);
            case "resolve" -> resolve(name);
            case "render" -> render(name);
            default -> throw new IllegalArgumentException("no stage " + stage);
        };
    }

    /**
     * Rewrites {@code expected} as {@code written}: what is no longer written is removed. Only a tree
     * under {@link #root()} is ever rewritten.
     */
    static void update(Path expected, Map<String, byte[]> written) throws IOException {
        Path target = expected.toAbsolutePath().normalize();
        if (!target.startsWith(root().toAbsolutePath().normalize())
                || target.toString().replace('\\', '/').contains("spec/v1/examples")) {
            throw new IllegalArgumentException(
                    target + " is not an EMF-owned golden, and a golden update never" + " writes it");
        }
        if (Files.isDirectory(target)) {
            try (Stream<Path> tree = Files.walk(target)) {
                for (Path path : tree.sorted(Comparator.reverseOrder()).toList()) {
                    Files.delete(path);
                }
            }
        }
        for (Map.Entry<String, byte[]> file : written.entrySet()) {
            Path path = target.resolve(file.getKey());
            Files.createDirectories(path.getParent());
            Files.write(path, file.getValue());
        }
    }

    // ------------------------------------------------------------------------------------- stages

    private static Map<String, byte[]> parse(String name) throws IOException {
        Path input = root().resolve("parse").resolve(name).resolve(INPUT);
        List<Path> documents = documents(input);
        Map<String, byte[]> written = new TreeMap<>();
        Authored authored = Pipeline.authored(documents);
        if (!authored.ok()) {
            written.put("diagnostics.json", json(diagnostics(authored.diagnostics())));
            return written;
        }
        Path expected = expected("parse", name);
        EcoreUtil.Copier copier = new EcoreUtil.Copier();
        Resource intent = model(expected.resolve(INTENT_MODEL));
        Resource pinned = model(expected.resolve(PINNED_MODEL));
        intent.getContents().addAll(copier.copyAll(authored.intent()));
        pinned.getContents().addAll(copier.copyAll(authored.pinned()));
        copier.copyReferences();
        written.put(INTENT_MODEL, bytes(intent));
        written.put(PINNED_MODEL, bytes(pinned));
        for (Path document : documents) {
            if (!PINNED.contains(document.getFileName().toString())) {
                Parsed parsed = Pipeline.intent(document);
                String json =
                        input.relativize(document).toString().replace('\\', '/').replaceFirst("\\.yml$", ".json");
                written.put(json, json(parsed.ok() ? parsed.intent() : diagnostics(parsed.diagnostics())));
            }
        }
        return written;
    }

    private static Map<String, byte[]> lower(String name) throws IOException {
        Map<String, byte[]> written = new TreeMap<>();
        Resource effective = model(expected("lower", name).resolve(EFFECTIVE_MODEL));
        for (EObject root : load(resources(), expected("parse", name).resolve(INTENT_MODEL))) {
            if (root instanceof Project project) {
                EffectiveProject lowered = Lowering.lower(project);
                written.put(lowered.getProject() + ".effective.json", json(IntentJson.of(lowered)));
                effective.getContents().add(lowered);
            }
        }
        written.put(EFFECTIVE_MODEL, bytes(effective));
        return written;
    }

    private static Map<String, byte[]> resolve(String name) throws IOException {
        Map<String, byte[]> written = new TreeMap<>();
        for (String project : projects(name)) {
            ResourceSet resources = resources();
            List<EObject> authored = load(resources, expected("parse", name).resolve(INTENT_MODEL));
            List<EObject> lowered = load(resources, expected("lower", name).resolve(EFFECTIVE_MODEL));
            List<EObject> pinned = load(resources, expected("parse", name).resolve(PINNED_MODEL));
            List<EObject> intent = new ArrayList<>();
            int next = 0;
            for (EObject root : authored) {
                intent.add(root);
                // Each authored Project sits beside its lowering, as the pipeline reads them.
                if (root instanceof Project) {
                    intent.add(lowered.get(next++));
                }
            }
            ResolvedDeployment deployment = Resolution.resolve(intent, pinned, project, Outputs.INTEGRITY);
            Resource model = model(expected("resolve", name).resolve(project + RESOLVED_MODEL));
            model.getContents().add(deployment);
            written.put(project + RESOLVED_MODEL, bytes(model));
            written.put(project + "." + DependencyEdges.NAME, json(DependencyEdges.of(deployment)));
        }
        return written;
    }

    private static Map<String, byte[]> render(String name) throws IOException {
        List<ResolvedDeployment> deployments = new ArrayList<>();
        for (String project : projects(name)) {
            Path model = expected("resolve", name).resolve(project + RESOLVED_MODEL);
            deployments.add((ResolvedDeployment) load(resources(), model).get(0));
        }
        Path out = Files.createTempDirectory("stage-render");
        try {
            Pipeline.renderTogether(deployments, out);
            return Comparison.read(out);
        } finally {
            try (Stream<Path> tree = Files.walk(out)) {
                for (Path path : tree.sorted(Comparator.reverseOrder()).toList()) {
                    Files.delete(path);
                }
            }
        }
    }

    // ------------------------------------------------------------------------------------ helpers

    /** The projects a case resolves, from the resolve case's {@link #PROJECTS}. */
    static List<String> projects(String name) throws IOException {
        return Files.readAllLines(root().resolve("resolve").resolve(name).resolve(PROJECTS)).stream()
                .map(String::strip)
                .filter(line -> !line.isEmpty())
                .toList();
    }

    /** The authored documents under {@code input}, by path: a project file, the Platform document, or a pinned input. */
    static List<Path> documents(Path input) throws IOException {
        try (Stream<Path> tree = Files.walk(input)) {
            return tree.filter(Files::isRegularFile)
                    .filter(path -> {
                        String file = path.getFileName().toString();
                        return file.endsWith(PROJECT) || file.equals(PLATFORM) || PINNED.contains(file);
                    })
                    .sorted()
                    .toList();
        }
    }

    /** A resource set reading XMI under any name, with every metamodel registered. */
    static ResourceSet resources() {
        ProjectIntentPackage.eINSTANCE.getName();
        PinnedInputsPackage.eINSTANCE.getName();
        ResolvedDeploymentPackage.eINSTANCE.getName();
        ResourceSet resources = new ResourceSetImpl();
        resources
                .getResourceFactoryRegistry()
                .getExtensionToFactoryMap()
                .put(Resource.Factory.Registry.DEFAULT_EXTENSION, new XMIResourceFactoryImpl());
        return resources;
    }

    /** The roots of the XMI file at {@code path}, read into {@code resources}, so links between files resolve. */
    static List<EObject> load(ResourceSet resources, Path path) {
        Resource resource = resources.getResource(
                URI.createFileURI(path.toAbsolutePath().normalize().toString()), true);
        return new ArrayList<>(resource.getContents());
    }

    private static Resource model(Path path) {
        return new Outputs.ByIndex(
                URI.createFileURI(path.toAbsolutePath().normalize().toString()));
    }

    /** {@code root} saved as the XMI file at {@code path} would hold it, without writing it. */
    static byte[] xmi(Path path, EObject root) throws IOException {
        Resource model = model(path);
        model.getContents().add(root);
        return bytes(model);
    }

    private static byte[] bytes(Resource resource) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        resource.save(out, null);
        return out.toByteArray();
    }

    private static byte[] json(Object value) {
        return CanonicalJson.write(value).getBytes(StandardCharsets.UTF_8);
    }

    /** The {@code (code, document, path)} triples the parity contract fixes, sorted. */
    static List<Object> diagnostics(List<Diagnostic> diagnostics) {
        return diagnostics.stream()
                .map(diagnostic -> (Object) new TreeMap<>(Map.of(
                        "code", diagnostic.code(),
                        "document", diagnostic.document(),
                        "path", diagnostic.path())))
                .sorted(Comparator.comparing(Object::toString))
                .toList();
    }
}
