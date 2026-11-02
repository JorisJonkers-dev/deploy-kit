package dev.jorisjonkers.deploykit.emf.resolve;

import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.EffectiveProject;
import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.Project;
import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.ProjectIntentPackage;
import java.util.Collections;
import org.eclipse.emf.common.util.URI;
import org.eclipse.m2m.qvt.oml.BasicModelExtent;
import org.eclipse.m2m.qvt.oml.ExecutionContextImpl;
import org.eclipse.m2m.qvt.oml.TransformationExecutor;

/**
 * The lowering, {@code lower.qvto}, run on one Project: Project Intent in, the Effective Intent out
 * (spec/v1/10-project-intent.md#the-effective-intent). The transformation is carried beside this
 * class, so a caller needs no path on the machine that runs it.
 *
 * <p>It is loaded once per JVM, on the first call, and every call after it reuses it with an execution
 * context and model extents of its own: loading is most of what a lowering costs
 * (emf/docs/benchmarks.md). Calls are sequential; nothing in this implementation lowers on two threads.
 */
public final class Lowering {

    private static final String TRANSFORMATION = "/lower.qvto";

    private Lowering() {}

    /** The loaded transformation, made on first use. */
    private static final class Loaded {
        static final TransformationExecutor EXECUTOR = load();

        private static TransformationExecutor load() {
            ProjectIntentPackage.eINSTANCE.getName();
            return new TransformationExecutor(
                    URI.createURI(Lowering.class.getResource(TRANSFORMATION).toString()));
        }
    }

    /** {@code project}, lowered; the source is left as it was. */
    public static EffectiveProject lower(Project project) {
        BasicModelExtent source = new BasicModelExtent(Collections.singletonList(project));
        BasicModelExtent target = new BasicModelExtent();
        Loaded.EXECUTOR.execute(new ExecutionContextImpl(), source, target);
        // Every refusal the lowering depends on fires before it, so a run that writes no Effective
        // Intent is a defect, and it fails here rather than handing on an empty model.
        return (EffectiveProject) target.getContents().get(0);
    }
}
