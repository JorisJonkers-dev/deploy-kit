package dev.jorisjonkers.deploykit.emf.cli;

import dev.jorisjonkers.deploykit.emf.metamodel.resolveddeployment.ResolvedDeployment;
import dev.jorisjonkers.deploykit.emf.resolve.Resolution;
import java.util.ArrayList;
import java.util.List;
import org.eclipse.emf.common.util.Diagnostic;
import org.eclipse.emf.common.util.URI;
import org.eclipse.emf.ecore.EObject;
import org.eclipse.m2m.qvt.oml.BasicModelExtent;
import org.eclipse.m2m.qvt.oml.ExecutionContextImpl;
import org.eclipse.m2m.qvt.oml.TransformationExecutor;

/**
 * The shipped resolution, {@code resolution.qvto}, with its transformation loaded once and reused, so
 * the benchmark times its execution apart from its loading (docs/benchmarks.md#method), and can load
 * it again on its own to time the load.
 */
final class QvtoResolution {

    private final TransformationExecutor executor;

    private QvtoResolution(List<EObject> intent, List<EObject> pinned, String project) {
        // The shipped entry point registers the blackbox the transformation imports, which a load needs.
        Resolution.resolve(intent, pinned, project, Outputs.INTEGRITY);
        executor = load();
    }

    /** {@code resolution.qvto} parsed, compiled and loaded: what {@link Resolution#resolve} does on its first call. */
    static TransformationExecutor load() {
        TransformationExecutor executor = new TransformationExecutor(
                URI.createURI(Resolution.class.getResource("/resolution.qvto").toString()));
        Diagnostic loaded = executor.loadTransformation();
        if (loaded.getSeverity() != Diagnostic.OK) {
            throw new IllegalStateException("resolution.qvto does not load: " + loaded);
        }
        return executor;
    }

    /** The resolution loaded once, after one shipped run over {@code intent} has registered its blackbox. */
    static QvtoResolution prepared(List<EObject> intent, List<EObject> pinned, String project) {
        return new QvtoResolution(intent, pinned, project);
    }

    /** {@code project} of {@code intent}, resolved against {@code pinned}, as {@link Resolution#resolve} resolves it. */
    ResolvedDeployment resolve(List<EObject> intent, List<EObject> pinned, String project) {
        ExecutionContextImpl context = new ExecutionContextImpl();
        context.setConfigProperty("project", project);
        context.setConfigProperty("integrity", Outputs.INTEGRITY);
        BasicModelExtent target = new BasicModelExtent();
        Diagnostic run = executor.execute(
                context,
                new BasicModelExtent(new ArrayList<>(intent)),
                new BasicModelExtent(new ArrayList<>(pinned)),
                target);
        if (run.getSeverity() != Diagnostic.OK || target.getContents().isEmpty()) {
            throw new IllegalStateException(project + " did not resolve: " + run);
        }
        return (ResolvedDeployment) target.getContents().get(0);
    }
}
