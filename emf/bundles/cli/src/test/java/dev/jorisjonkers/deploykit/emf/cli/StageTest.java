package dev.jorisjonkers.deploykit.emf.cli;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.IOException;
import java.nio.file.Files;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;
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
                .flatMap(stage -> Stages.cases(stage).stream().map(name -> Arguments.of(stage, name)));
    }

    @ParameterizedTest(name = "{0} {1}")
    @MethodSource("cases")
    void aStageWritesWhatItsCaseExpects(String stage, String name) throws IOException {
        Map<String, byte[]> written = Stages.run(stage, name);

        if (Stages.updating()) {
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
                    .containsAll(Stages.cases(Stages.ORDER.get(i)));
        }
        assertThat(Stages.cases("parse"))
                .allSatisfy(name -> assertThat(
                                Stages.root().resolve("parse").resolve(name).resolve(Stages.INPUT))
                        .isDirectory());
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
