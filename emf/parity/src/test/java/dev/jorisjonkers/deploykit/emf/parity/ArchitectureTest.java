package dev.jorisjonkers.deploykit.emf.parity;

import static com.tngtech.archunit.library.Architectures.layeredArchitecture;
import static com.tngtech.archunit.library.dependencies.SlicesRuleDefinition.slices;

import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.junit.AnalyzeClasses;
import com.tngtech.archunit.junit.ArchTest;
import com.tngtech.archunit.lang.ArchRule;

/**
 * The module direction docs/architecture.md#modules states: a module may depend on the modules above
 * it in that table and on nothing below. A layer with no classes yet is allowed to be empty; the rule
 * holds for it the moment its first class lands.
 */
@AnalyzeClasses(packages = "dev.jorisjonkers.deploykit.emf", importOptions = ImportOption.DoNotIncludeTests.class)
class ArchitectureTest {

    private static final String ROOT = "dev.jorisjonkers.deploykit.emf.";

    @ArchTest
    static final ArchRule MODULES_DEPEND_ONLY_ON_MODULES_ABOVE_THEM = layeredArchitecture()
            .consideringOnlyDependenciesInLayers()
            .withOptionalLayers(true)
            .layer("metamodel")
            .definedBy(ROOT + "metamodel..")
            .layer("syntax")
            .definedBy(ROOT + "syntax..")
            .layer("resolve")
            .definedBy(ROOT + "resolve..")
            .layer("render")
            .definedBy(ROOT + "render..")
            .layer("cli")
            .definedBy(ROOT + "cli..")
            .layer("parity")
            .definedBy(ROOT + "parity..")
            .whereLayer("parity")
            .mayNotBeAccessedByAnyLayer()
            .whereLayer("cli")
            .mayOnlyBeAccessedByLayers("parity")
            .whereLayer("render")
            .mayOnlyBeAccessedByLayers("cli", "parity")
            .whereLayer("resolve")
            .mayOnlyBeAccessedByLayers("render", "cli", "parity")
            .whereLayer("syntax")
            .mayOnlyBeAccessedByLayers("resolve", "render", "cli", "parity")
            .whereLayer("metamodel")
            .mayOnlyBeAccessedByLayers("syntax", "resolve", "render", "cli", "parity");

    @ArchTest
    static final ArchRule MODULES_HAVE_NO_CYCLES =
            slices().matching(ROOT + "(*)..").should().beFreeOfCycles();
}
