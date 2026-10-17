package dev.jorisjonkers.deploykit.emf.cli;

import java.util.List;
import java.util.Map;
import org.eclipse.emf.ecore.EObject;
import org.eclipse.emf.ecore.EStructuralFeature;

/**
 * The RFC 6901 JSON Pointer of an object inside its document, read off its containment chain: the
 * name of the feature that holds it, and its index where the feature holds many, or its key where
 * the feature is a map (docs/architecture.md#the-parity-contract). A map entry's value sits at its
 * entry's pointer. The root is the empty pointer.
 */
public final class Pointer {

    private Pointer() {}

    /** The pointer of {@code object} in the document it belongs to. */
    public static String of(EObject object) {
        EObject owner = object.eContainer();
        if (owner == null) {
            return "";
        }
        if (owner instanceof Map.Entry<?, ?>) {
            return of(owner);
        }
        EStructuralFeature feature = object.eContainingFeature();
        String step = escape(feature.getName());
        if (object instanceof Map.Entry<?, ?> entry) {
            step = step + "/" + escape(String.valueOf(entry.getKey()));
        } else if (feature.isMany()) {
            step = step + "/" + ((List<?>) owner.eGet(feature)).indexOf(object);
        }
        return of(owner) + "/" + step;
    }

    /** A feature name as a pointer segment: the two characters a pointer spells differently. */
    private static String escape(String name) {
        return name.replace("~", "~0").replace("/", "~1");
    }
}
