package dev.jorisjonkers.deploykit.emf.cli;

import dev.jorisjonkers.deploykit.emf.metamodel.resolveddeployment.ResolvedDeployment;
import java.util.List;
import org.eclipse.emf.ecore.EObject;

/**
 * The outcome of resolving one project of a set: its Resolved Deployment and the two extents it was
 * resolved from, or the diagnostics that refused the set before resolution ran. A refused set has
 * no deployment and no extents.
 */
public record Resolved(
        ResolvedDeployment deployment, List<EObject> intent, List<EObject> pinned, List<Diagnostic> diagnostics) {

    public Resolved {
        intent = List.copyOf(intent);
        pinned = List.copyOf(pinned);
        diagnostics = List.copyOf(diagnostics);
    }

    public static Resolved of(ResolvedDeployment deployment, List<EObject> intent, List<EObject> pinned) {
        return new Resolved(deployment, intent, pinned, List.of());
    }

    public static Resolved refused(List<Diagnostic> diagnostics) {
        return new Resolved(null, List.of(), List.of(), diagnostics);
    }

    public boolean ok() {
        return diagnostics.isEmpty();
    }
}
