package dev.jorisjonkers.deploykit.emf.cli;

import java.util.List;
import org.eclipse.emf.ecore.EObject;

/**
 * A set of documents read together as the resolution reads them, before any project is lowered: the
 * authored Projects with their env files and the Platform document, and the pinned inputs, or the
 * diagnostics that refused the set. A refused set holds no document.
 */
public record Authored(List<EObject> intent, List<EObject> pinned, List<Diagnostic> diagnostics) {

    public Authored {
        intent = List.copyOf(intent);
        pinned = List.copyOf(pinned);
        diagnostics = List.copyOf(diagnostics);
    }

    public static Authored of(List<EObject> intent, List<EObject> pinned) {
        return new Authored(intent, pinned, List.of());
    }

    public static Authored refused(List<Diagnostic> diagnostics) {
        return new Authored(List.of(), List.of(), diagnostics);
    }

    public boolean ok() {
        return diagnostics.isEmpty();
    }
}
