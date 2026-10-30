package dev.jorisjonkers.deploykit.emf.cli;

import static org.assertj.core.api.Assertions.assertThat;

import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.Cutover;
import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.Process;
import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.ProjectIntentFactory;
import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.ProjectIntentPackage;
import dev.jorisjonkers.deploykit.emf.metamodel.resolveddeployment.ResolvedDeploymentFactory;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import org.eclipse.emf.ecore.EClass;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;

/**
 * Field coverage is a ratchet: every gap a stage's cases leave (FieldCoverage) is either in the
 * stage's committed {@code gaps.txt} or fails the build, and an entry the cases now cover fails it
 * too, until it is removed, so the baseline only shrinks. {@code -Dgolden.update=true} removes the
 * covered entries; a new gap is never added by an update, only by hand.
 */
class FieldCoverageTest {

    private static final String BASELINE = "gaps.txt";

    static List<String> stages() {
        return Stages.ORDER;
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("stages")
    void aStagesGapsAreExactlyItsBaseline(String stage) throws IOException {
        List<String> gaps = FieldCoverage.gaps(stage);
        Path file = Stages.root().resolve(stage).resolve(BASELINE);
        List<String> baseline = Files.isRegularFile(file) ? Files.readAllLines(file) : List.of();

        if (Stages.updating()) {
            Set<String> kept = new TreeSet<>(gaps);
            if (Files.isRegularFile(file)) {
                kept.retainAll(baseline);
            }
            Files.createDirectories(file.getParent());
            Files.write(file, kept);
            return;
        }
        List<String> uncovered = new ArrayList<>(gaps);
        uncovered.removeAll(baseline);
        List<String> covered = new ArrayList<>(baseline);
        covered.removeAll(gaps);
        assertThat(uncovered)
                .withFailMessage(
                        "%s: %d gaps no case covers and %s does not excuse; add a case that covers each:%n%s",
                        stage, uncovered.size(), BASELINE, String.join("\n", uncovered))
                .isEmpty();
        assertThat(covered)
                .withFailMessage(
                        "%s: %d entries of %s are covered now; remove each (the ratchet only shrinks):%n%s",
                        stage, covered.size(), BASELINE, String.join("\n", covered))
                .isEmpty();
    }

    @Test
    void aFeatureNoInstanceSetsAndAClassNothingInstantiatesAreGaps() {
        ProjectIntentPackage model = ProjectIntentPackage.eINSTANCE;
        Process process = ProjectIntentFactory.eINSTANCE.createProcess();
        process.setName("api");
        Set<EClass> classes = Set.of(model.getProcess(), model.getPlacement());

        List<String> gaps = FieldCoverage.features(classes, List.of(process), "in a test");

        assertThat(gaps)
                .contains("Process.cutover is never set in a test", "Placement is never instantiated in a test")
                .doesNotContain("Process.name is never set in a test");
        process.setCutover(Cutover.INTERRUPTED);
        assertThat(FieldCoverage.features(classes, List.of(process), "in a test"))
                .doesNotContain("Process.cutover is never set in a test");
    }

    @Test
    void anEnumLiteralNoObjectHoldsIsAGap() {
        Process process = ProjectIntentFactory.eINSTANCE.createProcess();
        process.setCutover(Cutover.INTERRUPTED);
        Set<EClass> classes = Set.of(ProjectIntentPackage.eINSTANCE.getProcess());

        assertThat(FieldCoverage.literals(classes, List.of(process), "in a test"))
                .contains("Cutover.continuous is never used in a test")
                .doesNotContain("Cutover.interrupted is never used in a test");
    }

    @Test
    void aClassIsContainableThroughAnAbstractReferenceTypeByEveryConcreteSubtype() {
        Set<EClass> reached = FieldCoverage.containable(List.of(ProjectIntentPackage.eINSTANCE.getProject()));

        assertThat(reached)
                .contains(ProjectIntentPackage.eINSTANCE.getProcess(), ProjectIntentPackage.eINSTANCE.getKvGrant());
        assertThat(reached).doesNotContain(ProjectIntentPackage.eINSTANCE.getEffectiveProject());
    }

    @Test
    void aSchemaPathNoDocumentCarriesIsAGap(@TempDir Path directory) throws IOException {
        Path schema = Files.writeString(directory.resolve("x.schema.json"), """
                {"$ref": "#/$defs/Doc", "$defs": {
                  "Doc": {"type": "object", "properties": {
                    "name": {"type": "string"},
                    "items": {"type": "array", "items": {"anyOf": [{"$ref": "#/$defs/Item"}]}},
                    "labels": {"type": "object", "additionalProperties": {"type": "string"}},
                    "self": {"$ref": "#/$defs/Doc"}}},
                  "Item": {"type": "object", "properties": {"id": {"type": "string"}, "port": {"type": "integer"}}}}}
                """);
        Map<String, Object> document = Map.of("name", "x", "items", List.of(Map.of("id", "a")), "other", 1);

        assertThat(FieldCoverage.schemaPaths(schema, List.of(document), "a test"))
                .containsExactly(
                        "x.schema.json /items[]/port is never present in a test",
                        "x.schema.json /labels is never present in a test",
                        "x.schema.json /labels/* is never present in a test",
                        "x.schema.json /self is never present in a test");
    }

    @Test
    void aTypeTheTemplatesDispatchOnThatNoModelInstantiatesIsAGap(@TempDir Path directory) throws IOException {
        Path mtl = Files.writeString(directory.resolve("x.mtl"), """
                [template private objects(d : resolveddeployment::NamespaceFile)]
                [/template]
                [template private json(d : resolveddeployment::VaultRoleFile)]
                [/template]
                """);
        var deployment = ResolvedDeploymentFactory.eINSTANCE.createResolvedDeployment();
        deployment.getDeliverables().add(ResolvedDeploymentFactory.eINSTANCE.createNamespaceFile());

        assertThat(FieldCoverage.dispatch(mtl, List.of(deployment), "in a test"))
                .containsExactly("VaultRoleFile is never instantiated in a test (render.mtl dispatches on it)");
    }
}
