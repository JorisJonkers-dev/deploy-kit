package dev.jorisjonkers.deploykit.emf.cli;

import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.Project;
import dev.jorisjonkers.deploykit.emf.metamodel.resolveddeployment.ResolvedDeployment;
import dev.jorisjonkers.deploykit.emf.render.Rendering;
import dev.jorisjonkers.deploykit.emf.resolve.Lowering;
import dev.jorisjonkers.deploykit.emf.resolve.Resolution;
import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import org.eclipse.emf.ecore.EObject;

/**
 * One cold sample, in a JVM started for it alone (docs/benchmarks.md): every class is loaded, every
 * transformation compiled and every method interpreted for the first time inside the timing. It prints
 * one {@code COLD name=nanos} line per thing it timed, which {@link #fork} reads back.
 */
final class ColdRun {

    private static final String PREFIX = "COLD ";

    private ColdRun() {}

    /**
     * {@code lower qvto|atl}: the estate's Projects read and checked untimed, then the first Project's
     * lowering and every Project's lowering timed. {@code pipeline <case>}: each stage of one worked
     * example timed once, in the order the pipeline runs them.
     */
    public static void main(String[] args) throws IOException {
        Map<String, Long> timed =
                switch (args[0]) {
                    case "lower" -> lower(args[1]);
                    case "pipeline" -> pipeline(args[1]);
                    default -> throw new IllegalArgumentException("no cold run " + args[0]);
                };
        timed.forEach((name, nanos) -> System.out.println(PREFIX + name + "=" + nanos));
    }

    private static Map<String, Long> lower(String engine) {
        List<Project> projects = BenchmarkInputs.projects(BenchmarkInputs.authored(
                BenchmarkInputs.files(BenchmarkInputs.estate(BenchmarkInputs.ESTATE_ORDER.size()))));
        Map<String, Long> timed = new LinkedHashMap<>();
        long start = System.nanoTime();
        Function<Project, ?> lowering =
                switch (engine) {
                    case "qvto" -> {
                        QvtoLowering qvto = QvtoLowering.prepared();
                        yield project -> qvto.lower(project);
                    }
                    case "atl" -> {
                        AtlLowering atl = AtlLowering.prepared();
                        yield project -> atl.lower(project);
                    }
                    default -> throw new IllegalArgumentException("no lowering " + engine);
                };
        timed.put("load", System.nanoTime() - start);
        lowering.apply(projects.get(0));
        timed.put("first", System.nanoTime() - start);
        for (Project project : projects.subList(1, projects.size())) {
            lowering.apply(project);
        }
        timed.put("all", System.nanoTime() - start);
        return timed;
    }

    private static Map<String, Long> pipeline(String example) throws IOException {
        Outputs.Resolving resolving = Outputs.RESOLVED.get(example);
        List<Path> files = BenchmarkInputs.files(resolving.documents());
        Map<String, Long> timed = new LinkedHashMap<>();
        long start = System.nanoTime();
        Pipeline.read(files);
        timed.put("read", System.nanoTime() - start);
        start = System.nanoTime();
        Authored authored = BenchmarkInputs.authored(files);
        timed.put("check", System.nanoTime() - start);
        start = System.nanoTime();
        List<EObject> intent = new ArrayList<>();
        for (EObject root : authored.intent()) {
            intent.add(root);
            if (root instanceof Project project) {
                intent.add(Lowering.lower(project));
            }
        }
        timed.put("lower", System.nanoTime() - start);
        start = System.nanoTime();
        ResolvedDeployment deployment =
                Resolution.resolve(intent, authored.pinned(), resolving.project(), Outputs.INTEGRITY);
        timed.put("resolve", System.nanoTime() - start);
        Path root = Files.createTempDirectory("cold-render");
        start = System.nanoTime();
        Rendering.render(List.of(deployment), root);
        timed.put("render", System.nanoTime() - start);
        return timed;
    }

    /** {@code args} run in {@link Benchmark#forks()} fresh JVMs, each one's timings in nanoseconds by name. */
    static List<Map<String, Long>> fork(String... args) {
        List<Map<String, Long>> samples = new ArrayList<>();
        for (int i = 0; i < Benchmark.forks(); i++) {
            List<String> command = new ArrayList<>(List.of(
                    Path.of(System.getProperty("java.home"), "bin", "java").toString(),
                    "-cp",
                    System.getProperty("java.class.path"),
                    ColdRun.class.getName()));
            command.addAll(List.of(args));
            samples.add(run(command));
        }
        return samples;
    }

    private static Map<String, Long> run(List<String> command) {
        try {
            java.lang.Process child =
                    new ProcessBuilder(command).redirectErrorStream(true).start();
            Map<String, Long> timed = new LinkedHashMap<>();
            List<String> said = new ArrayList<>();
            try (BufferedReader out =
                    new BufferedReader(new InputStreamReader(child.getInputStream(), StandardCharsets.UTF_8))) {
                for (String line = out.readLine(); line != null; line = out.readLine()) {
                    if (line.startsWith(PREFIX)) {
                        String[] pair = line.substring(PREFIX.length()).split("=", 2);
                        try {
                            timed.put(pair[0], Long.parseLong(pair[1]));
                        } catch (NumberFormatException e) {
                            throw new IllegalStateException("not a timing: " + line, e);
                        }
                    } else {
                        said.add(line);
                    }
                }
            }
            if (child.waitFor() != 0 || timed.isEmpty()) {
                throw new IllegalStateException(command + " failed:\n" + String.join("\n", said));
            }
            return timed;
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException(e);
        }
    }
}
