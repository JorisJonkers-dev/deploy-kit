package dev.jorisjonkers.deploykit.emf.cli;

import static org.assertj.core.api.Assertions.assertThat;

import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.Project;
import dev.jorisjonkers.deploykit.emf.resolve.Lowering;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.function.Function;
import java.util.regex.Pattern;
import org.eclipse.emf.common.util.TreeIterator;
import org.eclipse.emf.ecore.EObject;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;

/**
 * The QVT-Operational lowering and its ATL port, head to head on the same inputs
 * (docs/benchmarks.md#qvto-against-atl): warm, with each transformation loaded once and reused, and
 * loaded for every Project; the cost of loading alone; cold, in a fresh JVM;
 * and the size of each source. {@link LoweringEquivalenceTest} holds the two outputs equal first.
 * Opt-in: {@code -Pbenchmark}.
 */
@EnabledIfSystemProperty(named = Benchmark.PROPERTY, matches = "true")
class LoweringBenchmarkTest {

    private static final List<Integer> SIZES = List.of(1, 4, 8, 12, 16, 20, 24);

    /** How many times each lowering runs over every Project before a series is measured. */
    private static final int WARM_ROUNDS = 40;

    @Test
    void perProjectWarm() {
        QvtoLowering qvto = QvtoLowering.prepared();
        AtlLowering atl = AtlLowering.prepared();
        Map<String, Project> lowered = BenchmarkInputs.lowered();
        warm(List.copyOf(lowered.values()), qvto, atl);
        List<List<String>> rows = new ArrayList<>();
        double qvtoTotal = 0;
        double atlTotal = 0;
        for (Map.Entry<String, Project> entry : lowered.entrySet()) {
            Project project = entry.getValue();
            Benchmark.Series byQvto = Benchmark.measure(() -> qvto.lower(project));
            Benchmark.Series byAtl = Benchmark.measure(() -> atl.lower(project));
            qvtoTotal += byQvto.median();
            atlTotal += byAtl.median();
            rows.add(List.of(
                    entry.getKey(),
                    String.valueOf(objects(project)),
                    byQvto.cell(),
                    byAtl.cell(),
                    ratio(byAtl.median(), byQvto.median())));
        }
        rows.add(List.of(
                "**sum of medians**", "", Benchmark.ms(qvtoTotal), Benchmark.ms(atlTotal), ratio(atlTotal, qvtoTotal)));
        Benchmark.report(
                "lowering-per-project.md",
                Benchmark.environment()
                        + "\n"
                        + Benchmark.table(List.of("Project", "objects", "QVTo ms", "ATL ms", "ATL / QVTo"), rows));
        assertThat(rows).hasSizeGreaterThan(30);
    }

    @Test
    void theEstateAtGrowingSizes() {
        QvtoLowering qvto = QvtoLowering.prepared();
        AtlLowering atl = AtlLowering.prepared();
        List<Project> estate = BenchmarkInputs.projects(BenchmarkInputs.authored(
                BenchmarkInputs.files(BenchmarkInputs.estate(BenchmarkInputs.ESTATE_ORDER.size()))));
        warm(estate, qvto, atl);
        // Every loaded-once series first, so none runs on the garbage a load per call leaves behind.
        List<List<String>> rows = new ArrayList<>();
        for (int size : SIZES) {
            List<Project> projects = estate.subList(0, size);
            Benchmark.Series byQvto = Benchmark.measure(() -> all(projects, project -> qvto.lower(project)));
            Benchmark.Series byAtl = Benchmark.measure(() -> all(projects, project -> atl.lower(project)));
            rows.add(new ArrayList<>(List.of(
                    String.valueOf(size),
                    String.valueOf(projects.stream()
                            .mapToInt(LoweringBenchmarkTest::objects)
                            .sum()),
                    byQvto.cell(),
                    byAtl.cell(),
                    ratio(byAtl.median(), byQvto.median()))));
        }
        for (int i = 0; i < SIZES.size(); i++) {
            List<Project> projects = estate.subList(0, SIZES.get(i));
            // Each side loaded for every Project, whatever Lowering.lower does, so the pair stays a
            // like-for-like comparison of loading and running together.
            Benchmark.Series loaded = Benchmark.measure(
                    () -> all(projects, project -> QvtoLowering.prepared().lower(project)));
            Benchmark.Series compiled = Benchmark.measure(() -> all(projects, project -> AtlLowering.once(project)));
            String loadedCell = loaded.cell();
            String compiledCell = compiled.cell();
            String compiledRatio = ratio(compiled.median(), loaded.median());
            rows.get(i).addAll(List.of(loadedCell, compiledCell, compiledRatio));
        }
        Benchmark.report(
                "lowering-estate-scaling.md",
                Benchmark.environment()
                        + "\n"
                        + Benchmark.table(
                                List.of(
                                        "Projects",
                                        "objects",
                                        "QVTo ms (loaded once)",
                                        "ATL ms (compiled once)",
                                        "ATL / QVTo",
                                        "QVTo ms (loaded per Project)",
                                        "ATL ms (compiled per Project)",
                                        "ATL / QVTo"),
                                rows));
        assertThat(rows).hasSize(SIZES.size());
    }

    @Test
    void loadingAloneAndCold() {
        Benchmark.Series loadQvto = Benchmark.measure(QvtoLowering::prepared);
        Benchmark.Series loadAtl = Benchmark.measure(AtlLowering::prepared);
        List<List<String>> rows = new ArrayList<>();
        rows.add(List.of(
                "load, warm JVM (parse, compile, load the transformation)",
                loadQvto.cell(),
                loadAtl.cell(),
                ratio(loadAtl.median(), loadQvto.median())));
        List<Map<String, Long>> coldQvto = ColdRun.fork("lower", "qvto");
        List<Map<String, Long>> coldAtl = ColdRun.fork("lower", "atl");
        for (String timed : List.of("load", "first", "all")) {
            Benchmark.Series byQvto = series(coldQvto, timed);
            Benchmark.Series byAtl = series(coldAtl, timed);
            rows.add(List.of(
                    switch (timed) {
                        case "load" -> "cold JVM: load";
                        case "first" -> "cold JVM: load and lower the first estate Project";
                        default -> "cold JVM: load and lower all 24 estate Projects";
                    },
                    byQvto.cell(),
                    byAtl.cell(),
                    ratio(byAtl.median(), byQvto.median())));
        }
        Benchmark.report(
                "lowering-load-and-cold.md",
                Benchmark.environment()
                        + "\n"
                        + Benchmark.table(List.of("what is timed", "QVTo ms", "ATL ms", "ATL / QVTo"), rows));
        assertThat(rows).hasSize(4);
    }

    @Test
    void thePipelineCold() {
        List<List<String>> rows = new ArrayList<>();
        for (String example : List.of("minimal", "estate/hindsight")) {
            List<Map<String, Long>> samples = ColdRun.fork("pipeline", example);
            List<String> row = new ArrayList<>(List.of(example));
            for (String stage : List.of("read", "check", "lower", "resolve", "render")) {
                row.add(series(samples, stage).cell());
            }
            rows.add(row);
        }
        Benchmark.report(
                "stages-cold.md",
                Benchmark.environment()
                        + "\n"
                        + Benchmark.table(
                                List.of("example", "read ms", "check ms", "lower ms", "resolve ms", "render ms"),
                                rows));
        assertThat(rows).hasSize(2);
    }

    @Test
    void theSources() throws IOException {
        String qvto = source(Lowering.class.getResourceAsStream("/lower.qvto"));
        String atl = source(AtlLowering.class.getResourceAsStream("/benchmark/lower.atl"));
        List<List<String>> rows = List.of(
                List.of(
                        "lines",
                        String.valueOf(qvto.lines().count()),
                        String.valueOf(atl.lines().count())),
                List.of(
                        "lines of code (not blank, not a comment)",
                        String.valueOf(code(qvto)),
                        String.valueOf(code(atl))),
                List.of(
                        "mappings / rules",
                        String.valueOf(count(qvto, "^mapping ")),
                        count(atl, "^rule ") + " matched, " + count(atl, "^lazy rule ") + " lazy"),
                List.of(
                        "of which only dispatch to a subtype (`disjuncts`)",
                        String.valueOf(count(qvto, "\\bdisjuncts\\b")),
                        "–"),
                List.of(
                        "queries / helpers",
                        String.valueOf(count(qvto, "^query ")),
                        String.valueOf(count(atl, "^helper "))));
        Benchmark.report("lowering-sources.md", Benchmark.table(List.of("", "lower.qvto", "lower.atl"), rows));
        assertThat(code(atl)).isPositive();
    }

    /**
     * Both lowerings run over {@code projects} {@link #WARM_ROUNDS} times before anything is measured: a
     * lowering takes well under a millisecond, and the JIT settles only after some hundreds of them.
     */
    private static void warm(List<Project> projects, QvtoLowering qvto, AtlLowering atl) {
        for (int i = 0; i < WARM_ROUNDS; i++) {
            all(projects, project -> qvto.lower(project));
            all(projects, project -> atl.lower(project));
        }
    }

    private static List<?> all(List<Project> projects, Function<Project, ?> lowering) {
        return projects.stream().map(lowering).toList();
    }

    private static Benchmark.Series series(List<Map<String, Long>> samples, String timed) {
        return new Benchmark.Series(
                samples.stream().mapToLong(sample -> sample.get(timed)).toArray());
    }

    private static String ratio(double numerator, double denominator) {
        return String.format(Locale.ROOT, "%.2f×", numerator / denominator);
    }

    /** How many objects {@code project} holds, itself among them. */
    static int objects(EObject project) {
        int count = 1;
        for (TreeIterator<EObject> contents = project.eAllContents(); contents.hasNext(); contents.next()) {
            count++;
        }
        return count;
    }

    private static String source(InputStream in) throws IOException {
        try (in) {
            return new String(in.readAllBytes(), StandardCharsets.UTF_8);
        }
    }

    private static long code(String source) {
        return source.lines()
                .map(String::strip)
                .filter(line -> !line.isEmpty() && !line.startsWith("--"))
                .count();
    }

    private static long count(String source, String regex) {
        return Pattern.compile(regex, Pattern.MULTILINE)
                .matcher(source)
                .results()
                .count();
    }
}
