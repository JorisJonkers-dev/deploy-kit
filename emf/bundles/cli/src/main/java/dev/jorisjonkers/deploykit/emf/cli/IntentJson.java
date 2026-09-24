package dev.jorisjonkers.deploykit.emf.cli;

import dev.jorisjonkers.deploykit.emf.syntax.values.ProjectIntentValueConverters;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.eclipse.emf.common.util.Enumerator;
import org.eclipse.emf.ecore.EAnnotation;
import org.eclipse.emf.ecore.EObject;
import org.eclipse.emf.ecore.EReference;
import org.eclipse.emf.ecore.EStructuralFeature;
import org.eclipse.emf.ecore.util.EcoreUtil;
import org.eclipse.xtext.nodemodel.util.NodeModelUtils;

/**
 * Reads a parsed model as the JSON value the parity contract compares: every feature named as the
 * authored key it holds, a map entry as an object, an enumeration as its literal, and an optional
 * feature absent when the document left it out. A class the metamodel annotates as a scalar is
 * written as that scalar, which is how {@code probes: none} stays the word it was authored as. The
 * metamodel is walked reflectively, so a feature added to the {@code .ecore} reaches the intent
 * without a line here.
 */
public final class IntentJson {

    private IntentJson() {}

    /** The annotation a class carries when the language writes it as one word rather than a block. */
    private static final String JSON = "https://jorisjonkers.dev/deploy-kit/json";

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
        if (feature instanceof EReference reference && !reference.isContainment()) {
            // A reference is written as the name that linked it: the identifier of what it points at, or,
            // where it points into a document that was not read with this one, the name as written.
            if (reference.isMany()) {
                // A list of names, each the one its own position wrote.
                List<Object> names = new ArrayList<>();
                List<?> targets = (List<?>) value;
                for (int index = 0; index < targets.size(); index++) {
                    EObject target = (EObject) targets.get(index);
                    names.add(target.eIsProxy() ? written(owner, reference, index) : EcoreUtil.getID(target));
                }
                return names;
            }
            EObject target = (EObject) value;
            return target.eIsProxy() ? written(owner, reference, 0) : EcoreUtil.getID(target);
        }
        if (feature.isMany()) {
            return many(feature, (List<?>) value);
        }
        return single(value);
    }

    /** The name a document wrote at {@code index} of {@code reference}, without the quotes that are only syntax. */
    private static String written(EObject owner, EReference reference, int index) {
        return ProjectIntentValueConverters.unquote(NodeModelUtils.getTokenText(
                NodeModelUtils.findNodesForFeature(owner, reference).get(index)));
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

    /** The word a class is written as, or {@code null} when it is written as a block. */
    private static String scalar(EObject object) {
        EAnnotation annotation = object.eClass().getEAnnotation(JSON);
        return annotation == null ? null : annotation.getDetails().get("scalar");
    }

    /** Whether {@code feature} holds map entries, which are written as one object rather than a list. */
    private static boolean isMapEntry(EStructuralFeature feature) {
        return Map.Entry.class.getName().equals(feature.getEType().getInstanceClassName());
    }

    private static Object single(Object value) {
        return switch (value) {
            case EObject child -> scalar(child) == null ? of(child) : scalar(child);
            case Enumerator literal -> literal.getLiteral();
            default -> value;
        };
    }
}
