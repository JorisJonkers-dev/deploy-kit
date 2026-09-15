package dev.jorisjonkers.deploykit.emf.cli;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.eclipse.emf.common.util.Enumerator;
import org.eclipse.emf.ecore.EObject;
import org.eclipse.emf.ecore.EStructuralFeature;

/**
 * Reads a parsed model as the JSON value the parity contract compares: every feature named as the
 * authored key it holds, a map entry as an object, an enumeration as its literal, and an optional
 * feature absent when the document left it out. The metamodel is walked reflectively, so a feature
 * added to the {@code .ecore} reaches the intent without a line here.
 */
public final class IntentJson {

    private IntentJson() {}

    /** The JSON value of {@code root}, as a map of authored key to value. */
    public static Map<String, Object> of(EObject root) {
        Map<String, Object> json = new LinkedHashMap<>();
        for (EStructuralFeature feature : root.eClass().getEAllStructuralFeatures()) {
            if (isSet(root, feature)) {
                json.put(feature.getName(), value(root, feature));
            }
        }
        return json;
    }

    /** Whether the document carries {@code feature}: a required feature always, an optional one when set. */
    private static boolean isSet(EObject owner, EStructuralFeature feature) {
        return feature.isRequired() || owner.eIsSet(feature);
    }

    private static Object value(EObject owner, EStructuralFeature feature) {
        Object value = owner.eGet(feature);
        if (feature.isMany()) {
            return many(feature, (List<?>) value);
        }
        return single(value);
    }

    private static Object many(EStructuralFeature feature, List<?> values) {
        if (isMapEntry(feature)) {
            Map<String, Object> entries = new LinkedHashMap<>();
            for (Object value : values) {
                Map.Entry<?, ?> entry = (Map.Entry<?, ?>) value;
                entries.put(String.valueOf(entry.getKey()), single(entry.getValue()));
            }
            return entries;
        }
        List<Object> items = new ArrayList<>();
        for (Object value : values) {
            items.add(single(value));
        }
        return items;
    }

    /** Whether {@code feature} holds map entries, which are written as one object rather than a list. */
    private static boolean isMapEntry(EStructuralFeature feature) {
        return Map.Entry.class.getName().equals(feature.getEType().getInstanceClassName());
    }

    private static Object single(Object value) {
        return switch (value) {
            case EObject child -> of(child);
            case Enumerator literal -> literal.getLiteral();
            default -> value;
        };
    }
}
