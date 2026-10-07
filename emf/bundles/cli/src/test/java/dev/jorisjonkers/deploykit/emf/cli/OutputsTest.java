package dev.jorisjonkers.deploykit.emf.cli;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.File;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Comparator;
import java.util.List;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

/**
 * What a run of the pipeline leaves behind: the files every parity case is decided from, under this
 * module's build output, one directory per case.
 */
class OutputsTest {

    /** Where a run of this module leaves what the parity contract compares, under its build output. */
    private static final Path OUTPUT = Path.of("target", "parity");

    /** Set by the mutation gate, whose every run of this test is of a mutant (emf/pom.xml). */
    private static final String MUTATING = "emf.mutation";

    /** The cases whose committed rendered trees the composed union writes between them. */
    private static final java.util.Set<String> RENDERED_CASES = java.util.Set.of("minimal", "data", "_estate");

    @Test
    void aRunLeavesEveryCaseUnderTheModulesBuildOutput() throws IOException {
        Path examples = Examples.of("");
        // Under the mutation gate the run is a mutant's, several at once, so
        // each writes apart and the parity module reads the build's own run.
        boolean mutating = Boolean.getBoolean(MUTATING);
        Path output = mutating ? Files.createTempDirectory("parity") : OUTPUT;
        try {
            deleteTree(output);

            Outputs.write(examples, output);

            assertThat(files(output)).containsExactlyElementsOf(everyCasesPairedFile(examples));
        } finally {
            if (mutating) {
                deleteTree(output);
            }
        }
    }

    @Test
    void everyShapeOfCaseLeavesTheFileItsOracleIsPairedWith(@TempDir Path root) throws IOException {
        Path examples = root.resolve("examples");
        Path out = root.resolve("out");
        accepted(examples, "minimal");
        refused(examples, "unknown-surface");
        refused(examples, "no-tier-for-audience");

        Outputs.write(examples, out);

        assertThat(files(out))
                .containsExactly(
                        "minimal/exit",
                        "minimal/intent.json",
                        "minimal/notes.project.xmi",
                        "refusals/no-tier-for-audience/diagnostics.json",
                        "refusals/no-tier-for-audience/exit",
                        "refusals/no-tier-for-audience/platform.intent.xmi",
                        "refusals/no-tier-for-audience/refusals.project.xmi",
                        "refusals/unknown-surface/diagnostics.json",
                        "refusals/unknown-surface/exit",
                        "refusals/unknown-surface/unknown-surface.project.xmi");
        assertThat(read(out.resolve("minimal/exit"))).isEqualTo("0");
        assertThat(read(out.resolve("minimal/intent.json"))).startsWith("{").endsWith("}");
        // The same model as an instance of the metamodel, which loads back without the grammar.
        assertThat(read(out.resolve("minimal/notes.project.xmi")))
                .contains("projectintent:Project")
                .contains("project=\"notes\"");
        assertThat(read(out.resolve("refusals/unknown-surface/exit"))).isEqualTo("1");
        assertThat(read(out.resolve("refusals/unknown-surface/diagnostics.json")))
                .contains("E_UNKNOWN_SURFACE");
        assertThat(read(out.resolve("refusals/no-tier-for-audience/exit"))).isEqualTo("1");
        assertThat(read(out.resolve("refusals/no-tier-for-audience/diagnostics.json")))
                .contains("E_NO_TIER_FOR_AUDIENCE");
        // A refused model is written too, and a set's documents link to each other's XMI.
        assertThat(read(out.resolve("refusals/unknown-surface/unknown-surface.project.xmi")))
                .contains("projectintent:Project");
        assertThat(read(out.resolve("refusals/no-tier-for-audience/platform.intent.xmi")))
                .contains("projectintent:Platform")
                .contains("href=\"refusals.project.xmi#");
    }

    @Test
    void aResolutionCaseLeavesItsEdgesItsModelAndTheExtentsItWasResolvedFrom(@TempDir Path root) throws IOException {
        Path examples = root.resolve("examples");
        Path out = root.resolve("out");
        resolving(examples, text -> text);

        Outputs.write(examples, out);

        Path minimal = out.resolve("minimal");
        assertThat(read(minimal.resolve("dependencies.json")))
                .isEqualTo(Examples.read("minimal/expected/dependencies.json"));
        assertThat(read(minimal.resolve("notes" + Outputs.RESOLVED_MODEL)))
                .contains("resolveddeployment:ResolvedDeployment");
        // Every link of the intent extent lands inside it, by root index and path rather than by ID,
        // so the extent loads in Eclipse on its own.
        String intent = read(minimal.resolve(Outputs.INTENT_MODEL));
        assertThat(intent).doesNotContain("href=").containsPattern("traefik=\"/\\d+/@applications\\.\\d+\"");
        assertThat(read(minimal.resolve(Outputs.PINNED_MODEL))).contains("pinnedinputs:NodeContract");
    }

    @Test
    void anExtentNamesARootByItsIndexAndAnythingBelowItByItsPathUnderThatRoot() {
        Outputs.ByIndex extent = new Outputs.ByIndex(org.eclipse.emf.common.util.URI.createURI("extent.xmi"));
        var model = dev.jorisjonkers.deploykit.emf.metamodel.projectintent.ProjectIntentFactory.eINSTANCE;
        var first = model.createProject();
        var second = model.createProject();
        var application = model.createApplication();
        application.setId("notes");
        second.getApplications().add(application);
        extent.getContents().add(first);
        extent.getContents().add(second);

        assertThat(extent.getURIFragment(second)).isEqualTo("/1");
        assertThat(extent.getURIFragment(application)).isEqualTo("/1/@applications.0");
        assertThat(extent.getEObject("/1/@applications.0")).isSameAs(application);
    }

    @Test
    void aResolutionCaseTheChecksRefuseLeavesItsDiagnostics(@TempDir Path root) throws IOException {
        Path examples = root.resolve("examples");
        Path out = root.resolve("out");
        resolving(examples, text -> text.replace("surface: http }", "surface: grpc }"));

        Outputs.write(examples, out);

        assertThat(read(out.resolve("minimal/exit"))).isEqualTo("1");
        assertThat(read(out.resolve("minimal/diagnostics.json"))).contains("E_UNKNOWN_SURFACE");
        assertThat(out.resolve("minimal/dependencies.json")).doesNotExist();
    }

    @Test
    void aRenderedUnionTheChecksRefuseLeavesItsDiagnosticsInPlaceOfTheTree(@TempDir Path root) throws IOException {
        Path examples = root.resolve("examples");
        Path out = root.resolve("out");
        for (String document : Outputs.RENDERED_UNION.documents()) {
            Path target = examples.resolve(document);
            Files.createDirectories(target.getParent());
            String text = Examples.read(document);
            Files.writeString(
                    target,
                    document.equals("minimal/notes.project.yml")
                            ? text.replace("surface: http }", "surface: grpc }")
                            : text);
        }
        Files.createDirectories(examples.resolve("_estate/rendered"));
        Files.createDirectories(examples.resolve("refusals"));

        Outputs.write(examples, out);

        assertThat(files(out.resolve(Outputs.RENDERED_TREE))).containsExactly("diagnostics.json", "exit");
        assertThat(read(out.resolve("rendered/diagnostics.json"))).contains("E_UNKNOWN_SURFACE");
    }

    /** minimal's resolution set, copied out of the real examples, its project file passed through {@code edit}. */
    private static void resolving(Path examples, java.util.function.UnaryOperator<String> edit) throws IOException {
        for (String document : Outputs.RESOLVED.get("minimal").documents()) {
            Path target = examples.resolve(document);
            Files.createDirectories(target.getParent());
            String text = Examples.read(document);
            Files.writeString(target, document.equals("minimal/notes.project.yml") ? edit.apply(text) : text);
        }
        touch(examples.resolve("minimal/expected/dependencies.json"));
        Files.createDirectories(examples.resolve("refusals"));
    }

    @Test
    void aRefusedFileThatHoldsNoDocumentLeavesNoModel(@TempDir Path root) throws IOException {
        Path examples = root.resolve("examples");
        Path out = root.resolve("out");
        touch(examples.resolve("refusals/empty.project.yml"));
        touch(examples.resolve("refusals/empty.diagnostics.json"));

        Outputs.write(examples, out);

        assertThat(files(out)).containsExactly("refusals/empty/diagnostics.json", "refusals/empty/exit");
    }

    @Test
    void aSetTheRunAcceptsLeavesAnEmptyRefusalAndExitZero(@TempDir Path root) throws IOException {
        Path examples = root.resolve("examples");
        Path out = root.resolve("out");
        copy(Examples.of("minimal/notes.project.yml"), examples.resolve("refusals/holds/notes.project.yml"));
        touch(examples.resolve("refusals/holds.diagnostics.json"));

        Outputs.write(examples, out);

        assertThat(read(out.resolve("refusals/holds/diagnostics.json"))).isEqualTo("[]");
        assertThat(read(out.resolve("refusals/holds/exit"))).isEqualTo("0");
    }

    /**
     * The file every oracle under {@code examples} is paired with, and the exit code beside it, read
     * from the oracles rather than from the run, so a case the run skipped is a missing file here.
     */
    private static List<String> everyCasesPairedFile(Path examples) throws IOException {
        try (Stream<Path> tree = Files.walk(examples)) {
            return tree.flatMap(oracle -> pairedFiles(examples, oracle))
                    .sorted()
                    .toList();
        }
    }

    private static Stream<String> pairedFiles(Path examples, Path oracle) {
        String name = oracle.getFileName().toString();
        Path relative = examples.relativize(oracle);
        // A committed rendered tree the composed union writes, file for file, under one tree.
        if (relative.getNameCount() > 2
                && relative.getName(1).toString().equals(Outputs.RENDERED_TREE)
                && RENDERED_CASES.contains(relative.getName(0).toString())
                && Files.isRegularFile(oracle)
                && !name.equals("README.md")) {
            return Stream.of(Outputs.RENDERED_TREE + "/" + relative.subpath(2, relative.getNameCount()));
        }
        if (oracle.endsWith("expected/intent.json")) {
            String directory = relative(examples, oracle.getParent().getParent());
            Stream<String> models = documents(oracle.getParent().getParent())
                    .limit(1)
                    .map(document -> directory + "/" + model(document));
            return Stream.concat(Stream.of(directory + "/exit", directory + "/intent.json"), models);
        }
        if (oracle.endsWith("expected/dependencies.json")) {
            String directory = relative(examples, oracle.getParent().getParent());
            Outputs.Resolving resolving = Outputs.RESOLVED.get(directory);
            return resolving == null
                    ? Stream.empty()
                    : Stream.of(
                            directory + "/dependencies.json",
                            directory + "/" + resolving.project() + Outputs.RESOLVED_MODEL,
                            directory + "/" + Outputs.INTENT_MODEL,
                            directory + "/" + Outputs.PINNED_MODEL);
        }
        if (oracle.endsWith("expected/effective.json")) {
            return Stream.of(relative(examples, oracle.getParent().getParent()) + "/effective.json");
        }
        // A negative fixture is read in both orders of its fragments.
        if (name.endsWith(".diagnostics.json")
                && oracle.getParent().getFileName().toString().equals("negative")) {
            String directory = "negative/" + name.replace(".diagnostics.json", "");
            return Stream.of(
                    directory + "/diagnostics.json", directory + "/diagnostics.reversed.json", directory + "/exit");
        }
        // Only a refusal under refusals/ binds this implementation; a schema refusal binds the
        // production implementation alone (docs/architecture.md#the-parity-contract).
        if (name.endsWith(".diagnostics.json")
                && oracle.getParent().getFileName().toString().equals("refusals")) {
            String stem = name.replace(".diagnostics.json", "");
            String directory = "refusals/" + stem;
            Path set = oracle.resolveSibling(stem);
            Stream<String> models = Files.isDirectory(set)
                    ? documents(set).map(document -> directory + "/" + model(document))
                    : Stream.of(directory + "/" + stem + ".project.xmi");
            return Stream.concat(Stream.of(directory + "/diagnostics.json", directory + "/exit"), models);
        }
        return Stream.empty();
    }

    /** What the XMI of the authored document named {@code document} is called. */
    private static String model(String document) {
        return document.replaceFirst("\\.yml$", ".xmi");
    }

    /** The file names of the authored documents in {@code set}, sorted. */
    private static Stream<String> documents(Path set) {
        try (Stream<Path> entries = Files.list(set)) {
            return entries
                    .map(path -> path.getFileName().toString())
                    .filter(name -> name.endsWith(".project.yml") || name.equals("platform.intent.yml"))
                    .sorted()
                    .toList()
                    .stream();
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    /** A case the pipeline accepts, copied out of the real examples with an oracle beside it. */
    private static void accepted(Path examples, String name) throws IOException {
        copyDocuments(Examples.of(name), examples.resolve(name));
        touch(examples.resolve(name).resolve("expected").resolve("intent.json"));
    }

    /** A case the pipeline refuses, whether its input is one file or a set, with an oracle beside it. */
    private static void refused(Path examples, String stem) throws IOException {
        Path source = Examples.of("refusals/" + stem);
        Path refusals = examples.resolve("refusals");
        if (Files.isDirectory(source)) {
            copyDocuments(source, refusals.resolve(stem));
        } else {
            copy(Examples.of("refusals/" + stem + ".project.yml"), refusals.resolve(stem + ".project.yml"));
        }
        touch(refusals.resolve(stem + ".diagnostics.json"));
    }

    /** Every authored document of {@code source}, and nothing else a case's directory happens to hold. */
    private static void copyDocuments(Path source, Path directory) throws IOException {
        try (Stream<Path> tree = Files.list(source)) {
            for (Path document : tree.filter(
                            path -> path.getFileName().toString().endsWith(".yml"))
                    .toList()) {
                copy(document, directory.resolve(document.getFileName()));
            }
        }
    }

    private static void copy(Path source, Path target) throws IOException {
        Files.createDirectories(target.getParent());
        Files.copy(source, target);
    }

    private static void touch(Path file) throws IOException {
        Files.createDirectories(file.getParent());
        Files.writeString(file, "");
    }

    /** Every file under {@code root}, relative to it, sorted, with {@code /} between segments. */
    private static List<String> files(Path root) throws IOException {
        try (Stream<Path> tree = Files.walk(root)) {
            return tree.filter(Files::isRegularFile)
                    .map(file -> relative(root, file))
                    .sorted()
                    .toList();
        }
    }

    private static String relative(Path root, Path file) {
        return root.relativize(file).toString().replace(File.separatorChar, '/');
    }

    private static String read(Path file) {
        try {
            return Files.readString(file, StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    private static void deleteTree(Path root) throws IOException {
        if (!Files.exists(root)) {
            return;
        }
        try (Stream<Path> tree = Files.walk(root)) {
            for (Path path : tree.sorted(Comparator.reverseOrder()).toList()) {
                Files.delete(path);
            }
        }
    }
}
