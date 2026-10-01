package dev.jorisjonkers.deploykit.emf.cli;

import dev.jorisjonkers.deploykit.emf.metamodel.descriptor.DependencyEdges;
import dev.jorisjonkers.deploykit.emf.metamodel.json.CanonicalJson;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.stream.Stream;
import org.eclipse.emf.common.util.URI;
import org.eclipse.emf.ecore.EObject;
import org.eclipse.emf.ecore.resource.Resource;
import org.eclipse.emf.ecore.util.EcoreUtil;
import org.eclipse.emf.ecore.xmi.impl.XMIResourceImpl;

/**
 * What a run of the pipeline leaves behind: for every case under {@code spec/v1/examples/}, the
 * parsed intent or the diagnostics that refused it, in the canonical JSON the oracles are committed
 * in, and the exit code the run ended on
 * (docs/adr/emf/0080-parity-crosses-the-cli-file-interface.md).
 *
 * <p>The output tree mirrors the example tree: a case at {@code auth/} writes {@code auth/}, and a
 * refusal whose oracle is {@code refusals/unknown-surface.diagnostics.json} writes {@code
 * refusals/unknown-surface/}, so a written file and its oracle are obviously a pair. A case writes
 * exactly one of {@link #INTENT} and {@link #DIAGNOSTICS}, beside its {@link #EXIT}. Every case also
 * writes the model of each document it reads in XMI, named by {@link Pipeline#xmiName}, which no
 * oracle compares. A set's models link to each other, so a refused case opens in Eclipse and fails
 * its validation there too.
 */
public final class Outputs {

    /** The parsed intent of a case the pipeline accepted. */
    public static final String INTENT = "intent.json";

    /** The Effective Intent of a case that carries an oracle for it. */
    public static final String EFFECTIVE = "effective.json";

    /** The diagnostics of a case the pipeline refused. */
    public static final String DIAGNOSTICS = "diagnostics.json";

    /** The code the run ended on: {@code 0} when the pipeline accepted the case, {@code 1} when not. */
    public static final String EXIT = "exit";

    /**
     * The cases this implementation resolves, each with the project it resolves and the set of
     * documents it is read with: the case's own documents, the foundation it composes with, and the
     * pinned inputs beside the Platform document (spec/v1/20-resolved-deployment.md#pinned-inputs).
     * Every case the production implementation resolves is here; `knowledge` joins when the
     * production implementation resolves it (JorisJonkers-dev/deploy-kit#201).
     */
    public static final Map<String, Resolving> RESOLVED = Map.of(
            "minimal",
            new Resolving("notes", withFoundation("minimal/notes.project.yml")),
            "auth",
            new Resolving(
                    "auth",
                    withFoundation("auth/auth.project.yml", "auth/migration-proof.yml", "data/data.project.yml")),
            "data",
            new Resolving("data", withFoundation("data/data.project.yml")),
            "delivery",
            new Resolving("delivery", withFoundation()),
            "edge",
            new Resolving("edge", withFoundation()),
            "observability",
            new Resolving("observability", withFoundation()),
            "secrets",
            new Resolving("secrets", withFoundation()));

    /** The Platform document, its pinned inputs and the foundation every case composes with, then {@code own}. */
    private static List<String> withFoundation(String... own) {
        List<String> documents = new ArrayList<>(List.of(
                "platform/platform.intent.yml",
                "platform/node-contract.yml",
                "platform/images.lock.yml",
                "platform/cluster-state.yml"));
        documents.addAll(List.of(own));
        documents.addAll(List.of(
                "delivery/delivery.project.yml",
                "edge/edge.project.yml",
                "observability/observability.project.yml",
                "secrets/secrets.project.yml"));
        return List.copyOf(documents);
    }

    /** The integrity the worked projections record for the schema package they were rendered against. */
    public static final String INTEGRITY = "sha256:5e6f7a8b5e6f7a8b5e6f7a8b5e6f7a8b5e6f7a8b5e6f7a8b5e6f7a8b5e6f7a8b";

    /** The project a resolution case resolves, and the documents under the examples it reads. */
    public record Resolving(String project, List<String> documents) {}

    private static final String DEPENDENCIES_ORACLE = "expected/" + DependencyEdges.NAME;

    private static final String INTENT_ORACLE = "expected/intent.json";
    private static final String EFFECTIVE_ORACLE = "expected/effective.json";
    private static final String DIAGNOSTICS_ORACLE = ".diagnostics.json";
    private static final String PROJECT = ".project.yml";
    private static final String PLATFORM = "platform.intent.yml";

    private Outputs() {}

    /** Every case under {@code examples} run through the pipeline, written under {@code out}. */
    public static void write(Path examples, Path out) throws IOException {
        for (Path directory : casesWithAnIntentOracle(examples)) {
            writeParsed(out.resolve(examples.relativize(directory)), authored(directory));
        }
        for (Path directory : casesWith(examples, EFFECTIVE_ORACLE)) {
            writeEffective(out.resolve(examples.relativize(directory)), authored(directory));
        }
        for (Path directory : casesWith(examples, DEPENDENCIES_ORACLE)) {
            Resolving resolving = RESOLVED.get(examples.relativize(directory).toString());
            if (resolving != null) {
                writeResolved(out.resolve(examples.relativize(directory)), examples, resolving);
            }
        }
        for (Path oracle : refusalsWithADiagnosticsOracle(examples)) {
            String stem = oracle.getFileName().toString().replace(DIAGNOSTICS_ORACLE, "");
            Path set = oracle.resolveSibling(stem);
            Path directory = out.resolve(examples.relativize(set));
            // A directory beside the oracle is a set of documents read together; a file is read alone.
            if (Files.isDirectory(set)) {
                List<Path> documents = documents(set);
                writeDiagnostics(directory, Pipeline.check(documents));
                writeModels(directory, documents);
            } else {
                writeParsed(directory, oracle.resolveSibling(stem + PROJECT));
            }
        }
    }

    /** The case directories carrying an intent oracle: every case the pipeline is expected to accept. */
    private static List<Path> casesWithAnIntentOracle(Path examples) throws IOException {
        return casesWith(examples, INTENT_ORACLE);
    }

    /** The case directories carrying {@code oracle}, a path relative to the case. */
    private static List<Path> casesWith(Path examples, String oracle) throws IOException {
        try (Stream<Path> tree = Files.walk(examples)) {
            return tree.filter(path -> path.endsWith(oracle))
                    .map(path -> path.getParent().getParent())
                    .sorted()
                    .toList();
        }
    }

    /** The diagnostics oracles under {@code refusals/}: every case the pipeline is expected to refuse. */
    private static List<Path> refusalsWithADiagnosticsOracle(Path examples) throws IOException {
        try (Stream<Path> tree = Files.list(examples.resolve("refusals"))) {
            return tree.filter(path -> path.getFileName().toString().endsWith(DIAGNOSTICS_ORACLE))
                    .sorted()
                    .toList();
        }
    }

    /** The one authored document of a case: its project file, or its Platform document. */
    private static Path authored(Path directory) throws IOException {
        return documents(directory).get(0);
    }

    /** The authored documents in {@code directory}, sorted; whatever else it holds is not read. */
    private static List<Path> documents(Path directory) throws IOException {
        try (Stream<Path> entries = Files.list(directory)) {
            return entries.filter(Outputs::isDocument).sorted().toList();
        }
    }

    private static boolean isDocument(Path path) {
        String name = path.getFileName().toString();
        return name.endsWith(PROJECT) || name.equals(PLATFORM);
    }

    private static void writeParsed(Path directory, Path authored) throws IOException {
        Parsed parsed = Pipeline.intent(authored);
        if (parsed.ok()) {
            write(directory, INTENT, CanonicalJson.write(parsed.intent()), 0);
        } else {
            writeDiagnostics(directory, parsed.diagnostics());
        }
        writeModels(directory, List.of(authored));
    }

    /**
     * The Effective Intent of {@code authored}. A case with that oracle is one the pipeline accepts;
     * one it refuses leaves an empty object here, beside the diagnostics its intent step wrote.
     */
    private static void writeEffective(Path directory, Path authored) throws IOException {
        Files.createDirectories(directory);
        Files.writeString(
                directory.resolve(EFFECTIVE),
                CanonicalJson.write(Pipeline.effective(authored).intent()),
                StandardCharsets.UTF_8);
    }

    /**
     * The resolved dependency edges of a resolution case, the half of resolution the parity contract
     * compares, and the Resolved Deployment model they were exported from, in XMI, which no oracle
     * compares and which is what the templates read.
     */
    private static void writeResolved(Path directory, Path examples, Resolving resolving) throws IOException {
        Resolved resolved = Pipeline.resolve(
                resolving.documents().stream().map(examples::resolve).toList(), resolving.project(), INTEGRITY);
        if (!resolved.ok()) {
            writeDiagnostics(directory, resolved.diagnostics());
            return;
        }
        DependencyEdges.write(directory, resolved.deployment());
        // The two extents the transformation read, so a launch in Eclipse runs it on the same models.
        EcoreUtil.Copier copier = new EcoreUtil.Copier();
        Resource intent = model(directory, INTENT_MODEL);
        Resource pinned = model(directory, PINNED_MODEL);
        intent.getContents().addAll(copier.copyAll(resolved.intent()));
        pinned.getContents().addAll(copier.copyAll(resolved.pinned()));
        copier.copyReferences();
        Resource deployment = model(directory, resolving.project() + RESOLVED_MODEL);
        deployment.getContents().add(resolved.deployment());
        for (Resource resource : List.of(intent, pinned, deployment)) {
            resource.save(null);
        }
    }

    /** An XMI resource for {@code name} under {@code directory}, which refers to its objects as {@link ByIndex} does. */
    private static Resource model(Path directory, String name) {
        return new ByIndex(
                URI.createFileURI(directory.resolve(name).toAbsolutePath().toString()));
    }

    /**
     * An XMI resource of several roots that refers to its objects by their root's index and their
     * containment path, never by ID: an extent holds several projects, and an ID names one object
     * only within one of them.
     */
    static final class ByIndex extends XMIResourceImpl {
        ByIndex(URI uri) {
            super(uri);
        }

        @Override
        public String getURIFragment(EObject object) {
            EObject root = EcoreUtil.getRootContainer(object);
            String index = "/" + getContents().indexOf(root);
            return root == object ? index : index + "/" + EcoreUtil.getRelativeURIFragmentPath(root, object);
        }
    }

    /** The intent extent a resolution case reads: each authored Project, its lowering, and the Platform document. */
    public static final String INTENT_MODEL = "resolution.intent.xmi";

    /** The pinned extent a resolution case reads: the node contract, the images lock and the snapshot. */
    public static final String PINNED_MODEL = "resolution.pinned.xmi";

    /** What the XMI of a resolved project is called, beside the edges exported from it. */
    public static final String RESOLVED_MODEL = ".resolveddeployment";

    /** The XMI of each of {@code documents} read together; a file that holds no document has none. */
    private static void writeModels(Path directory, List<Path> documents) throws IOException {
        for (Map.Entry<Path, String> model : Pipeline.xmi(documents).entrySet()) {
            Files.writeString(
                    directory.resolve(Pipeline.xmiName(model.getKey())), model.getValue(), StandardCharsets.UTF_8);
        }
    }

    private static void writeDiagnostics(Path directory, List<Diagnostic> diagnostics) throws IOException {
        write(directory, DIAGNOSTICS, CanonicalJson.write(triples(diagnostics)), diagnostics.isEmpty() ? 0 : 1);
    }

    /**
     * The {@code (code, document, path)} triples the parity contract fixes, in an order no run can
     * change, so a refusal's file is the set the contract compares rather than one reading of it.
     */
    private static List<Object> triples(List<Diagnostic> diagnostics) {
        return diagnostics.stream()
                .map(diagnostic -> (Object) new TreeMap<>(Map.of(
                        "code", diagnostic.code(),
                        "document", diagnostic.document(),
                        "path", diagnostic.path())))
                .sorted(Comparator.comparing(Object::toString))
                .toList();
    }

    private static void write(Path directory, String name, String json, int exit) throws IOException {
        Files.createDirectories(directory);
        Files.writeString(directory.resolve(name), json, StandardCharsets.UTF_8);
        Files.writeString(directory.resolve(EXIT), Integer.toString(exit), StandardCharsets.UTF_8);
    }
}
