package dev.jorisjonkers.deploykit.emf.render;

import dev.jorisjonkers.deploykit.emf.metamodel.resolveddeployment.ResolvedDeployment;
import dev.jorisjonkers.deploykit.emf.metamodel.resolveddeployment.ResolvedDeploymentPackage;
import java.nio.file.Path;
import java.util.Map;
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

/**
 * The rendering, {@code render.mtl}, run on one Resolved Deployment: every Deliverable it carries
 * written under a root, at the path the path plan assigned it (spec/v1/30-deliverables.md). The
 * templates write the files as they stand; nothing formats them afterwards.
 */
public final class Rendering {

    private static final String MODULE = "render";
    private static final String SEPARATOR = "::";
    private static final String NEW_LINE = "\n";

    private Rendering() {}

    /**
     * {@code deployment}'s Deliverable Set, written under {@code root}. A template that does not parse
     * or fails to evaluate fails the rendering with what Acceleo said, rather than leaving a partial
     * tree to be read as whole.
     */
    public static void render(ResolvedDeployment deployment, Path root) {
        render(deployment, root, MODULE);
    }

    /** {@code deployment} rendered by the named module: the seam a test drives a broken one through. */
    static void render(ResolvedDeployment deployment, Path root, String module) {
        Resource model = deployment.eResource();
        ResourceSet resources = model.getResourceSet();
        resources.getPackageRegistry().put(ResolvedDeploymentPackage.eNS_URI, ResolvedDeploymentPackage.eINSTANCE);
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
}
