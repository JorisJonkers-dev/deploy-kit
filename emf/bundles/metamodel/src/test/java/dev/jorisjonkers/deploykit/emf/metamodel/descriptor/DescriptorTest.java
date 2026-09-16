package dev.jorisjonkers.deploykit.emf.metamodel.descriptor;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.ProjectIntentPackage;
import java.util.List;
import java.util.Map;
import org.eclipse.emf.ecore.EDataType;
import org.eclipse.emf.ecore.EPackage;
import org.eclipse.emf.ecore.EcoreFactory;
import org.junit.jupiter.api.Test;

/** What the descriptor says about the Project Intent metamodel. */
class DescriptorTest {

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> entries(String kind) {
        return (List<Map<String, Object>>)
                Descriptor.of(ProjectIntentPackage.eINSTANCE).get(kind);
    }

    private static Map<String, Object> named(String kind, String name) {
        return entries(kind).stream()
                .filter(entry -> name.equals(entry.get("name")))
                .findFirst()
                .orElseThrow();
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> feature(String owner, String name) {
        return ((List<Map<String, Object>>) named("classes", owner).get("features"))
                .stream()
                        .filter(feature -> name.equals(feature.get("name")))
                        .findFirst()
                        .orElseThrow();
    }

    @Test
    void everyClassAndVocabularyIsListedOnceAndSorted() {
        List<String> classes = entries("classes").stream()
                .map(entry -> (String) entry.get("name"))
                .toList();
        List<String> vocabularies = entries("vocabularies").stream()
                .map(entry -> (String) entry.get("name"))
                .toList();

        assertThat(classes).isSorted().doesNotHaveDuplicates().contains("Project", "Process", "KvGrant");
        assertThat(vocabularies).isSorted().doesNotHaveDuplicates().contains("AlertClass", "TransitOp");
    }

    @Test
    void anAbstractClassIsAUnionRatherThanAClassOfItsOwn() {
        assertThat(entries("classes").stream().map(entry -> entry.get("name")))
                .doesNotContain("Grant", "Probe", "ProbePolicy");
        assertThat(feature("Process", "secrets").get("types"))
                .isEqualTo(List.of("DatabaseGrant", "KvGrant", "TransitGrant"));
        assertThat(feature("Process", "probes").get("types")).isEqualTo(List.of("NoProbes", "Probes"));
    }

    @Test
    void aMapEntryIsAMapRatherThanAClassOfItsOwn() {
        assertThat(entries("classes").stream().map(entry -> entry.get("name"))).doesNotContain("Surface");
        assertThat(feature("Process", "provides"))
                .isEqualTo(Map.of(
                        "name",
                        "provides",
                        "types",
                        List.of("int"),
                        "required",
                        false,
                        "many",
                        false,
                        "map",
                        true,
                        "reference",
                        false,
                        "entry",
                        "Surface"));
    }

    @Test
    void aFeatureCarriesItsTypeAndItsMultiplicity() {
        assertThat(feature("Project", "applications"))
                .isEqualTo(Map.of(
                        "name",
                        "applications",
                        "types",
                        List.of("Application"),
                        "required",
                        true,
                        "many",
                        true,
                        "map",
                        false,
                        "reference",
                        false));
        assertThat(feature("Process", "startupBudget").get("types")).isEqualTo(List.of("string"));
        assertThat(feature("Process", "cutover").get("types")).isEqualTo(List.of("Cutover"));
        assertThat(feature("DependencyEdge", "required").get("types")).isEqualTo(List.of("boolean"));
        assertThat(feature("HttpProbe", "port").get("types")).isEqualTo(List.of("int"));
        assertThat(feature("Exposure", "contentPolicy").get("required")).isEqualTo(false);
    }

    @Test
    void aNameTheModelLinksIsAReferenceToItsTarget() {
        assertThat(feature("Route", "process"))
                .isEqualTo(Map.of(
                        "name",
                        "process",
                        "types",
                        List.of("Process"),
                        "required",
                        true,
                        "many",
                        false,
                        "map",
                        false,
                        "reference",
                        true));
        assertThat(feature("Scrape", "surface").get("types")).isEqualTo(List.of("Surface"));
        assertThat(feature("Scrape", "surface").get("reference")).isEqualTo(true);
        assertThat(feature("DependencyEdge", "surface").get("reference")).isEqualTo(false);
    }

    @Test
    void aClassWrittenAsOneWordCarriesThatWord() {
        assertThat(named("classes", "NoProbes"))
                .isEqualTo(Map.of("name", "NoProbes", "features", List.of(), "scalar", "none"));
        assertThat(named("classes", "Probes")).doesNotContainKey("scalar");
    }

    @Test
    void aClassifierThatIsNeitherAClassNorAVocabularyIsRefused() {
        EPackage metamodel = EcoreFactory.eINSTANCE.createEPackage();
        EDataType stray = EcoreFactory.eINSTANCE.createEDataType();
        stray.setName("Quantity");
        metamodel.getEClassifiers().add(stray);

        assertThatThrownBy(() -> Descriptor.of(metamodel))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("Quantity is neither a class nor a closed vocabulary");
    }

    @Test
    void aVocabularyCarriesItsLiteralsInOrder() {
        assertThat(named("vocabularies", "AlertClass"))
                .isEqualTo(Map.of("name", "AlertClass", "literals", List.of("business-hours", "urgent", "page")));
    }
}
