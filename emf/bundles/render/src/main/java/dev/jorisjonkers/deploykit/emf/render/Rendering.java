package dev.jorisjonkers.deploykit.emf.render;

import dev.jorisjonkers.deploykit.emf.metamodel.resolveddeployment.ResolvedDeployment;
import dev.jorisjonkers.deploykit.emf.metamodel.resolveddeployment.ResolvedDeploymentPackage;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Stream;
import org.eclipse.acceleo.Module;
import org.eclipse.acceleo.aql.AcceleoUtil;
import org.eclipse.acceleo.aql.evaluation.AcceleoEvaluator;
import org.eclipse.acceleo.aql.evaluation.strategy.DefaultGenerationStrategy;
import org.eclipse.acceleo.aql.evaluation.strategy.DefaultWriterFactory;
import org.eclipse.acceleo.aql.parser.AcceleoParser;
import org.eclipse.acceleo.aql.parser.ModuleLoader;
import org.eclipse.acceleo.query.runtime.impl.namespace.ClassLoaderQualifiedNameResolver;
import org.eclipse.acceleo.query.runtime.namespace.IQualifiedNameQueryEnvironment;
import org.eclipse.emf.common.util.BasicMonitor;
import org.eclipse.emf.common.util.Diagnostic;
import org.eclipse.emf.common.util.URI;
import org.eclipse.emf.ecore.resource.Resource;
import org.eclipse.emf.ecore.resource.ResourceSet;
import org.eclipse.emf.ecore.resource.impl.ResourceSetImpl;
import org.eclipse.emf.ecore.util.EcoreUtil;
import org.eclipse.emf.ecore.xmi.impl.XMIResourceImpl;

/**
 * The rendering, {@code render.mtl}, run on Resolved Deployments: every Deliverable they carry
 * written under a root, at the path the path plan assigned it (spec/v1/30-deliverables.md). The
 * templates write the files as they stand; nothing formats them afterwards.
 */
public final class Rendering {

    private static final String MODULE = "render";
    private static final String SEPARATOR = "::";
    private static final String NEW_LINE = "\n";
    private static final String MODEL = "rendered.resolveddeployment";

    private Rendering() {}

    /**
     * The Deliverable Sets of {@code deployments}, written under {@code root}. The Deployments are
     * copied, so the caller's models are left as they were. The files are written aside, to {@link
     * #asideOf}, and moved under {@code root} only once every one is written: a template that does not
     * parse or fails to evaluate fails the rendering with what Acceleo said and leaves {@code root} as
     * it was, rather than a partial tree to be read as whole.
     */
    public static void render(List<ResolvedDeployment> deployments, Path root) {
        render(deployments, root, MODULE, aside -> List.of());
    }

    /**
     * {@code deployments} rendered under {@code root} unless {@code refusals} finds something wrong
     * with the files as written aside: then nothing is moved under {@code root}, and what it found is
     * returned.
     */
    public static <T> List<T> render(
            List<ResolvedDeployment> deployments, Path root, Function<Path, List<T>> refusals) {
        return render(deployments, root, MODULE, refusals);
    }

    /** {@code deployments} rendered by the named module: the seam a test drives a broken one through. */
    static void render(List<ResolvedDeployment> deployments, Path root, String module) {
        render(deployments, root, module, aside -> List.of());
    }

    private static <T> List<T> render(
            List<ResolvedDeployment> deployments, Path root, String module, Function<Path, List<T>> refusals) {
        Path aside = asideOf(root);
        try {
            delete(aside);
            try {
                Files.createDirectories(aside);
                generate(deployments, aside, module);
                List<T> refused = refusals.apply(aside);
                if (refused.isEmpty()) {
                    moveUnder(aside, root);
                }
                return refused;
            } finally {
                delete(aside);
            }
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    private static void generate(List<ResolvedDeployment> deployments, Path root, String module) {
        ResourceSet resources = new ResourceSetImpl();
        resources.getPackageRegistry().put(ResolvedDeploymentPackage.eNS_URI, ResolvedDeploymentPackage.eINSTANCE);
        Resource model = new XMIResourceImpl(URI.createURI(MODEL));
        resources.getResources().add(model);
        model.getContents().addAll(EcoreUtil.copyAll(deployments));
        ClassLoaderQualifiedNameResolver resolver = new ClassLoaderQualifiedNameResolver(
                Rendering.class.getClassLoader(), resources.getPackageRegistry(), SEPARATOR);
        IQualifiedNameQueryEnvironment environment =
                AcceleoUtil.newAcceleoQueryEnvironment(Map.of(), resolver, resources, false);
        // A template's parameter type resolves only against the packages its environment knows.
        environment.registerEPackage(ResolvedDeploymentPackage.eINSTANCE);
        AcceleoEvaluator evaluator = new AcceleoEvaluator(environment.getLookupEngine(), NEW_LINE);
        resolver.addLoader(new ModuleLoader(new AcceleoParser(), evaluator));
        // The templates call no Java service, so there is none to clean up after the run.
        AcceleoUtil.generate(
                evaluator,
                environment,
                (Module) resolver.resolve(module),
                model,
                new DefaultGenerationStrategy(resources.getURIConverter(), new DefaultWriterFactory()),
                URI.createFileURI(root.toAbsolutePath() + "/"),
                null,
                new BasicMonitor());
        Diagnostic diagnostic = evaluator.getGenerationResult().getDiagnostic();
        if (diagnostic.getSeverity() != Diagnostic.OK) {
            throw new IllegalStateException("the rendering did not complete: " + diagnostic);
        }
    }

    /** Where a rendering into {@code root} writes before it is whole: beside it, and gone after it. */
    static Path asideOf(Path root) {
        Path absolute = root.toAbsolutePath();
        return absolute.resolveSibling(absolute.getFileName() + ".partial");
    }

    /** Every file under {@code from} moved to the same path under {@code root}, over what is there. */
    private static void moveUnder(Path from, Path root) throws IOException {
        try (Stream<Path> files = Files.walk(from)) {
            for (Path file : files.filter(Files::isRegularFile).toList()) {
                Path target = root.resolve(from.relativize(file).toString());
                Files.createDirectories(target.getParent());
                Files.move(file, target, StandardCopyOption.REPLACE_EXISTING);
            }
        }
    }

    private static void delete(Path directory) throws IOException {
        if (!Files.exists(directory)) {
            return;
        }
        try (Stream<Path> paths = Files.walk(directory)) {
            for (Path path : paths.sorted(Comparator.reverseOrder()).toList()) {
                Files.delete(path);
            }
        }
    }
}
