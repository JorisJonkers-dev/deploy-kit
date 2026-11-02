package dev.jorisjonkers.deploykit.emf.cli;

import static org.assertj.core.api.Assertions.assertThat;

import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.EffectiveProject;
import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.Project;
import dev.jorisjonkers.deploykit.emf.resolve.Lowering;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
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
    void theAtlPortLowersEveryExampleAsTheQvtoLoweringDoes() {
        Map<String, Project> projects = BenchmarkInputs.lowered();
        AtlLowering atl = AtlLowering.prepared();
        List<String> differences = new ArrayList<>();
        for (Map.Entry<String, Project> entry : projects.entrySet()) {
            Project project = entry.getValue();
            Project before = EcoreUtil.copy(project);
            EffectiveProject qvto = Lowering.lower(project);
            EffectiveProject ported = atl.lower(project);
            differences.addAll(ModelDiff.differences(entry.getKey(), List.of(qvto), List.of(ported)));
            // Neither lowering writes to its source.
            differences.addAll(ModelDiff.differences(entry.getKey() + " (source)", List.of(before), List.of(project)));
        }
        assertThat(projects).hasSizeGreaterThan(30);
        assertThat(differences).isEmpty();
    }
}
