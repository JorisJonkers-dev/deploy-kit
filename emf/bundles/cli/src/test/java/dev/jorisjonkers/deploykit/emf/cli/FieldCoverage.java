package dev.jorisjonkers.deploykit.emf.cli;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import dev.jorisjonkers.deploykit.emf.metamodel.pinnedinputs.PinnedInputsPackage;
import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.ProjectIntentPackage;
import dev.jorisjonkers.deploykit.emf.metamodel.resolveddeployment.ResolvedDeploymentPackage;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.Deque;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Iterator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.eclipse.emf.common.util.Enumerator;
import org.eclipse.emf.ecore.EAttribute;
import org.eclipse.emf.ecore.EClass;
import org.eclipse.emf.ecore.EClassifier;
import org.eclipse.emf.ecore.EEnum;
import org.eclipse.emf.ecore.EEnumLiteral;
import org.eclipse.emf.ecore.EObject;
import org.eclipse.emf.ecore.EPackage;
import org.eclipse.emf.ecore.EReference;
import org.eclipse.emf.ecore.EStructuralFeature;
import org.eclipse.emf.ecore.util.EcoreUtil;
import org.yaml.snakeyaml.LoaderOptions;
import org.yaml.snakeyaml.Yaml;
import org.yaml.snakeyaml.constructor.SafeConstructor;

/**
 * What the stage cases never exercise, one line per gap, each a sentence naming what is missing:
 * {@code ResolvedProcess.servingLabel is never set by a resolve case}. A stage's gaps are every
 * feature of every concrete class its documents can hold that no case's input sets, every enum
 * literal none uses, and the same of what {@code lower} and {@code resolve} write; for {@code parse},
 * every property path of the two intent schemas no input carries; for {@code render}, every type
 * {@code render.mtl} dispatches on that no input instantiates. FieldCoverageTest holds the gaps to a
 * committed baseline that may only shrink.
 */
final class FieldCoverage {

    /** The three metamodels a stage's documents are instances of. */
    static final List<EPackage> PACKAGES =
            List.of(ProjectIntentPackage.eINSTANCE, PinnedInputsPackage.eINSTANCE, ResolvedDeploymentPackage.eINSTANCE);

    private static final ObjectMapper JSON = new ObjectMapper();

    /** A template the polymorphic dispatch of {@code render.mtl} chooses by the Deliverable's type. */
    private static final Pattern DISPATCH =
            Pattern.compile("\\[template private (?:objects|json)\\(d : resolveddeployment::(\\w+)\\)\\]");

    private FieldCoverage() {}

    // ------------------------------------------------------------------------------------ stages

    /** Every gap of {@code stage} over its committed cases, sorted. */
    static List<String> gaps(String stage) throws IOException {
        TreeSet<String> gaps = new TreeSet<>();
        List<String> cases = Stages.cases(stage);
        switch (stage) {
            case "parse" -> {
                List<EObject> input = models(cases, "parse", Stages.INTENT_MODEL, "parse", Stages.PINNED_MODEL);
                Set<EClass> classes = containable(intentRoots(true));
                String phrase = "in a parse case's input";
                gaps.addAll(features(classes, input, phrase));
                gaps.addAll(literals(classes, input, phrase));
                Path schemas = Examples.repository().resolve("spec/v1/schemas");
                gaps.addAll(schemaPaths(
                        schemas.resolve("project-intent.schema.json"), authored(cases, true), "a parse case's input"));
                gaps.addAll(schemaPaths(
                        schemas.resolve("platform-intent.schema.json"),
                        authored(cases, false),
                        "a parse case's input"));
            }
            case "lower" -> {
                List<EObject> input = models(cases, "parse", Stages.INTENT_MODEL);
                Set<EClass> inputs = containable(List.of(ProjectIntentPackage.eINSTANCE.getProject()));
                gaps.addAll(features(inputs, input, "in a lower case's input"));
                gaps.addAll(literals(inputs, input, "in a lower case's input"));
                List<EObject> output = models(cases, "lower", Stages.EFFECTIVE_MODEL);
                Set<EClass> outputs = containable(List.of(ProjectIntentPackage.eINSTANCE.getEffectiveProject()));
                gaps.addAll(features(outputs, output, "by a lower case"));
                gaps.addAll(literals(outputs, output, "by a lower case"));
            }
            case "resolve" -> {
                List<EObject> input = models(
                        cases,
                        "parse",
                        Stages.INTENT_MODEL,
                        "parse",
                        Stages.PINNED_MODEL,
                        "lower",
                        Stages.EFFECTIVE_MODEL);
                Set<EClass> inputs = containable(intentRoots(false));
                gaps.addAll(features(inputs, input, "in a resolve case's input"));
                gaps.addAll(literals(inputs, input, "in a resolve case's input"));
                List<EObject> output = deployments(cases);
                Set<EClass> outputs = containable(List.of(ResolvedDeploymentPackage.eINSTANCE.getResolvedDeployment()));
                gaps.addAll(features(outputs, output, "by a resolve case"));
                gaps.addAll(literals(outputs, output, "by a resolve case"));
            }
            case "render" -> {
                List<EObject> input = deployments(cases);
                Set<EClass> inputs = containable(List.of(ResolvedDeploymentPackage.eINSTANCE.getResolvedDeployment()));
                gaps.addAll(features(inputs, input, "in a render case's input"));
                gaps.addAll(literals(inputs, input, "in a render case's input"));
                gaps.addAll(dispatch(
                        Examples.repository().resolve("emf/bundles/render/model/render.mtl"),
                        input,
                        "in a render case's input"));
            }
            default -> throw new IllegalArgumentException("no stage " + stage);
        }
        return List.copyOf(gaps);
    }

    /**
     * The classes a document of the intent and pinned metamodels opens on: every concrete class no
     * containment holds. The Effective Intent is what the lowering writes, so an authored set holds
     * none of it.
     */
    private static List<EClass> intentRoots(boolean authored) {
        Set<EClass> contained = new HashSet<>();
        List<EClass> classes = new ArrayList<>();
        for (EPackage metamodel : List.of(ProjectIntentPackage.eINSTANCE, PinnedInputsPackage.eINSTANCE)) {
            for (EClassifier classifier : metamodel.getEClassifiers()) {
                if (classifier instanceof EClass type) {
                    classes.add(type);
                    for (EReference reference : type.getEAllContainments()) {
                        contained.addAll(concrete(reference.getEReferenceType()));
                    }
                }
            }
        }
        return classes.stream()
                .filter(type -> !type.isAbstract() && !type.isInterface() && !contained.contains(type))
                .filter(type -> !authored || type != ProjectIntentPackage.eINSTANCE.getEffectiveProject())
                .toList();
    }

    /** The roots of {@code file} of every case, read in pairs of (stage, file), each case in one resource set. */
    private static List<EObject> models(List<String> cases, String... stagesAndFiles) {
        List<EObject> roots = new ArrayList<>();
        for (String name : cases) {
            var resources = Stages.resources();
            for (int i = 0; i < stagesAndFiles.length; i += 2) {
                roots.addAll(Stages.load(
                        resources, Stages.expected(stagesAndFiles[i], name).resolve(stagesAndFiles[i + 1])));
            }
        }
        return roots;
    }

    /** Every Resolved Deployment the resolve cases of {@code cases} wrote. */
    private static List<EObject> deployments(List<String> cases) throws IOException {
        List<EObject> roots = new ArrayList<>();
        for (String name : cases) {
            for (String project : Stages.projects(name)) {
                roots.addAll(Stages.load(
                        Stages.resources(), Stages.expected("resolve", name).resolve(project + Stages.RESOLVED_MODEL)));
            }
        }
        return roots;
    }

    /** The authored documents of the parse cases, read as YAML: the project files, or the Platform documents. */
    private static List<Object> authored(List<String> cases, boolean projects) throws IOException {
        List<Object> documents = new ArrayList<>();
        for (String name : cases) {
            for (Path document : Stages.documents(
                    Stages.root().resolve("parse").resolve(name).resolve(Stages.INPUT))) {
                String file = document.getFileName().toString();
                if (projects ? file.endsWith(".project.yml") : file.equals("platform.intent.yml")) {
                    documents.add(new Yaml(new SafeConstructor(new LoaderOptions())).load(Files.readString(document)));
                }
            }
        }
        return documents;
    }

    // ------------------------------------------------------------------------------- metamodels

    /** The concrete classes a document opening on one of {@code roots} can hold, the roots among them. */
    static Set<EClass> containable(Collection<EClass> roots) {
        Set<EClass> reached = new LinkedHashSet<>();
        Deque<EClass> next = new ArrayDeque<>(roots);
        while (!next.isEmpty()) {
            EClass type = next.pop();
            if (reached.add(type)) {
                for (EReference reference : type.getEAllContainments()) {
                    next.addAll(concrete(reference.getEReferenceType()));
                }
            }
        }
        return reached;
    }

    /** {@code type} and every class of the three metamodels below it, the concrete ones only. */
    private static List<EClass> concrete(EClass type) {
        Set<EClass> found = new LinkedHashSet<>();
        if (!type.isAbstract() && !type.isInterface()) {
            found.add(type);
        }
        for (EPackage metamodel : PACKAGES) {
            for (EClassifier classifier : metamodel.getEClassifiers()) {
                if (classifier instanceof EClass candidate
                        && !candidate.isAbstract()
                        && !candidate.isInterface()
                        && type.isSuperTypeOf(candidate)) {
                    found.add(candidate);
                }
            }
        }
        return List.copyOf(found);
    }

    /** Whether a feature is one a document carries: neither derived, nor transient, nor the way back to a container. */
    private static boolean carried(EStructuralFeature feature) {
        return !feature.isDerived()
                && !feature.isTransient()
                && !(feature instanceof EReference reference && reference.isContainer());
    }

    /**
     * Every class of {@code classes} no object of {@code models} is an instance of, and every feature
     * of every class none of its instances sets. A required single value is set wherever its object is.
     */
    static List<String> features(Set<EClass> classes, Collection<EObject> models, String phrase) {
        Map<EClass, List<EObject>> instances = instances(models);
        List<String> gaps = new ArrayList<>();
        for (EClass type : sorted(classes)) {
            List<EObject> objects = instances.getOrDefault(type, List.of());
            if (objects.isEmpty()) {
                gaps.add(type.getName() + " is never instantiated " + phrase);
            }
            for (EStructuralFeature feature : type.getEAllStructuralFeatures()) {
                if (carried(feature)
                        && objects.stream()
                                .noneMatch(object ->
                                        object.eIsSet(feature) || (feature.isRequired() && !feature.isMany()))) {
                    gaps.add(type.getName() + "." + feature.getName() + " is never set " + phrase);
                }
            }
        }
        return gaps;
    }

    /** Every literal of every enum a feature of {@code classes} is typed by that no object of {@code models} holds. */
    static List<String> literals(Set<EClass> classes, Collection<EObject> models, String phrase) {
        Set<EEnum> enums = new LinkedHashSet<>();
        for (EClass type : classes) {
            for (EAttribute attribute : type.getEAllAttributes()) {
                if (carried(attribute) && attribute.getEAttributeType() instanceof EEnum vocabulary) {
                    enums.add(vocabulary);
                }
            }
        }
        Set<String> used = new HashSet<>();
        for (Iterator<EObject> all = EcoreUtil.getAllContents(models, false); all.hasNext(); ) {
            EObject object = all.next();
            for (EAttribute attribute : object.eClass().getEAllAttributes()) {
                if (attribute.getEAttributeType() instanceof EEnum vocabulary
                        && (object.eIsSet(attribute) || attribute.isRequired())) {
                    for (Object value : values(object, attribute)) {
                        used.add(vocabulary.getName() + "." + ((Enumerator) value).getName());
                    }
                }
            }
        }
        List<String> gaps = new ArrayList<>();
        for (EEnum vocabulary :
                enums.stream().sorted(Comparator.comparing(EEnum::getName)).toList()) {
            for (EEnumLiteral literal : vocabulary.getELiterals()) {
                String name = vocabulary.getName() + "." + literal.getName();
                if (!used.contains(name)) {
                    gaps.add(name + " is never used " + phrase);
                }
            }
        }
        return gaps;
    }

    /** Every type a template of {@code mtl} dispatches on that no object of {@code models} is an instance of. */
    static List<String> dispatch(Path mtl, Collection<EObject> models, String phrase) throws IOException {
        Set<String> instantiated = new HashSet<>();
        for (Iterator<EObject> all = EcoreUtil.getAllContents(models, false); all.hasNext(); ) {
            EClass type = all.next().eClass();
            instantiated.add(type.getName());
            type.getEAllSuperTypes().forEach(supertype -> instantiated.add(supertype.getName()));
        }
        TreeSet<String> gaps = new TreeSet<>();
        Matcher templates = DISPATCH.matcher(Files.readString(mtl));
        while (templates.find()) {
            if (!instantiated.contains(templates.group(1))) {
                gaps.add(templates.group(1) + " is never instantiated " + phrase + " (render.mtl dispatches on it)");
            }
        }
        return List.copyOf(gaps);
    }

    private static Map<EClass, List<EObject>> instances(Collection<EObject> models) {
        Map<EClass, List<EObject>> instances = new HashMap<>();
        for (Iterator<EObject> all = EcoreUtil.getAllContents(models, false); all.hasNext(); ) {
            EObject object = all.next();
            instances
                    .computeIfAbsent(object.eClass(), type -> new ArrayList<>())
                    .add(object);
        }
        return instances;
    }

    private static List<?> values(EObject object, EStructuralFeature feature) {
        Object value = object.eGet(feature);
        return feature.isMany() ? (List<?>) value : value == null ? List.of() : List.of(value);
    }

    private static List<EClass> sorted(Set<EClass> classes) {
        return classes.stream().sorted(Comparator.comparing(EClass::getName)).toList();
    }

    // ---------------------------------------------------------------------------------- schemas

    /** Every property path of the JSON schema at {@code schema} that none of {@code documents} carries. */
    static List<String> schemaPaths(Path schema, List<Object> documents, String where) {
        JsonNode root;
        try {
            root = JSON.readTree(schema.toFile());
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
        Set<String> declared = new TreeSet<>();
        declared(root, root, "", declared, new HashSet<>());
        Set<String> present = new HashSet<>();
        for (Object document : documents) {
            present(root, root, document, "", present, new HashSet<>());
        }
        String name = schema.getFileName().toString();
        return declared.stream()
                .filter(path -> !present.contains(path))
                .map(path -> name + " " + path + " is never present in " + where)
                .toList();
    }

    /** Every property path below {@code node}: a property by its name, a map's value as {@code *}, an item as {@code []}. */
    private static void declared(JsonNode root, JsonNode node, String at, Set<String> paths, Set<String> following) {
        if (node.has("$ref")) {
            String ref = node.get("$ref").asText();
            if (following.add(ref)) {
                declared(root, target(root, ref), at, paths, following);
                following.remove(ref);
            }
        }
        for (String combinator : List.of("anyOf", "oneOf", "allOf")) {
            for (JsonNode branch : node.path(combinator)) {
                declared(root, branch, at, paths, following);
            }
        }
        for (Map.Entry<String, JsonNode> property : node.path("properties").properties()) {
            String path = at + "/" + property.getKey();
            paths.add(path);
            declared(root, property.getValue(), path, paths, following);
        }
        if (node.path("additionalProperties").isObject()) {
            String path = at + "/*";
            paths.add(path);
            declared(root, node.get("additionalProperties"), path, paths, following);
        }
        if (node.path("items").isObject()) {
            declared(root, node.get("items"), at + "[]", paths, following);
        }
    }

    /** Every property path of {@code node} that {@code value} carries, in the notation {@link #declared} writes. */
    private static void present(
            JsonNode root, JsonNode node, Object value, String at, Set<String> paths, Set<String> following) {
        if (node.has("$ref")) {
            String ref = node.get("$ref").asText();
            if (following.add(ref)) {
                present(root, target(root, ref), value, at, paths, following);
                following.remove(ref);
            }
        }
        for (String combinator : List.of("anyOf", "oneOf", "allOf")) {
            for (JsonNode branch : node.path(combinator)) {
                present(root, branch, value, at, paths, following);
            }
        }
        if (value instanceof Map<?, ?> map) {
            for (Map.Entry<?, ?> entry : map.entrySet()) {
                String key = String.valueOf(entry.getKey());
                JsonNode property = node.path("properties").path(key);
                if (property.isObject()) {
                    paths.add(at + "/" + key);
                    present(root, property, entry.getValue(), at + "/" + key, paths, new HashSet<>());
                } else if (node.path("additionalProperties").isObject()) {
                    paths.add(at + "/*");
                    present(
                            root,
                            node.get("additionalProperties"),
                            entry.getValue(),
                            at + "/*",
                            paths,
                            new HashSet<>());
                }
            }
        }
        if (value instanceof List<?> list && node.path("items").isObject()) {
            for (Object item : list) {
                present(root, node.get("items"), item, at + "[]", paths, new HashSet<>());
            }
        }
    }

    private static JsonNode target(JsonNode root, String ref) {
        return root.at(ref.substring(1));
    }
}
