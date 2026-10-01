package dev.jorisjonkers.deploykit.emf.resolve;

import dev.jorisjonkers.deploykit.emf.metamodel.revision.ModelDigest;
import org.eclipse.emf.ecore.EObject;
import org.eclipse.m2m.qvt.oml.blackbox.java.Operation;
import org.eclipse.m2m.qvt.oml.blackbox.java.Operation.Kind;

/**
 * The one black box {@code resolution.qvto} calls: a digest is a function of canonical bytes, and OCL
 * has no way to produce bytes, let alone hash them. Everything else the resolution derives, it
 * derives in the language.
 */
public class Hashing {

    /** The unit {@code resolution.qvto} imports this module as. */
    public static final String UNIT = "dev.jorisjonkers.deploykit.emf.hashing";

    /** The executor instantiates a module itself, through a public constructor, or refuses the unit. */
    public Hashing() {}

    /** The digest of a pinned input's model, or of any object, over its canonical JSON. */
    @Operation(contextual = true, kind = Kind.QUERY)
    public static String digestOf(EObject model) {
        return ModelDigest.of(model);
    }

    /**
     * The digest of a text, over its canonical JSON: a string as a JSON string, so an Asset's
     * content-hashed name is the one the production implementation gives it.
     */
    @Operation(contextual = true, kind = Kind.QUERY)
    public static String textDigestOf(String text) {
        return ModelDigest.ofText(text);
    }

    /** The digest of a text exactly as written: its UTF-8 bytes, for a JSON text already canonical. */
    @Operation(contextual = true, kind = Kind.QUERY)
    public static String rawDigestOf(String text) {
        return ModelDigest.ofBytes(text);
    }
}
