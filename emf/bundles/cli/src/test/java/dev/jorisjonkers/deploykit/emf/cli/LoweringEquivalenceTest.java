package dev.jorisjonkers.deploykit.emf.cli;

import static org.assertj.core.api.Assertions.assertThat;

import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.EffectiveProject;
import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.Project;
import dev.jorisjonkers.deploykit.emf.resolve.Lowering;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.regex.Pattern;
import org.eclipse.emf.common.util.TreeIterator;
import org.eclipse.emf.ecore.EObject;
import org.eclipse.emf.ecore.util.EcoreUtil;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;

/**
 * The ATL port of the lowering writes what the QVT-Operational lowering writes, on every Project the
 * worked examples lower: EMF Compare finds no difference between the two Effective Intents
 * (docs/benchmarks.md#equivalence). Opt-in with the benchmark, {@code -Demf.benchmark=true}: the port
 * ships in no bundle, so the default build does not hold it.
 */
@EnabledIfSystemProperty(named = Benchmark.PROPERTY, matches = "true")
class LoweringEquivalenceTest {

    @Test
    void theAtlPortLowersEveryExampleAsTheQvtoLoweringDoes() throws IOException {
        Map<String, Project> projects = BenchmarkInputs.lowered();
        AtlLowering atl = AtlLowering.prepared();
        QvtoLowering reused = QvtoLowering.prepared();
        List<String> differences = new ArrayList<>();
        for (Map.Entry<String, Project> entry : projects.entrySet()) {
            Project project = entry.getValue();
            Project before = EcoreUtil.copy(project);
            EffectiveProject qvto = Lowering.lower(project);
            EffectiveProject ported = atl.lower(project);
            differences.addAll(ModelDiff.differences(entry.getKey(), List.of(qvto), List.of(ported)));
            // The benchmark's QVTo lowering, loaded once, is the shipped one.
            differences.addAll(
                    ModelDiff.differences(entry.getKey() + " (reused)", List.of(qvto), List.of(reused.lower(project))));
            // Neither lowering writes to its source.
            differences.addAll(ModelDiff.differences(entry.getKey() + " (source)", List.of(before), List.of(project)));
        }
        // Every Project file a resolved example reads: the twelve worked ones and the estate's 24.
        assertThat(projects).hasSize(36);
        assertThat(differences).isEmpty();
        Benchmark.report("equivalence.md", exercised(projects.values()));
    }

    /**
     * Which of the port's rules the examples exercise: a rule is exercised where the inputs hold an
     * object of the class it matches, and equivalence says nothing of a rule they never reach.
     */
    private static String exercised(Collection<Project> projects) throws IOException {
        Map<String, Integer> held = new TreeMap<>();
        for (Project project : projects) {
            held.merge(project.eClass().getName(), 1, Integer::sum);
            for (TreeIterator<EObject> contents = project.eAllContents(); contents.hasNext(); ) {
                held.merge(contents.next().eClass().getName(), 1, Integer::sum);
            }
        }
        String atl;
        try (InputStream source = AtlLowering.class.getResourceAsStream("/benchmark/lower.atl")) {
            atl = new String(source.readAllBytes(), StandardCharsets.UTF_8);
        }
        List<String> rules = Pattern.compile("^(?:lazy )?rule (\\w+) \\{\\R\\tfrom s : PI!(\\w+)", Pattern.MULTILINE)
                .matcher(atl)
                .results()
                .map(rule -> rule.group(1) + " (" + rule.group(2) + "): " + held.getOrDefault(rule.group(2), 0))
                .toList();
        List<String> unreached =
                rules.stream().filter(rule -> rule.endsWith(": 0")).toList();
        return projects.size() + " Projects lowered by both, "
                + held.values().stream().mapToInt(Integer::intValue).sum() + " objects; "
                + (rules.size() - unreached.size()) + " of " + rules.size() + " rules exercised.\n\n"
                + "Objects each rule matches, over every input:\n\n- " + String.join("\n- ", rules) + "\n";
    }
}
