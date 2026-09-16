package dev.jorisjonkers.deploykit.emf.cli;

import dev.jorisjonkers.deploykit.emf.metamodel.json.CanonicalJson;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.stream.Stream;

/**
 * What a run of the pipeline leaves behind: for every case under {@code spec/v1/examples/}, the
 * parsed intent or the diagnostics that refused it, in the canonical JSON the oracles are committed
 * in, and the exit code the run ended on
 * (docs/adr/emf/0120-parity-crosses-the-cli-file-interface.md).
 *
 * <p>The output tree mirrors the example tree: a case at {@code auth/} writes {@code auth/}, and a
 * refusal whose oracle is {@code refusals/unknown-surface.diagnostics.json} writes {@code
 * refusals/unknown-surface/}, so a written file and its oracle are obviously a pair. A case writes
 * exactly one of {@link #INTENT} and {@link #DIAGNOSTICS}, beside its {@link #EXIT}.
 */
public final class Outputs {

    /** The parsed intent of a case the pipeline accepted. */
    public static final String INTENT = "intent.json";

    /** The diagnostics of a case the pipeline refused. */
    public static final String DIAGNOSTICS = "diagnostics.json";

    /** The code the run ended on: {@code 0} when the pipeline accepted the case, {@code 1} when not. */
    public static final String EXIT = "exit";

    private static final String INTENT_ORACLE = "expected/intent.json";
    private static final String DIAGNOSTICS_ORACLE = ".diagnostics.json";
    private static final String PROJECT = ".project.yml";
    private static final String PLATFORM = "platform.intent.yml";

    private Outputs() {}

    /** Every case under {@code examples} run through the pipeline, written under {@code out}. */
    public static void write(Path examples, Path out) throws IOException {
        for (Path directory : casesWithAnIntentOracle(examples)) {
            writeParsed(out.resolve(examples.relativize(directory)), Pipeline.intent(authored(directory)));
        }
        for (Path oracle : refusalsWithADiagnosticsOracle(examples)) {
            String stem = oracle.getFileName().toString().replace(DIAGNOSTICS_ORACLE, "");
            Path set = oracle.resolveSibling(stem);
            Path directory = out.resolve(examples.relativize(set));
            // A directory beside the oracle is a set of documents read together; a file is read alone.
            if (Files.isDirectory(set)) {
                writeDiagnostics(directory, Pipeline.check(documents(set)));
            } else {
                writeParsed(directory, Pipeline.intent(oracle.resolveSibling(stem + PROJECT)));
            }
        }
    }

    /** The case directories carrying an intent oracle: every case the pipeline is expected to accept. */
    private static List<Path> casesWithAnIntentOracle(Path examples) throws IOException {
        try (Stream<Path> tree = Files.walk(examples)) {
            return tree.filter(path -> path.endsWith(INTENT_ORACLE))
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

    private static void writeParsed(Path directory, Parsed parsed) throws IOException {
        if (parsed.ok()) {
            write(directory, INTENT, CanonicalJson.write(parsed.intent()), 0);
        } else {
            writeDiagnostics(directory, parsed.diagnostics());
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
