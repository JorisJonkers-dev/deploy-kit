package dev.jorisjonkers.deploykit.emf.parity;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.junit.AnalyzeClasses;
import com.tngtech.archunit.junit.ArchTest;
import com.tngtech.archunit.lang.ArchRule;
import dev.jorisjonkers.deploykit.emf.cli.fixture.UpperReachingDown;
import dev.jorisjonkers.deploykit.emf.metamodel.fixture.LowerReachingUp;
import org.junit.jupiter.api.Test;

/**
 * The module direction docs/architecture.md#modules states: a module may depend on the modules above
 * it in that table and on nothing below. A layer with no classes yet is allowed to be empty; the rule
 * holds for it the moment its first class lands.
 *
 * <p>This suite depends on no module, so it reads the class directories the build wrote by path and
 * asserts every module arrived: an empty import would leave every layer optional and let both rules
 * pass while proving nothing (docs/adr/emf/0120-parity-crosses-the-cli-file-interface.md). Each rule
 * is shown firing on a fixture that breaks it, beside the run that holds the tree to it.
 */
@AnalyzeClasses(locations = ModuleRules.BuiltModules.class, importOptions = ImportOption.DoNotIncludeTests.class)
class ArchitectureTest {

    /** A metamodel class reaching up into cli, and the cli class reaching back down into it. */
    private static final JavaClasses REACHING_UP =
            new ClassFileImporter().importClasses(LowerReachingUp.class, UpperReachingDown.class);

    @ArchTest
    static final ArchRule MODULES_DEPEND_ONLY_ON_MODULES_ABOVE_THEM = ModuleRules.layered();

    @ArchTest
    static final ArchRule MODULES_HAVE_NO_CYCLES = ModuleRules.acyclic();

    @ArchTest
    void everyModuleTheBuildWroteIsImported(JavaClasses classes) {
        assertThat(ModuleRules.modulesMissingFrom(classes)).isEmpty();
    }

    @Test
    void theDirectionFailsOnAModuleReachingUp() {
        assertThatThrownBy(() -> ModuleRules.layered().check(REACHING_UP))
                .isInstanceOf(AssertionError.class)
                .hasMessageContaining("metamodel");
    }

    @Test
    void theCycleRuleFailsOnTwoModulesReachingEachOther() {
        assertThatThrownBy(() -> ModuleRules.acyclic().check(REACHING_UP))
                .isInstanceOf(AssertionError.class)
                .hasMessageContaining("Cycle");
    }

    @Test
    void theImportGuardFailsOnAnImportHoldingNoModule() {
        assertThat(ModuleRules.modulesMissingFrom(new ClassFileImporter().importClasses()))
                .contains("metamodel", "syntax", "cli");
    }
}
