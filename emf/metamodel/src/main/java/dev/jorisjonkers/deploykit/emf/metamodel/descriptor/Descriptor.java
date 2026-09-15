package dev.jorisjonkers.deploykit.emf.metamodel.descriptor;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.eclipse.emf.ecore.EAttribute;
import org.eclipse.emf.ecore.EClass;
import org.eclipse.emf.ecore.EClassifier;
import org.eclipse.emf.ecore.EEnum;
import org.eclipse.emf.ecore.EEnumLiteral;
import org.eclipse.emf.ecore.EPackage;
import org.eclipse.emf.ecore.EReference;
import org.eclipse.emf.ecore.EStructuralFeature;

/**
 * The structure of a metamodel, in the shape the parity contract fixes: every class with its
 * features, each feature's types and multiplicity, and every closed vocabulary with its literals
 * (docs/architecture.md#the-parity-contract).
 *
 * <p>The shape is neither Ecore's nor the wire schema's. An abstract class is the union of what can
 * stand in its place, so it is not listed and a feature that points at one names its concrete
 * classes. A map entry is not a class either: the feature that holds the entries is a map.
 */
public final class Descriptor {

    private static final String JSON = "https://jorisjonkers.dev/deploy-kit/json";
    private static final Map<String, String> PRIMITIVES =
            Map.of("java.lang.String", "string", "java.lang.Integer", "int", "java.lang.Boolean", "boolean");

    private Descriptor() {}

    /** The descriptor of {@code metamodel}, as a JSON value. */
    public static Map<String, Object> of(EPackage metamodel) {
        List<Object> classes = new ArrayList<>();
        List<Object> vocabularies = new ArrayList<>();
        for (EClassifier classifier : sorted(metamodel.getEClassifiers())) {
            switch (classifier) {
                case EEnum vocabulary -> vocabularies.add(vocabulary(vocabulary));
                case EClass owner -> {
                    if (isListed(owner)) {
                        classes.add(owner(owner));
                    }
                }
                default ->
                    throw new IllegalArgumentException(
                            classifier.getName() + " is neither a class nor a closed vocabulary");
            }
        }
        return Map.of("classes", classes, "vocabularies", vocabularies);
    }

    private static List<EClassifier> sorted(List<EClassifier> classifiers) {
        return classifiers.stream()
                .sorted(Comparator.comparing(EClassifier::getName))
                .toList();
    }

    /** Whether a class is one the descriptor lists: an abstract class is a union, a map entry a map. */
    private static boolean isListed(EClass owner) {
        return !owner.isAbstract() && !isMapEntry(owner);
    }

    private static boolean isMapEntry(EClassifier classifier) {
        return Map.Entry.class.getName().equals(classifier.getInstanceClassName());
    }

    private static Map<String, Object> vocabulary(EEnum vocabulary) {
        Map<String, Object> json = new LinkedHashMap<>();
        json.put("name", vocabulary.getName());
        // A literal with no spelling is the model's way of saying "unset", which is
        // not a value the language can write and not part of the vocabulary.
        json.put(
                "literals",
                vocabulary.getELiterals().stream()
                        .map(EEnumLiteral::getLiteral)
                        .filter(literal -> !literal.isEmpty())
                        .toList());
        return json;
    }

    private static Map<String, Object> owner(EClass owner) {
        Map<String, Object> json = new LinkedHashMap<>();
        json.put("name", owner.getName());
        json.put(
                "features",
                owner.getEAllStructuralFeatures().stream()
                        .sorted(Comparator.comparing(EStructuralFeature::getName))
                        .map(Descriptor::feature)
                        .toList());
        String scalar = scalar(owner);
        if (scalar != null) {
            json.put("scalar", scalar);
        }
        return json;
    }

    private static String scalar(EClass owner) {
        return owner.getEAnnotation(JSON) == null
                ? null
                : owner.getEAnnotation(JSON).getDetails().get("scalar");
    }

    private static Map<String, Object> feature(EStructuralFeature feature) {
        boolean map = feature instanceof EReference containment
                && containment.isContainment()
                && isMapEntry(containment.getEReferenceType());
        boolean linked = feature instanceof EReference reference && !reference.isContainment();
        Map<String, Object> json = new LinkedHashMap<>();
        json.put("name", feature.getName());
        json.put("types", linked ? List.of(feature.getEType().getName()) : types(feature, map));
        json.put("required", feature.isRequired());
        json.put("many", feature.isMany() && !map);
        json.put("map", map);
        json.put("reference", linked);
        if (map) {
            json.put("entry", feature.getEType().getName());
        }
        return json;
    }

    /** The types a feature admits: a vocabulary, a primitive, a class, or the classes a union stands for. */
    private static List<String> types(EStructuralFeature feature, boolean map) {
        if (map) {
            EClass entry = ((EReference) feature).getEReferenceType();
            return types(entry.getEStructuralFeature("value"), false);
        }
        EClassifier type = feature.getEType();
        if (feature instanceof EAttribute) {
            return List.of(type instanceof EEnum ? type.getName() : PRIMITIVES.get(type.getInstanceClassName()));
        }
        EClass referenced = (EClass) type;
        if (!referenced.isAbstract()) {
            return List.of(referenced.getName());
        }
        return referenced.getEPackage().getEClassifiers().stream()
                .filter(EClass.class::isInstance)
                .map(EClass.class::cast)
                .filter(candidate -> !candidate.isAbstract() && referenced.isSuperTypeOf(candidate))
                .map(EClass::getName)
                .sorted()
                .toList();
    }
}
