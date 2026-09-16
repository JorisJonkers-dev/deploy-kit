package dev.jorisjonkers.deploykit.emf.cli;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.entry;

import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.HttpProbe;
import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.Lifecycle;
import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.Match;
import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.Placement;
import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.Probes;
import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.Process;
import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.ProjectIntentFactory;
import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.Route;
import java.util.Map;
import org.junit.jupiter.api.Test;

/** What the intent of a parsed model holds: the authored keys, and nothing the document left out. */
class IntentJsonTest {

    private static final ProjectIntentFactory MODEL = ProjectIntentFactory.eINSTANCE;

    private static Process process() {
        Process process = MODEL.createProcess();
        process.setName("notes-api");
        process.setLifecycle(Lifecycle.APPLICATION);
        process.setImage("notes-api");
        Placement placement = MODEL.createPlacement();
        placement.setMemory("256Mi");
        placement.setCpu("50m");
        process.setPlacement(placement);
        return process;
    }

    @Test
    void aRequiredFeatureIsWrittenEvenWhenItHoldsItsDefault() {
        Map<String, Object> intent = IntentJson.of(process());

        assertThat(intent).contains(entry("name", "notes-api"), entry("image", "notes-api"));
        assertThat(intent).containsKey("cutover");
    }

    @Test
    void anEnumerationIsWrittenAsItsLiteral() {
        assertThat(IntentJson.of(process())).contains(entry("lifecycle", "application"));
    }

    @Test
    void anOptionalFeatureTheDocumentLeftOutIsAbsent() {
        assertThat(IntentJson.of(process())).doesNotContainKeys("startupBudget", "probes", "provides");
    }

    @Test
    void anOptionalFeatureTheDocumentSetIsWritten() {
        Process process = process();
        process.setStartupBudget("20s");
        Probes probes = MODEL.createProbes();
        HttpProbe readiness = MODEL.createHttpProbe();
        readiness.setPath("/healthz/ready");
        readiness.setPort(8080);
        probes.setReadiness(readiness);
        process.setProbes(probes);

        assertThat(IntentJson.of(process()))
                .doesNotContainKey("startupBudget"); // the sample above is a different object
        assertThat(IntentJson.of(process))
                .contains(
                        entry("startupBudget", "20s"),
                        entry("probes", Map.of("readiness", Map.of("path", "/healthz/ready", "port", 8080))));
    }

    @Test
    void aReferenceIsWrittenAsTheNameItLinked() {
        Process process = process();
        process.getProvides().put("http", 8080);
        Route route = MODEL.createRoute();
        route.setPath("/");
        route.setMatch(Match.PREFIX);
        route.setProcess(process);
        route.setSurface(process.getProvides().get(0));

        assertThat(IntentJson.of(route))
                .contains(entry("process", "notes-api"), entry("surface", "http"), entry("match", "prefix"));
    }

    @Test
    void aMapEntryIsWrittenAsAnObjectAndAListAsAList() {
        Process process = process();
        process.getProvides().put("http", 8080);

        assertThat(IntentJson.of(process())).doesNotContainKey("provides");
        assertThat(IntentJson.of(process())).doesNotContainKey("applications");
        assertThat(IntentJson.of(process)).contains(entry("provides", Map.of("http", 8080)));
    }
}
