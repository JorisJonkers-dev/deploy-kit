package dev.jorisjonkers.deploykit.emf.cli;

import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.EffectiveProject;
import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.Project;
import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.ProjectIntentPackage;
import dev.jorisjonkers.deploykit.emf.resolve.Lowering;
import java.util.Collections;
import org.eclipse.emf.common.util.Diagnostic;
import org.eclipse.emf.common.util.URI;
import org.eclipse.m2m.qvt.oml.BasicModelExtent;
import org.eclipse.m2m.qvt.oml.ExecutionContextImpl;
import org.eclipse.m2m.qvt.oml.TransformationExecutor;

/**
 * The shipped QVT-Operational lowering, {@code lower.qvto}, with its transformation loaded once and
 * reused: the benchmark's match for {@link AtlLowering#prepared()} (docs/benchmarks.md). {@link
 * Lowering#lower} loads it again on every call, which is what the pipeline runs.
 */
final class QvtoLowering {

    private final TransformationExecutor executor;

    private QvtoLowering() {
        ProjectIntentPackage.eINSTANCE.getName();
        executor = new TransformationExecutor(
                URI.createURI(Lowering.class.getResource("/lower.qvto").toString()));
        Diagnostic loaded = executor.loadTransformation();
        if (loaded.getSeverity() != Diagnostic.OK) {
            throw new IllegalStateException("lower.qvto does not load: " + loaded);
        }
    }

    /** The lowering with its transformation parsed, compiled and loaded, ready to run. */
    static QvtoLowering prepared() {
        return new QvtoLowering();
    }

    /** {@code project}, lowered; the source is left as it was. */
    EffectiveProject lower(Project project) {
        BasicModelExtent target = new BasicModelExtent();
        Diagnostic run = executor.execute(
                new ExecutionContextImpl(), new BasicModelExtent(Collections.singletonList(project)), target);
        if (run.getSeverity() != Diagnostic.OK || target.getContents().size() != 1) {
            throw new IllegalStateException(project.getProject() + " did not lower: " + run);
        }
        return (EffectiveProject) target.getContents().get(0);
    }
}
