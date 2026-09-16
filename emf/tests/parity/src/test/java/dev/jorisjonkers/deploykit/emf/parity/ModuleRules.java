package dev.jorisjonkers.deploykit.emf.parity;

import static com.tngtech.archunit.library.Architectures.layeredArchitecture;
import static com.tngtech.archunit.library.dependencies.SlicesRuleDefinition.slices;

import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.importer.Location;
import com.tngtech.archunit.junit.LocationProvider;
import com.tngtech.archunit.lang.ArchRule;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.stream.Stream;

/**
 * The module rules of docs/architecture.md#modules, and the classes they are held over, kept apart
 * from the suite that runs them so the same rule can be run over a fixture that breaks it
 * (docs/adr/architecture/0104-every-enforced-rule-has-an-id-a-row-and-a-fixture.md).
 */
final class ModuleRules {

    static final String ROOT = "dev.jorisjonkers.deploykit.emf.";

    /** The bundle tier, lowest first: a module may depend on the modules above it and on nothing below. */
    static final List<String> MODULES = List.of("metamodel", "syntax", "resolve", "render", "cli");

    private ModuleRules() {}

    /** EMF-010: a module depends only on the modules above it in the architecture's module table. */
    static ArchRule layered() {
        return layeredArchitecture()
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
                .mayOnlyBeAccessedByLayers("syntax", "resolve", "render", "cli");
    }

    /** EMF-011: no dependency cycle between modules. */
    static ArchRule acyclic() {
        return slices().matching(ROOT + "(*)..").should().beFreeOfCycles();
    }

    /**
     * EMF-017: the modules the build wrote classes for that are not in {@code classes}. The two rules
     * above hold over optional layers, so an import that reached no module would excuse every layer
     * and let both pass while proving nothing. This suite depends on no module, which is exactly how
     * an empty import happens, so the emptiness is the thing that has to fail. A module with no
     * class of its own yet is not missing: its layer is empty in the tree, not in the import.
     */
    static List<String> modulesMissingFrom(JavaClasses classes) {
        return modulesTheBuildWrote().stream()
                .filter(module -> classes.stream()
                        .noneMatch(imported -> imported.getPackageName().startsWith(ROOT + module)))
                .toList();
    }

    /** The modules whose class directory holds a class: what an import of those directories carries. */
    static List<String> modulesTheBuildWrote() {
        return MODULES.stream().filter(module -> holdsAClass(classesOf(module))).toList();
    }

    private static boolean holdsAClass(Path directory) {
        if (!Files.isDirectory(directory)) {
            return false;
        }
        try (Stream<Path> tree = Files.walk(directory)) {
            return tree.anyMatch(path -> path.getFileName().toString().endsWith(".class"));
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    /**
     * The class directories the build wrote, by path. The suite requires no module, so nothing puts
     * their classes on its classpath; the reactor's own output is what it reads instead.
     */
    static final class BuiltModules implements LocationProvider {

        @Override
        public Set<Location> get(Class<?> testClass) {
            Set<Location> locations = new LinkedHashSet<>();
            for (String module : MODULES) {
                locations.add(Location.of(classesOf(module)));
            }
            return locations;
        }
    }

    /** Where the build left a module's compiled classes. */
    static Path classesOf(String module) {
        return bundles().resolve(module).resolve("target").resolve("classes");
    }

    /** Where the bundle tier's modules sit, found from this suite's own working directory. */
    static Path bundles() {
        Path dir = Path.of("").toAbsolutePath();
        while (!Files.isRegularFile(dir.resolve("emf/pom.xml"))) {
            dir = dir.getParent();
        }
        return dir.resolve("emf").resolve("bundles");
    }
}
