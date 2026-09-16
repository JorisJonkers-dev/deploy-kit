package dev.jorisjonkers.deploykit.emf.parity

import com.tngtech.archunit.core.domain.JavaClasses
import com.tngtech.archunit.core.importer.ClassFileImporter
import com.tngtech.archunit.core.importer.ImportOption
import com.tngtech.archunit.junit.AnalyzeClasses
import com.tngtech.archunit.junit.ArchTest
import com.tngtech.archunit.lang.ArchRule
import dev.jorisjonkers.deploykit.emf.cli.fixture.UpperReachingDown
import dev.jorisjonkers.deploykit.emf.metamodel.fixture.LowerReachingUp
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test

/**
 * The module direction docs/architecture.md#modules states: a module may depend on the modules above
 * it in that table and on nothing below. A layer with no classes yet is allowed to be empty; the rule
 * holds for it the moment its first class lands.
 *
 * This suite depends on no module, so it reads the class directories the build wrote by path and
 * asserts every module the build wrote arrived: an empty import would leave every layer optional and
 * let both rules pass while proving nothing
 * (docs/adr/emf/0120-parity-crosses-the-cli-file-interface.md). Each rule is shown firing on a
 * fixture that breaks it, beside the run that holds the tree to it.
 */
@AnalyzeClasses(
    locations = [ModuleRules.BuiltModules::class],
    importOptions = [ImportOption.DoNotIncludeTests::class],
)
class ArchitectureTest {
    @ArchTest
    fun `every module the build wrote is imported`(classes: JavaClasses) {
        assertThat(ModuleRules.modulesMissingFrom(classes)).isEmpty()
    }

    @Test
    fun `the direction fails on a module reaching up`() {
        assertThatThrownBy { ModuleRules.layered().check(REACHING_UP) }
            .isInstanceOf(AssertionError::class.java)
            .hasMessageContaining("metamodel")
    }

    @Test
    fun `the cycle rule fails on two modules reaching each other`() {
        assertThatThrownBy { ModuleRules.acyclic().check(REACHING_UP) }
            .isInstanceOf(AssertionError::class.java)
            .hasMessageContaining("Cycle")
    }

    @Test
    fun `the import guard fails on an import holding no module`() {
        assertThat(ModuleRules.modulesMissingFrom(ClassFileImporter().importClasses()))
            .contains("metamodel", "syntax", "cli")
    }

    companion object {
        @ArchTest
        @JvmField
        val MODULES_DEPEND_ONLY_ON_MODULES_ABOVE_THEM: ArchRule = ModuleRules.layered()

        @ArchTest
        @JvmField
        val MODULES_HAVE_NO_CYCLES: ArchRule = ModuleRules.acyclic()

        /** A metamodel class reaching up into cli, and the cli class reaching back down into it. */
        private val REACHING_UP: JavaClasses =
            ClassFileImporter().importClasses(LowerReachingUp::class.java, UpperReachingDown::class.java)
    }
}
