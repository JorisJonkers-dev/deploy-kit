package dev.jorisjonkers.deploykit.emf.cli;

import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.Project;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import org.eclipse.emf.ecore.EObject;

/**
 * What the benchmark runs on (docs/benchmarks.md): the worked examples this implementation resolves,
 * each read with the union {@link Outputs#RESOLVED} names, and every Project those unions lower.
 */
final class BenchmarkInputs {

    private BenchmarkInputs() {}

    /** Every case {@link Outputs#RESOLVED} resolves, by name, with the documents it is read with. */
    static Map<String, Outputs.Resolving> cases() {
        return new TreeMap<>(Outputs.RESOLVED);
    }

    /** {@code documents}, relative to the examples, as paths. */
    static List<Path> files(List<String> documents) {
        return documents.stream().map(Examples::of).toList();
    }

    /** {@code files} read, checked and attached to their env files, as the pipeline reads them before lowering. */
    static Authored authored(List<Path> files) {
        try {
            Authored authored = Pipeline.authored(files);
            if (!authored.ok()) {
                throw new IllegalStateException("the pipeline refuses " + files + ": " + authored.diagnostics());
            }
            return authored;
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    /** The authored Projects of {@code authored}, in the order they were read. */
    static List<Project> projects(Authored authored) {
        List<Project> projects = new ArrayList<>();
        for (EObject root : authored.intent()) {
            if (root instanceof Project project) {
                projects.add(project);
            }
        }
        return projects;
    }

    /**
     * Every Project file any case reads, each once, by its path under the examples, read with the first
     * case's union that holds it: the input of every lowering the pipeline runs.
     */
    static Map<String, Project> lowered() {
        Map<String, Project> projects = new LinkedHashMap<>();
        for (Outputs.Resolving resolving : cases().values()) {
            List<String> unread = resolving.documents().stream()
                    .filter(document -> document.endsWith(".project.yml") && !projects.containsKey(document))
                    .toList();
            if (unread.isEmpty()) {
                continue;
            }
            Authored authored = authored(files(resolving.documents()));
            for (Project project : projects(authored)) {
                String document = Examples.repository()
                        .resolve("spec/v1/examples")
                        .relativize(Path.of(project.eResource().getURI().toFileString()))
                        .toString()
                        .replace('\\', '/');
                projects.putIfAbsent(document, project);
            }
        }
        return projects;
    }
}
