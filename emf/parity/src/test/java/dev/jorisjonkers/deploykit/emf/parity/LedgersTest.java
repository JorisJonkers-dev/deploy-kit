package dev.jorisjonkers.deploykit.emf.parity;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class LedgersTest {

    // Fixture ids are assembled so the root requirements lint, which reads every tracked file for
    // behaviour ledger citations, does not mistake them for citations of rows that do not exist.
    private static final String MODEL = "REQ-" + "020";
    private static final String GATE = "REQ-" + "001";
    private static final String UNKNOWN = "REQ-" + "099";

    private static final String MODEL_ROW =
            "| " + MODEL + " | parses a project | [test/model/parse.test.ts](../test/model/parse.test.ts) |";
    private static final String GATE_ROW =
            "| " + GATE + " | lints ADRs | [test/adr-contract.test.ts](../test/adr-contract.test.ts) |";

    /** The committed ledgers, checked against this repository. */
    @Test
    void theCommittedLedgersHold() {
        Path repository = repository();

        assertThat(Ledgers.checkWitnesses(repository)).isEmpty();
        assertThat(Ledgers.checkRules(repository)).isEmpty();
    }

    @Test
    void aModelBehaviourWithoutAWitnessFails(@TempDir Path root) throws IOException {
        write(root, "docs/requirements.md", MODEL_ROW + "\n" + GATE_ROW);
        write(root, "emf/docs/witnesses.md", "This list holds **0** witnesses.\n");

        assertThat(Ledgers.checkWitnesses(root))
                .containsExactly(MODEL + ": is a model behaviour with no witness in emf/docs/witnesses.md");
    }

    @Test
    void aWitnessMustNameAModelRowAndARealTestOnce(@TempDir Path root) throws IOException {
        write(root, "docs/requirements.md", MODEL_ROW + "\n" + GATE_ROW);
        write(root, "emf/parity/src/test/java/x/ParseTest.java", "class ParseTest { void parses() {} }");
        write(root, "emf/parity/src/main/java/x/ParseTest.java", "class ParseTest { void missing() {} }");
        write(
                root,
                "emf/docs/witnesses.md",
                String.join(
                        "\n",
                        "This list holds **4** witnesses.",
                        "| " + MODEL + " | `ParseTest#parses` |",
                        "| " + MODEL + " | `ParseTest#parses` |",
                        "| " + GATE + " | `ParseTest#parses` |",
                        "| " + UNKNOWN + " | `ParseTest#missing` |"));

        assertThat(Ledgers.checkWitnesses(root))
                .containsExactly(
                        MODEL + ": listed twice",
                        GATE + ": names no model behaviour row in docs/requirements.md",
                        UNKNOWN + ": names no model behaviour row in docs/requirements.md",
                        UNKNOWN + ": names ParseTest#missing, which is not a test in emf/",
                        "emf/docs/witnesses.md: states 4 rows but holds 3");
    }

    @Test
    void aWitnessListStatingNoCountFails(@TempDir Path root) throws IOException {
        write(root, "docs/requirements.md", GATE_ROW);
        write(root, "emf/docs/witnesses.md", "No count here.\n");

        assertThat(Ledgers.checkWitnesses(root)).containsExactly("emf/docs/witnesses.md: states no row count");
    }

    @Test
    void aRuleWhoseEnforcerNoLongerHoldsItsWitnessFails(@TempDir Path root) throws IOException {
        write(root, "emf/pom.xml", "<arg>-Werror</arg>");
        write(
                root,
                "emf/docs/rules.md",
                String.join(
                        "\n",
                        "This ledger holds **4** rules.",
                        "| EMF-001 | warnings fail | `pom.xml` | `<arg>-Werror</arg>` |",
                        "| EMF-001 | lint all | `pom.xml` | `<arg>-Xlint:all</arg>` |",
                        "| EMF-003 | outside | `../docs/rules.md` | `rules` |",
                        "| EMF-004 | missing | `gone.xml` | `x` |"));

        assertThat(Ledgers.checkRules(root))
                .containsExactly(
                        "EMF-001: listed twice",
                        "EMF-001: pom.xml no longer contains `<arg>-Xlint:all</arg>`",
                        "EMF-003: names enforcer ../docs/rules.md, which is not a file in emf/",
                        "EMF-004: names enforcer gone.xml, which is not a file in emf/");
    }

    @Test
    void aRuleLedgerWhoseCountDriftsFails(@TempDir Path root) throws IOException {
        write(root, "emf/pom.xml", "<arg>-Werror</arg>");
        write(
                root,
                "emf/docs/rules.md",
                "This ledger holds **2** rules.\n| EMF-001 | warnings fail | `pom.xml` | `-Werror` |");

        assertThat(Ledgers.checkRules(root)).containsExactly("emf/docs/rules.md: states 2 rows but holds 1");
    }

    @Test
    void aStatedCountTooLargeForAnIntIsReportedNotThrown(@TempDir Path root) throws IOException {
        write(root, "docs/requirements.md", GATE_ROW);
        write(root, "emf/docs/witnesses.md", "This list holds **99999999999** witnesses.\n");

        assertThat(Ledgers.checkWitnesses(root))
                .containsExactly("emf/docs/witnesses.md: states 99999999999 rows but holds 0");
    }

    @Test
    void aLedgerThatCannotBeReadFailsLoudly(@TempDir Path root) {
        assertThatThrownBy(() -> Ledgers.checkRules(root)).isInstanceOf(UncheckedIOException.class);
        assertThatThrownBy(() -> Ledgers.checkWitnesses(root)).isInstanceOf(UncheckedIOException.class);
    }

    private static void write(Path root, String relative, String content) throws IOException {
        Path file = root.resolve(relative);
        Files.createDirectories(file.getParent());
        Files.writeString(file, content);
    }

    private static Path repository() {
        Path dir = Path.of("").toAbsolutePath();
        while (!Files.isRegularFile(dir.resolve("emf/pom.xml"))) {
            dir = dir.getParent();
        }
        return dir;
    }
}
