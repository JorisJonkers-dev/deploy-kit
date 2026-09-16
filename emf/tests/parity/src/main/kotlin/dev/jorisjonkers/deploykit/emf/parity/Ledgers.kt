package dev.jorisjonkers.deploykit.emf.parity

import java.io.IOException
import java.io.UncheckedIOException
import java.nio.file.Files
import java.nio.file.Path
import kotlin.streams.asSequence

/**
 * The two ledgers the model-driven build holds itself to, checked against the repository they
 * describe. Each check returns every violation it finds, never only the first.
 */
object Ledgers {
    private val REQUIREMENT_ROW = Regex("""^\|\s*(REQ-\d{3})\s*\|.*\[[^]]*]\(\.\./([^)]+)\)\s*\|\s*$""")
    private val WITNESS_ROW = Regex("""^\|\s*(REQ-\d{3})\s*\|\s*`([A-Za-z0-9_]+)#([^`]+)`\s*\|\s*$""")
    private val PENDING_ROW = Regex("""^\|\s*(REQ-\d{3})\s*\|\s*([^|]+?)\s*\|\s*(#\d+)\s*\|\s*$""")
    private val RULE_ROW = Regex("""^\|\s*(EMF-\d{3})\s*\|\s*[^|]+\|\s*`([^`]+)`\s*\|\s*`([^`]+)`\s*\|\s*$""")
    private val STATED = Regex("""holds \*\*(\d+)\*\*""")
    private val STATED_PENDING = Regex("""\*\*(\d+)\*\* pending""")

    /**
     * The witness list: every behaviour ledger row proved by a test under `test/model/` names a JUnit
     * test here, and every witness names a real model row and a real test method.
     *
     * A model row this implementation cannot prove yet is listed as **pending** with the ticket that
     * lands it, the same state the rule ledger already carries for a rule not enforced yet
     * (docs/adr/emf/0114). A pending row satisfies the witness check and nothing else: it still has
     * to name a real model row, it may not also be witnessed, and its count is stated separately, so
     * a behaviour cannot leave the gate quietly.
     */
    fun checkWitnesses(repository: Path): List<String> {
        val errors = mutableListOf<String>()
        val modelRows =
            lines(repository.resolve("docs/requirements.md"))
                .mapNotNull { REQUIREMENT_ROW.matchEntire(it) }
                .filter { it.groupValues[2].startsWith("test/model/") }
                .map { it.groupValues[1] }
                .toSet()
        val text = lines(repository.resolve("emf/docs/witnesses.md"))
        val listed = linkedMapOf<String, String>()
        for (line in text) {
            val row = WITNESS_ROW.matchEntire(line) ?: continue
            val (id, type, method) = row.destructured
            if (listed.put(id, "$type#$method") != null) {
                errors.add("$id: listed twice")
            }
            if (id !in modelRows) {
                errors.add("$id: names no model behaviour row in docs/requirements.md")
            }
            if (!testMethodExists(repository.resolve("emf"), type, method)) {
                errors.add("$id: names $type#$method, which is not a test in emf/")
            }
        }
        val pending = linkedMapOf<String, String>()
        for (line in text) {
            val row = PENDING_ROW.matchEntire(line) ?: continue
            val (id, _, ticket) = row.destructured
            if (pending.put(id, ticket) != null) {
                errors.add("$id: pending twice")
            }
            if (id !in modelRows) {
                errors.add("$id: is pending and names no model behaviour row in docs/requirements.md")
            }
            if (id in listed) {
                errors.add("$id: is both witnessed and pending")
            }
        }
        for (id in modelRows) {
            if (id !in listed && id !in pending) {
                errors.add("$id: is a model behaviour with no witness in emf/docs/witnesses.md")
            }
        }
        checkStatedCount(text, listed.size, "emf/docs/witnesses.md", errors)
        checkStatedPending(text, pending.size, errors)
        return errors
    }

    /**
     * The rule ledger: every row names a file under `emf/` that exists and still contains the witness
     * literal that enforces the rule.
     */
    fun checkRules(repository: Path): List<String> {
        val errors = mutableListOf<String>()
        val emf = repository.resolve("emf")
        val text = lines(emf.resolve("docs/rules.md"))
        val ids = mutableSetOf<String>()
        var rows = 0
        for (line in text) {
            val row = RULE_ROW.matchEntire(line) ?: continue
            rows++
            val (id, named, literal) = row.destructured
            if (!ids.add(id)) {
                errors.add("$id: listed twice")
            }
            val enforcer = emf.resolve(named).normalize()
            if (!enforcer.startsWith(emf) || !Files.isRegularFile(enforcer)) {
                errors.add("$id: names enforcer $named, which is not a file in emf/")
            } else if (!read(enforcer).contains(literal)) {
                errors.add("$id: $named no longer contains `$literal`")
            }
        }
        checkStatedCount(text, rows, "emf/docs/rules.md", errors)
        return errors
    }

    /** The pending count is stated beside the witness count, so neither can drift unnoticed. */
    private fun checkStatedPending(
        text: List<String>,
        rows: Int,
        errors: MutableList<String>,
    ) {
        val stated = STATED_PENDING.find(text.joinToString("\n"))
        if (stated == null) {
            if (rows != 0) {
                errors.add("emf/docs/witnesses.md: states no pending count but holds $rows")
            }
        } else if (stated.groupValues[1] != rows.toString()) {
            errors.add("emf/docs/witnesses.md: states ${stated.groupValues[1]} pending but holds $rows")
        }
    }

    private fun checkStatedCount(
        text: List<String>,
        rows: Int,
        file: String,
        errors: MutableList<String>,
    ) {
        val stated = STATED.find(text.joinToString("\n"))
        if (stated == null) {
            errors.add("$file: states no row count")
        } else if (stated.groupValues[1] != rows.toString()) {
            errors.add("$file: states ${stated.groupValues[1]} rows but holds $rows")
        }
    }

    /**
     * Whether `className` declares `method` as a test somewhere under `emf/`. A witness is a JUnit
     * test in whichever language its module is written, so both tiers are searched and both
     * declarations are read (docs/adr/emf/0114).
     */
    private fun testMethodExists(
        emf: Path,
        className: String,
        method: String,
    ): Boolean =
        Files.walk(emf).use { files ->
            files
                .asSequence()
                .filter { it.toString().contains("src/test/") }
                .filter { it.fileName.toString() in setOf("$className.java", "$className.kt") }
                .any { declaresTest(read(it), method) }
        }

    private fun declaresTest(
        source: String,
        method: String,
    ): Boolean {
        val name = Regex.escape(method)
        return Regex("""\bvoid $name\s*\(""").containsMatchIn(source) ||
            Regex("""\bfun `$name`\s*\(""").containsMatchIn(source)
    }

    private fun lines(file: Path): List<String> = read(file).lines()

    /** A read whose failure is a broken repository, reported rather than declared. */
    private fun read(file: Path): String =
        try {
            Files.readString(file)
        } catch (e: IOException) {
            throw UncheckedIOException(e)
        }
}
