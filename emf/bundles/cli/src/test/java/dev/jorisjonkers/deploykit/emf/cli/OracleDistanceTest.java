package dev.jorisjonkers.deploykit.emf.cli;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.ObjectMapper;
import dev.jorisjonkers.deploykit.emf.metamodel.descriptor.DependencyEdges;
import dev.jorisjonkers.deploykit.emf.metamodel.descriptor.DescriptorFile;
import dev.jorisjonkers.deploykit.emf.metamodel.json.CanonicalJson;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.stream.Collectors;
import java.util.stream.Stream;
import org.eclipse.emf.common.util.URI;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

/**
 * How far this implementation is from the production implementation's oracles under {@code
 * spec/v1/examples/}, which moved on after the freeze. Every oracle is compared through the stage
 * harness's comparator; the cases in {@link #PASSING} must match it exactly, and every other case
 * prints one line saying how many differences it is from passing. A case that passes and is not
 * listed fails too, so the list grows with each catch-up slice and never lags behind it.
 */
class OracleDistanceTest {

    /** The oracle comparisons expected to pass, as {@code <oracle> <case>}. Each catch-up slice adds to it. */
    static final Set<String> PASSING = Set.of(
            "dependencies auth",
            "dependencies data",
            "dependencies delivery",
            "dependencies edge",
            "dependencies identity",
            "dependencies knowledge-platform",
            "dependencies minimal",
            "dependencies observability",
            "dependencies secrets",
            "descriptor expected",
            "effective auth",
            "effective data",
            "effective identity",
            "effective knowledge-platform",
            "effective minimal",
            "intent agents",
            "intent auth",
            "intent data",
            "intent delivery",
            "intent edge",
            "intent identity",
            "intent knowledge",
            "intent knowledge-platform",
            "intent mail",
            "intent minimal",
            "intent observability",
            "intent platform",
            "intent secrets",
            "intent utility",
            "refusal acme-proxy-replicated",
            "refusal alert-rules-not-found",
            "refusal alert-rules-outside-monitoring",
            "refusal alert-rules-without-groups",
            "refusal asset-not-found",
            "refusal backup-surface-not-provided",
            "refusal buckets-without-object-store",
            "refusal catalog-surface-not-provided",
            "refusal client-crd-not-bootstrapped",
            "refusal client-path-unrouted",
            "refusal client-placeholder-without-secret",
            "refusal credentials-without-database",
            "refusal cutover-continuous-over-rwo",
            "refusal cutover-missing",
            "refusal cutover-mixed",
            "refusal dashboard-not-found",
            "refusal dashboard-without-uid",
            "refusal duplicate-backup-claim",
            "refusal duplicate-claim",
            "refusal duplicate-dashboard-uid",
            "refusal duplicate-human-grant",
            "refusal duplicate-l4-port",
            "refusal duplicate-route-match",
            "refusal durability-policy-incomplete",
            "refusal durability-without-engine",
            "refusal engine-without-durability",
            "refusal env-cannot-reload",
            "refusal generated-key-adopts-ungranted",
            "refusal generated-key-outside-project",
            "refusal generated-key-twice",
            "refusal generated-key-written-elsewhere",
            "refusal handover-both-paths",
            "refusal handover-serving",
            "refusal handover-unlisted",
            "refusal illegal-delivery-for-access",
            "refusal image-runs-as-root",
            "refusal l4-address-exhausted",
            "refusal library-not-granted",
            "refusal migration-owner-duplicated",
            "refusal migration-undeclared",
            "refusal migration-ungated",
            "refusal migration-without-database",
            "refusal mongo-credentials-without-database",
            "refusal mongo-without-durability",
            "refusal no-acme-policy",
            "refusal no-dashboard-policy",
            "refusal no-delivery-policy",
            "refusal no-direct-target",
            "refusal no-durability-policy",
            "refusal no-engine-policy",
            "refusal no-forward-auth-endpoint",
            "refusal no-migration-policy",
            "refusal no-secret-store",
            "refusal no-sign-in-provider",
            "refusal no-tier-for-audience",
            "refusal no-upstream-nameservers",
            "refusal no-vpn-policy",
            "refusal node-address-continuous",
            "refusal node-address-replicated",
            "refusal node-port-taken",
            "refusal non-kv-delivery",
            "refusal owner-role-granted",
            "refusal placement-incomplete",
            "refusal prepare-process-serves",
            "refusal process-rbac-grant",
            "refusal profile-key-authored",
            "refusal redirect-loop",
            "refusal release-unit-no-readiness",
            "refusal schedule-missing",
            "refusal schedule-unscheduled",
            "refusal scheduled-process-serves",
            "refusal scrape-unknown-process",
            "refusal secrets-at-rest-required",
            "refusal secrets-at-rest-required-at-header",
            "refusal self-without-vault-client",
            "refusal shared-declaration-duplicated",
            "refusal shared-quantity",
            "refusal surface-label-invalid",
            "refusal tier-class-unfiltered",
            "refusal tier-surface-missing",
            "refusal tier-without-ingress-class",
            "refusal unauthorised-secret-reference",
            "refusal unbound-secret-grant",
            "refusal unknown-api-holder",
            "refusal unknown-critical-application",
            "refusal unknown-enrolled-project",
            "refusal unknown-forward-auth-provider",
            "refusal unknown-l4-address",
            "refusal unknown-library",
            "refusal unknown-machinery",
            "refusal unknown-monitoring-application",
            "refusal unknown-receiver",
            "refusal unknown-surface",
            "refusal unknown-telemetry-collector",
            "refusal unknown-tier-proxy",
            "refusal unresolved-placeholder",
            "rendered agents",
            "rendered auth",
            "rendered data",
            "rendered delivery",
            "rendered edge",
            "rendered identity",
            "rendered knowledge-platform",
            "rendered mail",
            "rendered minimal",
            "rendered node",
            "rendered platform",
            "rendered secrets",
            "rendered utility",
            "resolved agents",
            "resolved auth",
            "resolved data-main",
            "resolved delivery",
            "resolved edge",
            "resolved knowledge-platform",
            "resolved mail",
            "resolved minimal-main",
            "resolved node",
            "resolved utility",
            "schema-refusal credentials-file-without-mount",
            "schema-refusal egress-outside-vocabulary",
            "schema-refusal egress-with-range",
            "schema-refusal egress-without-reason",
            "schema-refusal every-offending-value",
            "schema-refusal human-grant-in-a-namespace",
            "schema-refusal human-grant-role-outside-vocabulary",
            "schema-refusal human-grant-to-a-user",
            "schema-refusal human-grant-without-reason",
            "schema-refusal missing-field",
            "schema-refusal no-shape-matches",
            "schema-refusal outside-yaml-subset",
            "schema-refusal platform-unknown-field",
            "schema-refusal rate-limit-of-no-requests",
            "schema-refusal rate-limit-period-in-milliseconds",
            "schema-refusal rate-limit-without-period",
            "schema-refusal schedule-malformed",
            "schema-refusal two-documents",
            "schema-refusal unknown-field",
            "schema-refusal wrong-type");

    @Test
    void theListedOraclesMatchAndEveryOtherSaysHowFarItIs(@TempDir Path scratch) throws IOException {
        Map<String, List<String>> distances = distances(scratch);
        List<String> summary = new ArrayList<>();
        List<String> failing = new ArrayList<>();
        List<String> unlisted = new ArrayList<>();
        distances.forEach((comparison, differences) -> {
            boolean listed = PASSING.contains(comparison);
            if (listed && !differences.isEmpty()) {
                failing.add(
                        comparison + ": " + differences.size() + " differences\n  " + String.join("\n  ", differences));
            } else if (!listed && differences.isEmpty()) {
                unlisted.add(comparison);
            } else if (!listed) {
                summary.add(comparison + ": " + differences.size() + " differences; first: " + differences.get(0));
            }
        });
        // Every difference of every comparison, for the reader of one case's distance.
        Files.writeString(
                Path.of("target", "oracle-distance.txt"),
                distances.entrySet().stream()
                        .map(entry -> entry.getKey() + ": " + entry.getValue().size() + "\n  "
                                + String.join("\n  ", entry.getValue()))
                        .collect(Collectors.joining("\n")));
        System.out.println("Oracle distance, " + (distances.size() - summary.size()) + " of " + distances.size()
                + " passing:\n  " + String.join("\n  ", summary));

        assertThat(failing)
                .withFailMessage("listed as passing, and not:%n%s", String.join("\n", failing))
                .isEmpty();
        assertThat(unlisted)
                .withFailMessage("passing, and not listed: add each to PASSING:%n%s", String.join("\n", unlisted))
                .isEmpty();
        assertThat(distances.keySet()).containsAll(PASSING);
    }

    /** Every oracle comparison, by {@code <oracle> <case>}, with every difference it finds. */
    static Map<String, List<String>> distances(Path scratch) throws IOException {
        Map<String, List<String>> distances = new TreeMap<>();
        Path examples = Examples.of("");
        distances.put(
                "descriptor expected",
                compare(
                        examples.resolve("expected").resolve(DescriptorFile.NAME),
                        Files.readAllBytes(DescriptorFile.write(scratch.resolve("descriptor")))));
        for (Path directory : casesWith(examples, "expected/intent.json")) {
            distances.put("intent " + name(examples, directory), attempt(() -> {
                Parsed parsed = Pipeline.intent(authored(directory));
                return parsed.ok()
                        ? compare(directory.resolve("expected/intent.json"), json(parsed.intent()))
                        : refused(parsed.diagnostics());
            }));
        }
        for (Path directory : casesWith(examples, "expected/effective.json")) {
            distances.put("effective " + name(examples, directory), attempt(() -> {
                Parsed parsed = Pipeline.effective(authored(directory));
                return parsed.ok()
                        ? compare(directory.resolve("expected/effective.json"), json(parsed.intent()))
                        : refused(parsed.diagnostics());
            }));
        }
        for (Path directory : casesWith(examples, "expected/" + DependencyEdges.NAME)) {
            Outputs.Resolving resolving = Outputs.RESOLVED.get(name(examples, directory));
            distances.put(
                    "dependencies " + name(examples, directory),
                    resolving == null
                            ? List.of("no union this implementation resolves")
                            : attempt(() -> {
                                Resolved resolved = Pipeline.resolve(
                                        resolving.documents().stream()
                                                .map(Examples::of)
                                                .toList(),
                                        resolving.project(),
                                        Outputs.INTEGRITY);
                                return resolved.ok()
                                        ? compare(
                                                directory.resolve("expected/" + DependencyEdges.NAME),
                                                json(DependencyEdges.of(resolved.deployment())))
                                        : refused(resolved.diagnostics());
                            }));
        }
        for (Path directory : casesWith(examples, "rendered")) {
            Path rendered = directory.resolve("rendered");
            // The platform's tree is the estate-scoped share every render holds, which a render of
            // notes, naming nothing estate-scoped of its own, holds alone.
            Outputs.Resolving resolving = Outputs.RESOLVED.get(
                    name(examples, directory).equals(PLATFORM) ? "minimal" : name(examples, directory));
            Path out = scratch.resolve("rendered").resolve(name(examples, directory));
            distances.put(
                    "rendered " + name(examples, directory),
                    resolving == null
                            ? List.of("no union this implementation renders; "
                                    + Comparison.read(rendered).size() + " files")
                            : attempt(() -> {
                                List<Diagnostic> refusals = Pipeline.render(
                                        resolving.documents().stream()
                                                .map(Examples::of)
                                                .toList(),
                                        List.of(resolving.project()),
                                        Outputs.INTEGRITY,
                                        out);
                                return refusals.isEmpty()
                                        ? share(examples, rendered, Comparison.read(out))
                                        : refused(refusals);
                            }));
        }
        // A given resolve case is the Resolved Deployment main's rendered tree needs, written by hand.
        for (String name : Stages.cases("resolve")) {
            String example = name.replaceFirst("-main$", "");
            Outputs.Resolving resolving = Outputs.RESOLVED.get(example);
            if (!Stages.given("resolve", name)) {
                continue;
            }
            for (String project : Stages.projects(name)) {
                Path given = Stages.expected("resolve", name).resolve(project + Stages.RESOLVED_MODEL);
                distances.put(
                        "resolved " + name,
                        resolving == null
                                ? List.of("no union this implementation resolves")
                                : attempt(() -> {
                                    Resolved resolved = Pipeline.resolve(
                                            resolving.documents().stream()
                                                    .map(Examples::of)
                                                    .toList(),
                                            project,
                                            Outputs.INTEGRITY);
                                    if (resolved.ok() && regiven(name)) {
                                        Files.write(given, Stages.xmi(given, resolved.deployment()));
                                    }
                                    return resolved.ok()
                                            ? Comparison.files(
                                                    given.getFileName().toString(),
                                                    URI.createFileURI(given.toString()),
                                                    Files.readAllBytes(given),
                                                    Stages.xmi(given, resolved.deployment()))
                                            : refused(resolved.diagnostics());
                                }));
            }
        }
        for (String kind : List.of("refusals", "schema-refusals")) {
            for (Path oracle : diagnosticsOracles(examples.resolve(kind))) {
                String stem = oracle.getFileName().toString().replace(DIAGNOSTICS, "");
                Path set = oracle.resolveSibling(stem);
                distances.put(
                        kind.replaceFirst("s$", "") + " " + stem,
                        attempt(() -> Comparison.json(
                                oracle.getFileName().toString(),
                                sorted(JSON.readValue(oracle.toFile(), List.class)),
                                sorted(Stages.diagnostics(
                                        Files.isDirectory(set)
                                                ? Pipeline.check(documentsIn(set))
                                                : Pipeline.intent(oracle.resolveSibling(stem + ".project.yml"))
                                                        .diagnostics())))));
            }
        }
        return distances;
    }

    private static final String DIAGNOSTICS = ".diagnostics.json";

    private static final ObjectMapper JSON = new ObjectMapper();

    /** A list of diagnostics as canonical JSON, in an order neither implementation's run decides. */
    private static String sorted(List<?> diagnostics) {
        return CanonicalJson.write(diagnostics.stream()
                .map(diagnostic -> (Object) new TreeMap<>((Map<?, ?>) diagnostic))
                .sorted(Comparator.comparing(Object::toString))
                .toList());
    }

    private static List<Path> diagnosticsOracles(Path directory) throws IOException {
        try (Stream<Path> files = Files.list(directory)) {
            return files.filter(file -> file.getFileName().toString().endsWith(DIAGNOSTICS))
                    .sorted()
                    .toList();
        }
    }

    /** The documents of a refused set: its project files, its Platform document and its images lock, sorted. */
    private static List<Path> documentsIn(Path set) throws IOException {
        try (Stream<Path> files = Files.list(set)) {
            return files.filter(file -> {
                        String name = file.getFileName().toString();
                        return name.endsWith(".project.yml")
                                || name.equals("platform.intent.yml")
                                || name.equals("images.lock.yml");
                    })
                    .sorted()
                    .toList();
        }
    }

    /** A step that fails outright, such as a resolution that does not complete, is one difference. */
    private static List<String> attempt(Step step) {
        try {
            return step.differences();
        } catch (IOException | RuntimeException e) {
            return List.of("did not complete: "
                    + String.valueOf(e.getMessage()).lines().findFirst().orElse(""));
        }
    }

    @FunctionalInterface
    private interface Step {
        List<String> differences() throws IOException;
    }

    private static List<String> compare(Path oracle, byte[] written) throws IOException {
        String name = oracle.getFileName().toString();
        return Comparison.files(name, URI.createFileURI(oracle.toString()), Files.readAllBytes(oracle), written);
    }

    /**
     * The distance of a rendering from the share a committed tree holds. The production
     * implementation commits a Project's own artifact under {@code apps/}, the estate-scoped
     * artifact under {@code estate/} and the pinned sources under {@code projects/}, each only in
     * the trees that hold its directory, so a rendering is compared on the directories its tree
     * holds. A Project's tree that holds the estate-scoped share holds it beside the platform's own
     * share, which the platform's tree holds for every render.
     */
    private static List<String> share(Path examples, Path committed, Map<String, byte[]> rendered) {
        Set<String> held = Comparison.read(committed).keySet().stream()
                .map(name -> name.substring(0, name.indexOf('/') + 1))
                .collect(Collectors.toSet());
        rendered.keySet().removeIf(name -> !held.contains(name.substring(0, name.indexOf('/') + 1)));
        Path platform = examples.resolve(PLATFORM).resolve("rendered");
        if (!held.contains(ESTATE + "/")
                || committed
                        .toAbsolutePath()
                        .normalize()
                        .equals(platform.toAbsolutePath().normalize())) {
            return Comparison.trees(committed, rendered);
        }
        Set<String> everyRenders = Comparison.read(platform).keySet();
        Map<String, byte[]> own = new TreeMap<>(rendered);
        own.keySet().removeAll(everyRenders);
        Map<String, byte[]> platformShare = new TreeMap<>(rendered);
        platformShare.keySet().retainAll(everyRenders);
        List<String> distance = new ArrayList<>(Comparison.trees(committed, own));
        distance.addAll(Comparison.trees(platform, platformShare));
        return distance;
    }

    private static final String PLATFORM = "platform";

    /**
     * The property naming the given resolve cases a run rewrites from what this implementation
     * resolves, comma-separated: a hand-written case is replaced once the rendered tree it drives
     * equals main's, so it stops standing in for a resolution that now exists.
     */
    static final String REGIVEN = "given.update";

    private static boolean regiven(String name) {
        return List.of(System.getProperty(REGIVEN, "").split(",")).contains(name);
    }

    private static final String ESTATE = "estate";

    private static List<String> refused(List<Diagnostic> diagnostics) {
        return diagnostics.stream()
                .map(diagnostic -> "refused: " + diagnostic.code() + " " + diagnostic.document() + " "
                        + diagnostic.path() + " (" + diagnostic.message() + ")")
                .toList();
    }

    private static byte[] json(Object value) {
        return CanonicalJson.write(value).getBytes(StandardCharsets.UTF_8);
    }

    private static String name(Path examples, Path directory) {
        return examples.relativize(directory).toString().replace('\\', '/');
    }

    /** The one authored document of a case: the first project file, or its Platform document. */
    private static Path authored(Path directory) throws IOException {
        try (Stream<Path> entries = Files.list(directory)) {
            return entries.filter(path -> {
                        String file = path.getFileName().toString();
                        return file.endsWith(".project.yml") || file.equals("platform.intent.yml");
                    })
                    .min(Comparator.naturalOrder())
                    .orElseThrow();
        }
    }

    /** The case directories under {@code examples} carrying {@code oracle}, a path relative to the case. */
    private static List<Path> casesWith(Path examples, String oracle) throws IOException {
        try (Stream<Path> tree = Files.walk(examples)) {
            return tree.filter(path -> path.endsWith(oracle))
                    .map(path -> oracle.contains("/") ? path.getParent().getParent() : path.getParent())
                    .sorted()
                    .toList();
        }
    }
}
