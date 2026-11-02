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

    /** The real estate's Platform document and pinned inputs, which every estate union reads. */
    private static final List<String> ESTATE_PINNED = List.of(
            "estate/platform.intent.yml",
            "estate/node-contract.yml",
            "estate/images.lock.yml",
            "estate/cluster-state.yml");

    /**
     * The estate's 24 Projects, in the order the scaling series adds them. The first twelve are the
     * smallest union the checks accept: the Platform document names an Application of each, or another
     * of the twelve depends on one. Every prefix from twelve on is accepted, each later Project depending
     * only on Projects before it; a prefix shorter than twelve is read and lowered, never checked.
     */
    static final List<String> ESTATE_ORDER = List.of(
            "arr",
            "auth",
            "data",
            "delivery",
            "edge",
            "estate-dashboard",
            "mail",
            "observability",
            "prowlarr",
            "qbittorrent",
            "secrets",
            "utility",
            "findability-explorer",
            "grimoire",
            "hindsight",
            "home-portal",
            "immich",
            "jellyfin",
            "jellyseerr",
            "karakeep",
            "n8n",
            "outline",
            "overleaf",
            "tribelt");

    /** The smallest estate union the checks accept. */
    static final int ESTATE_CORE = 12;

    private BenchmarkInputs() {}

    /** The estate's pinned inputs and its first {@code projects} Projects in {@link #ESTATE_ORDER}. */
    static List<String> estate(int projects) {
        List<String> documents = new ArrayList<>(ESTATE_PINNED);
        for (String project : ESTATE_ORDER.subList(0, projects)) {
            documents.add("estate/" + project + "/" + project + ".project.yml");
        }
        return documents;
    }

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
