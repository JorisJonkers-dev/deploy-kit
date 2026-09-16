package dev.jorisjonkers.deploykit.emf.parity

import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.io.TempDir
import java.io.UncheckedIOException
import java.nio.file.Files
import java.nio.file.Path

class LedgersTest {
    /** The committed ledgers, checked against this repository. */
    @Test
    fun `the committed ledgers hold`() {
        val repository = repository()

        assertThat(Ledgers.checkWitnesses(repository)).isEmpty()
        assertThat(Ledgers.checkRules(repository)).isEmpty()
    }

    @Test
    fun `a model behaviour without a witness fails`(
        @TempDir root: Path,
    ) {
        write(root, "docs/requirements.md", "$MODEL_ROW\n$GATE_ROW")
        write(root, "emf/docs/witnesses.md", "This list holds **0** witnesses.\n")

        assertThat(Ledgers.checkWitnesses(root))
            .containsExactly("$MODEL: is a model behaviour with no witness in emf/docs/witnesses.md")
    }

    @Test
    fun `a witness must name a model row and a real test once`(
        @TempDir root: Path,
    ) {
        write(root, "docs/requirements.md", "$MODEL_ROW\n$GATE_ROW")
        write(root, "emf/tests/parity/src/test/kotlin/x/ParseTest.kt", "class ParseTest { fun `parses`() {} }")
        write(root, "emf/tests/parity/src/main/kotlin/x/ParseTest.kt", "class ParseTest { fun `missing`() {} }")
        write(
            root,
            "emf/docs/witnesses.md",
            listOf(
                "This list holds **4** witnesses.",
                "| $MODEL | `ParseTest#parses` |",
                "| $MODEL | `ParseTest#parses` |",
                "| $GATE | `ParseTest#parses` |",
                "| $UNKNOWN | `ParseTest#missing` |",
            ).joinToString("\n"),
        )

        assertThat(Ledgers.checkWitnesses(root))
            .containsExactly(
                "$MODEL: listed twice",
                "$GATE: names no model behaviour row in docs/requirements.md",
                "$UNKNOWN: names no model behaviour row in docs/requirements.md",
                "$UNKNOWN: names ParseTest#missing, which is not a test in emf/",
                "emf/docs/witnesses.md: states 4 rows but holds 3",
            )
    }

    @Test
    fun `a model behaviour listed as pending needs no witness`(
        @TempDir root: Path,
    ) {
        write(root, "docs/requirements.md", "$MODEL_ROW\n$GATE_ROW")
        write(
            root,
            "emf/docs/witnesses.md",
            listOf(
                "This list holds **0** witnesses, and **1** pending.",
                "| $MODEL | nothing here reads it yet | #87 |",
            ).joinToString("\n"),
        )

        assertThat(Ledgers.checkWitnesses(root)).isEmpty()
    }

    @Test
    fun `a row that is both witnessed and pending fails`(
        @TempDir root: Path,
    ) {
        write(root, "docs/requirements.md", MODEL_ROW)
        write(root, "emf/tests/parity/src/test/kotlin/x/ParseTest.kt", "class ParseTest { fun `parses`() {} }")
        write(
            root,
            "emf/docs/witnesses.md",
            listOf(
                "This list holds **1** witnesses, and **1** pending.",
                "| $MODEL | `ParseTest#parses` |",
                "| $MODEL | also pending | #87 |",
            ).joinToString("\n"),
        )

        assertThat(Ledgers.checkWitnesses(root)).containsExactly("$MODEL: is both witnessed and pending")
    }

    @Test
    fun `a row pending twice fails`(
        @TempDir root: Path,
    ) {
        write(root, "docs/requirements.md", MODEL_ROW)
        write(
            root,
            "emf/docs/witnesses.md",
            listOf(
                // One pending id, listed twice: the count is of ids, the way the
                // witness count is, so the duplicate is the only complaint.
                "This list holds **0** witnesses, and **1** pending.",
                "| $MODEL | not yet | #87 |",
                "| $MODEL | still not yet | #87 |",
            ).joinToString("\n"),
        )

        assertThat(Ledgers.checkWitnesses(root)).containsExactly("$MODEL: pending twice")
    }

    @Test
    fun `a pending row naming no model row fails, and the real row stays owed`(
        @TempDir root: Path,
    ) {
        write(root, "docs/requirements.md", MODEL_ROW)
        write(
            root,
            "emf/docs/witnesses.md",
            listOf(
                "This list holds **0** witnesses, and **1** pending.",
                "| $UNKNOWN | not a model row | #87 |",
            ).joinToString("\n"),
        )

        assertThat(Ledgers.checkWitnesses(root))
            .containsExactly(
                "$UNKNOWN: is pending and names no model behaviour row in docs/requirements.md",
                "$MODEL: is a model behaviour with no witness in emf/docs/witnesses.md",
            )
    }

    @Test
    fun `a pending count that drifts fails`(
        @TempDir root: Path,
    ) {
        write(root, "docs/requirements.md", MODEL_ROW)
        write(
            root,
            "emf/docs/witnesses.md",
            listOf(
                "This list holds **0** witnesses, and **2** pending.",
                "| $MODEL | not yet | #87 |",
            ).joinToString("\n"),
        )

        assertThat(Ledgers.checkWitnesses(root))
            .containsExactly("emf/docs/witnesses.md: states 2 pending but holds 1")
    }

    @Test
    fun `a pending row with no stated pending count fails`(
        @TempDir root: Path,
    ) {
        write(root, "docs/requirements.md", MODEL_ROW)
        write(
            root,
            "emf/docs/witnesses.md",
            "This list holds **0** witnesses.\n| $MODEL | not yet | #87 |",
        )

        assertThat(Ledgers.checkWitnesses(root))
            .containsExactly("emf/docs/witnesses.md: states no pending count but holds 1")
    }

    /** A Java witness is read the same way, so the rule is the module's language and not the suite's. */
    @Test
    fun `a witness naming a java test in a bundle is found`(
        @TempDir root: Path,
    ) {
        write(root, "docs/requirements.md", MODEL_ROW)
        write(root, "emf/bundles/cli/src/test/java/x/ParseTest.java", "class ParseTest { void parses() {} }")
        write(
            root,
            "emf/docs/witnesses.md",
            "This list holds **1** witnesses.\n| $MODEL | `ParseTest#parses` |",
        )

        assertThat(Ledgers.checkWitnesses(root)).isEmpty()
    }

    @Test
    fun `a witness list stating no count fails`(
        @TempDir root: Path,
    ) {
        write(root, "docs/requirements.md", GATE_ROW)
        write(root, "emf/docs/witnesses.md", "No count here.\n")

        assertThat(Ledgers.checkWitnesses(root)).containsExactly("emf/docs/witnesses.md: states no row count")
    }

    @Test
    fun `a rule whose enforcer no longer holds its witness fails`(
        @TempDir root: Path,
    ) {
        write(root, "emf/pom.xml", "<arg>-Werror</arg>")
        write(
            root,
            "emf/docs/rules.md",
            listOf(
                "This ledger holds **4** rules.",
                "| EMF-001 | warnings fail | `pom.xml` | `<arg>-Werror</arg>` |",
                "| EMF-001 | lint all | `pom.xml` | `<arg>-Xlint:all</arg>` |",
                "| EMF-003 | outside | `../docs/rules.md` | `rules` |",
                "| EMF-004 | missing | `gone.xml` | `x` |",
            ).joinToString("\n"),
        )

        assertThat(Ledgers.checkRules(root))
            .containsExactly(
                "EMF-001: listed twice",
                "EMF-001: pom.xml no longer contains `<arg>-Xlint:all</arg>`",
                "EMF-003: names enforcer ../docs/rules.md, which is not a file in emf/",
                "EMF-004: names enforcer gone.xml, which is not a file in emf/",
            )
    }

    @Test
    fun `a rule ledger whose count drifts fails`(
        @TempDir root: Path,
    ) {
        write(root, "emf/pom.xml", "<arg>-Werror</arg>")
        write(
            root,
            "emf/docs/rules.md",
            "This ledger holds **2** rules.\n| EMF-001 | warnings fail | `pom.xml` | `-Werror` |",
        )

        assertThat(Ledgers.checkRules(root)).containsExactly("emf/docs/rules.md: states 2 rows but holds 1")
    }

    @Test
    fun `a stated count too large for an int is reported not thrown`(
        @TempDir root: Path,
    ) {
        write(root, "docs/requirements.md", GATE_ROW)
        write(root, "emf/docs/witnesses.md", "This list holds **99999999999** witnesses.\n")

        assertThat(Ledgers.checkWitnesses(root))
            .containsExactly("emf/docs/witnesses.md: states 99999999999 rows but holds 0")
    }

    @Test
    fun `a ledger that cannot be read fails loudly`(
        @TempDir root: Path,
    ) {
        assertThatThrownBy { Ledgers.checkRules(root) }.isInstanceOf(UncheckedIOException::class.java)
        assertThatThrownBy { Ledgers.checkWitnesses(root) }.isInstanceOf(UncheckedIOException::class.java)
    }

    companion object {
        // Fixture ids are assembled so the root requirements lint, which reads every tracked file for
        // behaviour ledger citations, does not mistake them for citations of rows that do not exist.
        private const val MODEL = "REQ-" + "020"
        private const val GATE = "REQ-" + "001"
        private const val UNKNOWN = "REQ-" + "099"

        private const val MODEL_ROW =
            "| $MODEL | parses a project | [test/model/parse.test.ts](../test/model/parse.test.ts) |"
        private const val GATE_ROW =
            "| $GATE | lints ADRs | [test/adr-contract.test.ts](../test/adr-contract.test.ts) |"

        private fun write(
            root: Path,
            relative: String,
            content: String,
        ) {
            val file = root.resolve(relative)
            Files.createDirectories(file.parent)
            Files.writeString(file, content)
        }
    }
}
