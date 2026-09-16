package dev.jorisjonkers.deploykit.emf.parity

import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.w3c.dom.Element
import java.nio.file.Files
import java.nio.file.Path
import javax.xml.parsers.DocumentBuilderFactory

/**
 * The target platform resolves from one dated build of a simultaneous release, and names every unit
 * at an exact version, so a clean runner cache resolves the same bundles as the last green build
 * (docs/adr/emf/0108).
 */
class TargetPlatformTest {
    @Test
    fun `every unit is pinned`() {
        assertThat(problems(repository().resolve("emf/emf.target"))).`as`(EVERY_UNIT_IS_PINNED).isEmpty()
    }

    @Test
    fun `an unpinned unit or an undated repository is a problem`() {
        val target = Files.createTempFile("emf", ".target")
        Files.writeString(
            target,
            """
            <target><locations><location type="InstallableUnit">
              <repository location="https://download.eclipse.org/releases/latest/"/>
              <unit id="a" version="1.2.3.v2026"/>
              <unit id="b" version="0.0.0"/>
              <unit id="c" version="[1.0.0,2.0.0)"/>
            </location></locations></target>
            """.trimIndent(),
        )

        assertThat(problems(target))
            .containsExactly(
                "repository https://download.eclipse.org/releases/latest/ is not a dated release build",
                "unit b is not pinned: 0.0.0",
                "unit c is not pinned: [1.0.0,2.0.0)",
            )
    }

    companion object {
        const val EVERY_UNIT_IS_PINNED = "every unit names an exact version from one dated repository"

        private val DATED_RELEASE = Regex("""https://download\.eclipse\.org/releases/\d{4}-\d{2}/\d{12}/""")
        private val EXACT_VERSION = Regex("""\d+\.\d+\.\d+(\.[\w-]+)?""")

        private fun problems(target: Path): List<String> {
            val root =
                DocumentBuilderFactory
                    .newInstance()
                    .newDocumentBuilder()
                    .parse(target.toFile())
                    .documentElement
            val problems = mutableListOf<String>()
            val repositories = root.getElementsByTagName("repository")
            for (i in 0 until repositories.length) {
                val location = (repositories.item(i) as Element).getAttribute("location")
                if (!DATED_RELEASE.matches(location)) {
                    problems.add("repository $location is not a dated release build")
                }
            }
            val units = root.getElementsByTagName("unit")
            for (i in 0 until units.length) {
                val unit = units.item(i) as Element
                val version = unit.getAttribute("version")
                if (!EXACT_VERSION.matches(version) || version == "0.0.0") {
                    problems.add("unit ${unit.getAttribute("id")} is not pinned: $version")
                }
            }
            return problems
        }
    }
}
