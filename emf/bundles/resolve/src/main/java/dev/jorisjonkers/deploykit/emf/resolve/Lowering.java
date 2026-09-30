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
 */
public final class Lowering {

    private static final String TRANSFORMATION = "/lower.qvto";

    private Lowering() {}

    /** {@code project}, lowered; the source is left as it was. */
    public static EffectiveProject lower(Project project) {
        ProjectIntentPackage.eINSTANCE.getName();
        BasicModelExtent source = new BasicModelExtent(Collections.singletonList(project));
        BasicModelExtent target = new BasicModelExtent();
        new TransformationExecutor(
                        URI.createURI(Lowering.class.getResource(TRANSFORMATION).toString()))
                .execute(new ExecutionContextImpl(), source, target);
        // Every refusal the lowering depends on fires before it, so a run that writes no Effective
        // Intent is a defect, and it fails here rather than handing on an empty model.
        return (EffectiveProject) target.getContents().get(0);
    }
}
