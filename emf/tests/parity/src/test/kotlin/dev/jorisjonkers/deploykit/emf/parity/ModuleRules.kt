package dev.jorisjonkers.deploykit.emf.parity

import com.tngtech.archunit.core.domain.JavaClasses
import com.tngtech.archunit.core.importer.Location
import com.tngtech.archunit.junit.LocationProvider
import com.tngtech.archunit.lang.ArchRule
import com.tngtech.archunit.library.Architectures.layeredArchitecture
import com.tngtech.archunit.library.dependencies.SlicesRuleDefinition.slices
import java.nio.file.Files
import java.nio.file.Path
import kotlin.streams.asSequence

/**
 * The module rules of docs/architecture.md#modules, and the classes they are held over, kept apart
 * from the suite that runs them so the same rule can be run over a fixture that breaks it
 * (docs/adr/architecture/0104-every-enforced-rule-has-an-id-a-row-and-a-fixture.md).
 */
object ModuleRules {
    const val ROOT = "dev.jorisjonkers.deploykit.emf."

    /** The bundle tier, lowest first: a module may depend on the modules above it and on nothing below. */
    val MODULES = listOf("metamodel", "syntax", "resolve", "render", "cli")

    /** EMF-010: a module depends only on the modules above it in the architecture's module table. */
    fun layered(): ArchRule =
        layeredArchitecture()
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
            .whereLayer("cli")
            .mayNotBeAccessedByAnyLayer()
            .whereLayer("render")
            .mayOnlyBeAccessedByLayers("cli")
            .whereLayer("resolve")
            .mayOnlyBeAccessedByLayers("render", "cli")
            .whereLayer("syntax")
            .mayOnlyBeAccessedByLayers("resolve", "render", "cli")
            .whereLayer("metamodel")
            .mayOnlyBeAccessedByLayers("syntax", "resolve", "render", "cli")

    /** EMF-011: no dependency cycle between modules. */
    fun acyclic(): ArchRule = slices().matching(ROOT + "(*)..").should().beFreeOfCycles()

    /**
     * EMF-017: the modules the build wrote classes for that are not in `classes`. The two rules above
     * hold over optional layers, so an import that reached no module would excuse every layer and let
     * both pass while proving nothing. This suite depends on no module, which is exactly how an empty
     * import happens, so the emptiness is the thing that has to fail. A module with no class of its
     * own yet is not missing: its layer is empty in the tree, not in the import.
     */
    fun modulesMissingFrom(classes: JavaClasses): List<String> =
        modulesTheBuildWrote().filter { module ->
            classes.none { it.packageName.startsWith(ROOT + module) }
        }

    /** The modules whose class directory holds a class: what an import of those directories carries. */
    fun modulesTheBuildWrote(): List<String> = MODULES.filter { holdsAClass(classesOf(it)) }

    private fun holdsAClass(directory: Path): Boolean =
        Files.isDirectory(directory) &&
            Files.walk(directory).use { tree ->
                tree.asSequence().any { it.fileName.toString().endsWith(".class") }
            }

    /** Where the build left a module's compiled classes. */
    fun classesOf(module: String): Path = bundles().resolve(module).resolve("target").resolve("classes")

    /** Where the bundle tier's modules sit. */
    fun bundles(): Path = repository().resolve("emf").resolve("bundles")

    /**
     * The class directories the build wrote, by path. The suite requires no module, so nothing puts
     * their classes on its classpath; the reactor's own output is what it reads instead.
     */
    class BuiltModules : LocationProvider {
        override fun get(testClass: Class<*>): Set<Location> = MODULES.map { Location.of(classesOf(it)) }.toSet()
    }
}
