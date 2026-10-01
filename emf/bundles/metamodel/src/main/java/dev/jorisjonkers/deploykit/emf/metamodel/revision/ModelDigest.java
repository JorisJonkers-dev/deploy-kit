package dev.jorisjonkers.deploykit.emf.metamodel.revision;

import dev.jorisjonkers.deploykit.emf.metamodel.json.CanonicalJson;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.eclipse.emf.common.util.Enumerator;
import org.eclipse.emf.ecore.EObject;
import org.eclipse.emf.ecore.EReference;
import org.eclipse.emf.ecore.EStructuralFeature;
import org.eclipse.emf.ecore.util.EcoreUtil;

/**
 * The digest of a pinned input (spec/v1/20-resolved-deployment.md#pinned-inputs): {@code
 * sha256:<hex>} over the canonical JSON of the model read from it, so a change of spelling that
 * reads as the same model does not move it, and any change of what it says does. The model is walked
 * reflectively, like {@link ApplicationRevision}'s element: a set attribute as its value, an
 * enumeration as its literal, a contained object as an object, and a reference as the identifier of
 * what it points at, or its path where the class carries none. A feature nobody set is absent.
 */
public final class ModelDigest {

    private ModelDigest() {}

    /** {@code sha256:<hex>} over the canonical JSON of {@code model}. */
    public static String of(EObject model) {
        return "sha256:"
                + HexFormat.of().formatHex(ApplicationRevision.digest("SHA-256", CanonicalJson.write(json(model))));
    }

    private static Map<String, Object> json(EObject object) {
        Map<String, Object> json = new LinkedHashMap<>();
        for (EStructuralFeature feature : object.eClass().getEAllStructuralFeatures()) {
            if (object.eIsSet(feature)) {
                json.put(feature.getName(), value(object, feature));
            }
        }
        return json;
    }

    private static Object value(EObject owner, EStructuralFeature feature) {
        Object value = owner.eGet(feature);
        if (feature.isMany()) {
            List<Object> items = new ArrayList<>();
            for (Object item : (List<?>) value) {
                items.add(single(feature, item));
            }
            return items;
        }
        return single(feature, value);
    }

    private static Object single(EStructuralFeature feature, Object value) {
        if (feature instanceof EReference reference) {
            EObject target = (EObject) value;
            if (reference.isContainment()) {
                return json(target);
            }
            String id = EcoreUtil.getID(target);
            return id == null ? EcoreUtil.getURI(target).fragment() : id;
        }
        if (value instanceof Enumerator literal) {
            return literal.getLiteral();
        }
        return value;
    }
}
