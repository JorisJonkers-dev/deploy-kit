package dev.jorisjonkers.deploykit.emf.cli;

import static org.assertj.core.api.Assertions.assertThat;

import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.Project;
import dev.jorisjonkers.deploykit.emf.metamodel.resolveddeployment.ResolvedDeployment;
import dev.jorisjonkers.deploykit.emf.render.Rendering;
import dev.jorisjonkers.deploykit.emf.resolve.Lowering;
import dev.jorisjonkers.deploykit.emf.resolve.Resolution;
import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.lang.management.ManagementFactory;
import java.lang.management.MemoryMXBean;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import org.eclipse.emf.ecore.EObject;
import org.eclipse.emf.ecore.resource.Resource;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;
import org.junit.jupiter.api.io.TempDir;

/**
 * Every stage of the pipeline timed alone, per worked example and over the real estate's union at
 * growing sizes (docs/benchmarks.md). Each stage is timed on the output of the stage before it, which
 * is built once outside the timing:
 *
 * <ul>
 *   <li><b>read</b>: every document of the union parsed by its Xtext language and linked, {@link
 *       Pipeline#read};
 *   <li><b>check</b>: the same documents read, checked against the constraints, the names and the
 *       pinned inputs, and joined to their env files, {@link Pipeline#authored}: what the pipeline does
 *       before lowering;
 *   <li><b>lower</b>: every Project of the union lowered, {@link Lowering#lower} as shipped;
 *   <li><b>resolve</b>: one Project resolved against the union by {@code resolution.qvto}, loaded
 *       once ({@link QvtoResolution}); {@link Resolution#resolve} loads it on every call, and that load
 *       is timed apart, in {@link #loadingEachTransformation};
 *   <li><b>render</b>: the Resolved Deployments rendered to files, {@link Rendering#render}, which
 *       parses the templates on every call, as shipped.
 * </ul>
 *
 * Opt-in: {@code -Pbenchmark}, which also leaves JaCoCo's agent and the JVM's assertions out.
 */
@EnabledIfSystemProperty(named = Benchmark.PROPERTY, matches = "true")
class PipelineBenchmarkTest {

    /** The estate union sizes the read and lower series run at; from {@link BenchmarkInputs#ESTATE_CORE} on, every stage. */
    private static final List<Integer> SIZES = List.of(1, 4, 8, 12, 16, 20, 24);

    /** The shipped resolutions {@link #theHeapASeriesOfShippedResolutionsKeeps} runs. */
    private static final int SERIES = 40;

    /** The resolution every series runs, loaded on first use and then reused. */
    private static QvtoResolution resolution;

    @TempDir
    Path out;

    @Test
    void loadingEachTransformation() {
        Benchmark.Series lower = Benchmark.measure(QvtoLowering::prepared);
        Prepared minimal = Prepared.of(
                BenchmarkInputs.files(Outputs.RESOLVED.get("minimal").documents()));
        minimal.resolve("notes");
        // Each load of the resolution stays reachable, so this series is kept short.
        Benchmark.Series resolve = Benchmark.measure(QvtoResolution::load);
        Benchmark.report(
                "stages-load.md",
                Benchmark.environment()
                        + "\n"
                        + Benchmark.table(
                                List.of("transformation", "lines", "load ms (parse, compile)"),
                                List.of(
                                        List.of("lower.qvto", lines("/lower.qvto"), lower.cell()),
                                        List.of("resolution.qvto", lines("/resolution.qvto"), resolve.cell()))));
        assertThat(resolve.median()).isPositive();
    }

    /**
     * The heap a series of shipped resolutions leaves reachable: {@code minimal}'s {@code notes}
     * resolved by {@link Resolution#resolve} {@link #SERIES} times in one JVM, the heap in use after a
     * full collection read before and after, and the difference spread over the calls.
     */
    @Test
    void theHeapASeriesOfShippedResolutionsKeeps() {
        Prepared minimal = Prepared.of(
                BenchmarkInputs.files(Outputs.RESOLVED.get("minimal").documents()));
        Resolution.resolve(minimal.intent(), minimal.authored().pinned(), "notes", Outputs.INTEGRITY);
        long before = reachable();
        for (int i = 0; i < SERIES; i++) {
            Resolution.resolve(minimal.intent(), minimal.authored().pinned(), "notes", Outputs.INTEGRITY);
        }
        long after = reachable();
        double mib = 1024.0 * 1024.0;
        Benchmark.report(
                "resolution-heap.md",
                Benchmark.environment()
                        + "\n"
                        + Benchmark.table(
                                List.of(
                                        "shipped resolutions",
                                        "heap reachable before (MiB)",
                                        "heap reachable after (MiB)",
                                        "kept per call (MiB)"),
                                List.of(List.of(
                                        String.valueOf(SERIES),
                                        String.format(Locale.ROOT, "%.1f", before / mib),
                                        String.format(Locale.ROOT, "%.1f", after / mib),
                                        String.format(Locale.ROOT, "%.2f", (after - before) / mib / SERIES)))));
        assertThat(after).isPositive();
    }

    /** The heap in use once collections stop freeing anything: what is still reachable. */
    private static long reachable() {
        MemoryMXBean memory = ManagementFactory.getMemoryMXBean();
        long used = Long.MAX_VALUE;
        for (int i = 0; i < 10; i++) {
            System.gc();
            long now = memory.getHeapMemoryUsage().getUsed();
            if (now >= used) {
                return now;
            }
            used = now;
        }
        return used;
    }

    @Test
    void everyStagePerWorkedExample() throws IOException {
        List<List<String>> rows = new ArrayList<>();
        for (Map.Entry<String, Outputs.Resolving> entry :
                BenchmarkInputs.cases().entrySet()) {
            Outputs.Resolving resolving = entry.getValue();
            Prepared prepared = Prepared.of(BenchmarkInputs.files(resolving.documents()));
            ResolvedDeployment deployment = prepared.resolve(resolving.project());
            // The loaded-once resolution is the shipped one.
            assertThat(ModelDiff.differences(
                            entry.getKey(),
                            List.of(Resolution.resolve(
                                    prepared.intent(),
                                    prepared.authored().pinned(),
                                    resolving.project(),
                                    Outputs.INTEGRITY)),
                            List.of(deployment)))
                    .isEmpty();
            Path root = Files.createDirectories(out.resolve(entry.getKey()));
            Benchmark.Series read = Benchmark.measure(() -> Pipeline.read(prepared.files()));
            Benchmark.Series check = Benchmark.measure(() -> BenchmarkInputs.authored(prepared.files()));
            Benchmark.Series lower = Benchmark.measure(prepared::lowerAll);
            Benchmark.Series resolve = Benchmark.measure(() -> prepared.resolve(resolving.project()));
            Benchmark.Series render = Benchmark.measure(() -> {
                Rendering.render(List.of(deployment), root);
                return root;
            });
            rows.add(List.of(
                    entry.getKey(),
                    String.valueOf(prepared.files().size()),
                    String.valueOf(prepared.projects().size()),
                    read.cell(),
                    check.cell(),
                    lower.cell(),
                    resolve.cell(),
                    render.cell()));
        }
        Benchmark.report(
                "stages-per-example.md",
                Benchmark.environment()
                        + "\n"
                        + Benchmark.table(
                                List.of(
                                        "example",
                                        "documents",
                                        "Projects",
                                        "read ms",
                                        "check ms",
                                        "lower ms (all Projects)",
                                        "resolve ms (one Project, loaded once)",
                                        "render ms (one Project)"),
                                rows));
        assertThat(rows).hasSize(BenchmarkInputs.cases().size());
    }

    @Test
    void everyStageOverTheEstateAtGrowingSizes() throws IOException {
        List<List<String>> rows = new ArrayList<>();
        for (int size : SIZES) {
            List<Path> files = BenchmarkInputs.files(BenchmarkInputs.estate(size));
            Benchmark.Series read = Benchmark.measure(() -> Pipeline.read(files));
            List<String> row =
                    new ArrayList<>(List.of(String.valueOf(size), String.valueOf(files.size()), read.cell()));
            if (size < BenchmarkInputs.ESTATE_CORE) {
                // Too few Projects for the checks to accept: lowered as read, never checked or resolved.
                List<Project> projects = new ArrayList<>();
                for (Resource document : Pipeline.read(files)) {
                    if (document.getContents().get(0) instanceof Project project) {
                        projects.add(project);
                    }
                }
                Benchmark.Series lower = Benchmark.measure(
                        () -> projects.stream().map(Lowering::lower).toList());
                row.addAll(List.of("–", lower.cell(), "–", "–"));
            } else {
                Prepared prepared = Prepared.of(files);
                List<String> names =
                        prepared.projects().stream().map(Project::getProject).toList();
                List<ResolvedDeployment> deployments =
                        names.stream().map(prepared::resolve).toList();
                Path root = Files.createDirectories(out.resolve("estate-" + size));
                Benchmark.Series check = Benchmark.measure(() -> BenchmarkInputs.authored(files));
                Benchmark.Series lower = Benchmark.measure(prepared::lowerAll);
                Benchmark.Series resolve = Benchmark.measure(
                        () -> names.stream().map(prepared::resolve).toList());
                Benchmark.Series render = Benchmark.measure(() -> {
                    Rendering.render(deployments, root);
                    return root;
                });
                row.addAll(List.of(check.cell(), lower.cell(), resolve.cell(), render.cell()));
            }
            rows.add(row);
        }
        Benchmark.report(
                "stages-estate-scaling.md",
                Benchmark.environment()
                        + "\n"
                        + Benchmark.table(
                                List.of(
                                        "Projects",
                                        "documents",
                                        "read ms",
                                        "check ms",
                                        "lower ms (all Projects)",
                                        "resolve ms (every Project, loaded once)",
                                        "render ms (every Project)"),
                                rows));
        assertThat(rows).hasSize(SIZES.size());
    }

    private static String lines(String transformation) {
        try (InputStream source = Resolution.class.getResourceAsStream(transformation)) {
            return String.valueOf(new String(source.readAllBytes(), StandardCharsets.UTF_8)
                    .lines()
                    .count());
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    /** A union read, checked and lowered once, so a later stage is timed on what the stage before it made. */
    record Prepared(List<Path> files, Authored authored, List<Project> projects, List<EObject> intent) {

        static Prepared of(List<Path> files) {
            Authored authored = BenchmarkInputs.authored(files);
            List<Project> projects = BenchmarkInputs.projects(authored);
            List<EObject> intent = new ArrayList<>();
            for (EObject root : authored.intent()) {
                intent.add(root);
                // The authored Project stays beside its lowering, as the pipeline reads them.
                if (root instanceof Project project) {
                    intent.add(Lowering.lower(project));
                }
            }
            return new Prepared(files, authored, projects, intent);
        }

        List<?> lowerAll() {
            return projects.stream().map(Lowering::lower).toList();
        }

        ResolvedDeployment resolve(String project) {
            if (resolution == null) {
                resolution = QvtoResolution.prepared(intent, authored.pinned(), project);
            }
            return resolution.resolve(intent, authored.pinned(), project);
        }
    }
}
