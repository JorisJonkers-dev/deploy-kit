package dev.jorisjonkers.deploykit.emf.cli;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;
import org.eclipse.emf.ecore.EObject;
import org.eclipse.emf.ecore.util.Diagnostician;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;

/**
 * Each stage of the pipeline on its own, in-process, file in and file out: what it writes for every
 * case equals the case's {@code expected/} by content and then by bytes (Stages). A stage's case is
 * read from the working copy, so an edited template, transformation or input is what the next run
 * reads; {@code -Dgolden.update=true} rewrites the EMF-owned goldens instead of comparing.
 */
class StageTest {

    static Stream<Arguments> cases() {
        return Stages.ORDER.stream()
                .flatMap(stage -> Stages.produced(stage).stream().map(name -> Arguments.of(stage, name)));
    }

    @ParameterizedTest(name = "{0} {1}")
    @MethodSource("cases")
    void aStageWritesWhatItsCaseExpects(String stage, String name) throws IOException {
        Map<String, byte[]> written = Stages.run(stage, name);

        if (Stages.updating() && Stages.oracles(name).isEmpty()) {
            Stages.update(Stages.expected(stage, name), written);
            return;
        }
        List<String> differences = Comparison.trees(Stages.expected(stage, name), written);
        assertThat(differences)
                .withFailMessage(
                        "%s %s: %d differences%n%s", stage, name, differences.size(), String.join("\n", differences))
                .isEmpty();
    }

    @Test
    void everyCaseAfterTheFirstStageReadsACaseOfTheStageBefore() {
        for (int i = 1; i < Stages.ORDER.size(); i++) {
            assertThat(Stages.cases(Stages.ORDER.get(i - 1)))
                    .as("the cases of %s, which %s reads", Stages.ORDER.get(i - 1), Stages.ORDER.get(i))
                    .containsAll(Stages.produced(Stages.ORDER.get(i)));
        }
        // A given case is written by hand only to drive the stage after it, and only render's
        // given input, a Resolved Deployment, is one this harness reads by hand.
        assertThat(Stages.ORDER.stream()
                        .flatMap(stage -> Stages.cases(stage).stream()
                                .filter(name -> Stages.given(stage, name))
                                .map(name -> stage + " " + name))
                        .toList())
                .allSatisfy(given -> assertThat(given).startsWith("resolve "))
                .allSatisfy(given -> assertThat(Stages.cases("render")).contains(given.substring(8)));
        assertThat(Stages.cases("parse"))
                .allSatisfy(name -> assertThat(
                                Stages.root().resolve("parse").resolve(name).resolve(Stages.INPUT))
                        .isDirectory());
    }

    /**
     * A given Resolved Deployment is written by hand, so the metamodel holds it to what the resolution
     * would have to write: every feature's bounds, every type.
     */
    @Test
    void aGivenResolvedDeploymentIsAValidModel() throws IOException {
        for (String name : Stages.cases("resolve")) {
            if (!Stages.given("resolve", name)) {
                continue;
            }
            for (String project : Stages.projects(name)) {
                Path model = Stages.expected("resolve", name).resolve(project + Stages.RESOLVED_MODEL);
                for (EObject root : Stages.load(Stages.resources(), model)) {
                    org.eclipse.emf.common.util.Diagnostic diagnostic = Diagnostician.INSTANCE.validate(root);
                    assertThat(diagnostic.getSeverity())
                            .as("%s: %s", model, diagnostic.getChildren())
                            .isLessThan(org.eclipse.emf.common.util.Diagnostic.ERROR);
                }
            }
        }
    }

    /**
     * A render case of copied oracles names every file it expects, and each equals the production
     * implementation's oracle byte for byte, so a copy cannot drift from what it was copied from.
     */
    @Test
    void aCopiedOracleIsTheProductionImplementationsOwnBytes() throws IOException {
        for (String name : Stages.cases("render")) {
            Map<String, String> oracles = Stages.oracles(name);
            if (oracles.isEmpty()) {
                continue;
            }
            Path expected = Stages.expected("render", name);
            assertThat(Comparison.read(expected).keySet())
                    .as("the files render %s expects, each named in its %s", name, Stages.ORACLES)
                    .containsExactlyInAnyOrderElementsOf(oracles.keySet());
            for (Map.Entry<String, String> copy : oracles.entrySet()) {
                assertThat(expected.resolve(copy.getKey()))
                        .as("render %s: %s, a copy of %s", name, copy.getKey(), copy.getValue())
                        .hasSameBinaryContentAs(Examples.of(copy.getValue()));
            }
        }
    }

    @Test
    void aGoldenUpdateNeverWritesTheProductionImplementationsOracles() {
        assertThatThrownBy(() -> Stages.update(Examples.of("minimal/expected"), Map.of()))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("is not an EMF-owned golden");
        assertThat(Examples.of("minimal/expected/intent.json")).exists();
        assertThatThrownBy(() -> Stages.update(Stages.root().resolve("../../../../../../spec/v1/examples"), Map.of()))
                .isInstanceOf(IllegalArgumentException.class);
        assertThat(Files.isDirectory(Examples.of("minimal"))).isTrue();
    }
}
