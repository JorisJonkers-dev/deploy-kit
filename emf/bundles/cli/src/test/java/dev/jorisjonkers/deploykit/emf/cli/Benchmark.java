package dev.jorisjonkers.deploykit.emf.cli;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.UncheckedIOException;
import java.lang.management.GarbageCollectorMXBean;
import java.lang.management.ManagementFactory;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.function.Supplier;
import java.util.stream.Collectors;

/**
 * The benchmark's switch, its measuring and its report (docs/benchmarks.md). A series runs its task
 * {@link #warmup()} times unmeasured, then {@link #runs()} times measured, each run timed alone with
 * {@link System#nanoTime()}, and reports the median and the spread of the measured runs. A cold
 * sample is one run in a JVM started for it alone ({@link ColdRun}).
 */
final class Benchmark {

    /** The system property that runs the benchmark: {@code -Demf.benchmark=true}, which {@code -Pbenchmark} sets. */
    static final String PROPERTY = "emf.benchmark";

    /** Where a run writes its tables, under the cli bundle's build directory. */
    static final Path REPORT = Path.of("target", "benchmark");

    /** What keeps a task's result reachable, so the JIT cannot drop the work that made it. */
    @SuppressWarnings("unused")
    private static volatile Object sink;

    private Benchmark() {}

    static int warmup() {
        return Integer.getInteger(PROPERTY + ".warmup", 5);
    }

    static int runs() {
        return Integer.getInteger(PROPERTY + ".runs", 10);
    }

    /** How many fresh JVMs a cold series starts. */
    static int forks() {
        return Integer.getInteger(PROPERTY + ".forks", 5);
    }

    /** {@code task} run {@link #warmup()} times, then measured {@link #runs()} times. */
    static Series measure(Supplier<?> task) {
        return measure(warmup(), runs(), task);
    }

    static Series measure(int warmup, int runs, Supplier<?> task) {
        for (int i = 0; i < warmup; i++) {
            sink = task.get();
        }
        long[] nanos = new long[runs];
        for (int i = 0; i < runs; i++) {
            long start = System.nanoTime();
            sink = task.get();
            nanos[i] = System.nanoTime() - start;
        }
        return new Series(nanos);
    }

    /** The measured runs of one series, in nanoseconds. */
    record Series(long[] nanos) {

        Series {
            nanos = nanos.clone();
            Arrays.sort(nanos);
        }

        double median() {
            return quantile(0.5);
        }

        /** The value {@code q} of the way up the sorted runs, interpolated between neighbours. */
        double quantile(double q) {
            double at = q * (nanos.length - 1);
            int below = (int) Math.floor(at);
            int above = (int) Math.ceil(at);
            return nanos[below] + (nanos[above] - nanos[below]) * (at - below);
        }

        double min() {
            return nanos[0];
        }

        double max() {
            return nanos[nanos.length - 1];
        }

        /** {@code median [p25–p75]} in milliseconds: the median and the interquartile range. */
        String cell() {
            return String.format(Locale.ROOT, "%s [%s–%s]", ms(median()), ms(quantile(0.25)), ms(quantile(0.75)));
        }

        /** The median in milliseconds alone. */
        String medianCell() {
            return ms(median());
        }

        /** {@code min–max} in milliseconds. */
        String range() {
            return String.format(Locale.ROOT, "%s–%s", ms(min()), ms(max()));
        }
    }

    /** {@code nanos} in milliseconds, to three significant figures at most and one decimal at least. */
    static String ms(double nanos) {
        double millis = nanos / 1e6;
        if (millis >= 100) {
            return String.format(Locale.ROOT, "%.0f", millis);
        }
        if (millis >= 10) {
            return String.format(Locale.ROOT, "%.1f", millis);
        }
        return String.format(Locale.ROOT, "%.2f", millis);
    }

    /** A Markdown table: a header row and the rows under it. */
    static String table(List<String> header, List<List<String>> rows) {
        StringBuilder table = new StringBuilder();
        table.append("| ").append(String.join(" | ", header)).append(" |\n");
        table.append("|")
                .append(header.stream().map(h -> "---").collect(Collectors.joining("|")))
                .append("|\n");
        for (List<String> row : rows) {
            table.append("| ").append(String.join(" | ", row)).append(" |\n");
        }
        return table.toString();
    }

    /** {@code text} written to {@code name} under {@link #REPORT}, and printed. */
    static void report(String name, String text) {
        try {
            Files.createDirectories(REPORT);
            Files.writeString(REPORT.resolve(name), text, StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
        System.out.println("=== " + name + "\n" + text);
    }

    /** The JVM and the machine a run measured on, and how it measured. */
    static String environment() {
        Runtime runtime = Runtime.getRuntime();
        List<String> lines = new ArrayList<>();
        lines.add("- JVM: " + System.getProperty("java.vm.name") + " " + System.getProperty("java.vm.version") + " ("
                + System.getProperty("java.vm.vendor") + ")");
        lines.add("- JVM arguments: "
                + String.join(" ", ManagementFactory.getRuntimeMXBean().getInputArguments()));
        lines.add("- Heap maximum: " + runtime.maxMemory() / (1024 * 1024) + " MiB");
        lines.add("- Collectors: "
                + ManagementFactory.getGarbageCollectorMXBeans().stream()
                        .map(GarbageCollectorMXBean::getName)
                        .collect(Collectors.joining(", ")));
        lines.add("- OS: " + System.getProperty("os.name") + " " + System.getProperty("os.version") + " "
                + System.getProperty("os.arch") + ", " + runtime.availableProcessors() + " processors");
        lines.add("- CPU: " + sysctl("machdep.cpu.brand_string"));
        lines.add("- Memory: " + sysctl("hw.memsize"));
        lines.add("- Warm-up runs: " + warmup() + ", measured runs: " + runs() + ", cold JVMs: " + forks());
        return String.join("\n", lines) + "\n";
    }

    /** A macOS kernel value, or what was asked when there is none to read. */
    private static String sysctl(String name) {
        try {
            java.lang.Process sysctl = new ProcessBuilder("sysctl", "-n", name)
                    .redirectErrorStream(true)
                    .start();
            try (BufferedReader out =
                    new BufferedReader(new InputStreamReader(sysctl.getInputStream(), StandardCharsets.UTF_8))) {
                String value = out.lines().collect(Collectors.joining(" ")).trim();
                return sysctl.waitFor() == 0 && !value.isEmpty() ? value : "(no " + name + ")";
            }
        } catch (IOException e) {
            return "(no " + name + ": " + e.getMessage() + ")";
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return "(no " + name + ")";
        }
    }
}
