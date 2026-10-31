package dev.jorisjonkers.deploykit.emf.syntax.schema;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Predicate;
import java.util.regex.Pattern;
import java.util.stream.Stream;
import java.util.stream.StreamSupport;
import org.eclipse.emf.ecore.EObject;
import org.eclipse.xtext.AbstractElement;
import org.eclipse.xtext.AbstractRule;
import org.eclipse.xtext.Alternatives;
import org.eclipse.xtext.Assignment;
import org.eclipse.xtext.CompoundElement;
import org.eclipse.xtext.CrossReference;
import org.eclipse.xtext.EnumLiteralDeclaration;
import org.eclipse.xtext.EnumRule;
import org.eclipse.xtext.Grammar;
import org.eclipse.xtext.GrammarUtil;
import org.eclipse.xtext.Group;
import org.eclipse.xtext.Keyword;
import org.eclipse.xtext.ParserRule;
import org.eclipse.xtext.RuleCall;
import org.eclipse.xtext.UnorderedGroup;

/**
 * The shape of an authored file, checked against the grammar's own rules: which keys a mapping may
 * hold, which it must, what each value may be. The grammar is read as data, so the schema is never
 * written twice. Where the parser stops at its first error, this reads the whole file and names every
 * node that is wrong by its JSON pointer, as the schema's refusals do.
 */
public final class Shapes {

    /** One refusal: the pointer to the node, and what is wrong with it. */
    public record Issue(String path, String message) {}

    private record Entry(String key, boolean required, List<AbstractElement> value) {}

    private record Form(String rule, String literal, boolean plain, Map<String, Entry> entries, Entry any) {}

    private record Value(boolean sequence, List<AbstractRule> targets, List<String> literals) {}

    /** An age public key: {@code age1} and 58 more characters of the bech32 alphabet. */
    private static final String AGE_RECIPIENT = "age1[02-9ac-hj-np-z]{58}";

    /** The longest description: one short sentence, not a paragraph. */
    private static final int DESCRIPTION_LENGTH = 160;

    /** A description of one short sentence: neither empty nor a paragraph. */
    private static final Predicate<Yaml.Node> DESCRIBED =
            node -> !node.text.isEmpty() && node.text.length() <= DESCRIPTION_LENGTH;

    /** What a container runs: at least one word, none of them empty. */
    private static final Predicate<Yaml.Node> COMMAND =
            node -> !node.list.isEmpty() && node.list.stream().noneMatch(word -> word.text.isEmpty());

    /** What a container is handed: at least one word, where an empty one is an argument too. */
    private static final Predicate<Yaml.Node> ARGUMENTS = node -> !node.list.isEmpty();

    /**
     * Constraints the grammar cannot say, by the rule and key they hold: a count of at least one, a
     * period in whole units, a description of one short sentence, what a container runs as at least one
     * word, an optional key that is optional, and the age public key an off-cluster copy is encrypted to.
     * Each is a value of its own, written where it is held, so building the table runs no code a test
     * could tell apart from its absence.
     */
    private static final Map<String, Predicate<Yaml.Node>> CONSTRAINTS = Map.ofEntries(
            Map.entry("RateLimit.requests", node -> !node.text.matches("0+")),
            Map.entry("RateLimit.per", node -> Pattern.matches("[1-9][0-9]*(s|m|h)", node.text)),
            Map.entry("Application.description", DESCRIBED),
            Map.entry("Process.description", DESCRIBED),
            Map.entry("Process.command", COMMAND),
            Map.entry("Sidecar.command", COMMAND),
            Map.entry("Process.args", ARGUMENTS),
            Map.entry("Sidecar.args", ARGUMENTS),
            Map.entry("BlockKey.optional", node -> "true".equals(node.text)),
            Map.entry("OffClusterCopy.recipient", node -> Pattern.matches(AGE_RECIPIENT, node.text)));

    private final Grammar grammar;
    private final Map<ParserRule, List<Form>> forms = new HashMap<>();

    private Shapes(Grammar grammar) {
        this.grammar = grammar;
    }

    /** Every refusal in {@code text} against {@code grammar}'s first rule. */
    public static List<Issue> check(String text, Grammar grammar) {
        List<Issue> issues = new ArrayList<>();
        Yaml.Node root;
        try {
            root = Yaml.read(text);
        } catch (Yaml.Unsupported e) {
            issues.add(new Issue("", "outside the YAML subset: " + e.getMessage()));
            return issues;
        } catch (RuntimeException e) {
            return List.of();
        }
        Shapes shapes = new Shapes(grammar);
        ParserRule start = (ParserRule) grammar.getRules().get(0);
        shapes.candidates(root, new Value(false, List.of(start), List.of()), "", issues);
        return issues;
    }

    // ---- forms

    private List<Form> formsOf(ParserRule rule) {
        List<Form> known = forms.get(rule);
        if (known == null) {
            forms.put(rule, List.of());
            known = new ArrayList<>();
            flatten(rule.getAlternatives(), rule, (List<Form>) known);
            forms.put(rule, known);
        }
        return known;
    }

    private void flatten(AbstractElement element, ParserRule rule, List<Form> out) {
        if (element instanceof Alternatives alternatives) {
            alternatives.getElements().forEach(e -> flatten(e, rule, out));
        } else if (element instanceof RuleCall call) {
            out.addAll(formsOf((ParserRule) call.getRule()));
        } else {
            Map<String, Entry> entries = new LinkedHashMap<>();
            walk(element, entries);
            Entry any = entries.isEmpty() ? anyKey(element) : null;
            String literal = entries.isEmpty() && any == null ? firstKeyword(element) : null;
            boolean plain = entries.isEmpty() && any == null && literal == null;
            out.add(new Form(rule.getName(), literal, plain, entries, any));
        }
    }

    /** The keyword a form is made of, when it is one word: {@code 'self'}, {@code 'none'}. */
    private static String firstKeyword(AbstractElement element) {
        return Stream.concat(
                        Stream.of((EObject) element),
                        StreamSupport.stream(((Iterable<EObject>) element::eAllContents).spliterator(), false))
                .filter(Keyword.class::isInstance)
                .map(e -> ((Keyword) e).getValue())
                .findFirst()
                .orElse(null);
    }

    /** {@code key=Text ':' value=Port}: a mapping whose every key is data. */
    private static Entry anyKey(AbstractElement element) {
        if (element instanceof Group group) {
            List<AbstractElement> children = group.getElements();
            for (int i = 1; i < children.size(); i++) {
                if (isColon(children.get(i))) {
                    return new Entry("*", true, children.subList(i + 1, children.size()));
                }
            }
        }
        return null;
    }

    private static boolean isColon(AbstractElement element) {
        return element instanceof Keyword keyword && keyword.getValue().equals(":");
    }

    private static boolean startsKey(List<AbstractElement> children, int i) {
        return children.get(i) instanceof Keyword && i + 1 < children.size() && isColon(children.get(i + 1));
    }

    /**
     * The keys of a form, in the order written. A key is required unless the group it opens is
     * {@code ?}; the grammar never nests an unordered group inside an optional one.
     */
    private void walk(AbstractElement element, Map<String, Entry> entries) {
        if (element instanceof UnorderedGroup group) {
            group.getElements().forEach(child -> walk(child, entries));
        } else if (element instanceof Group group) {
            boolean optional = "?".equals(group.getCardinality());
            List<AbstractElement> children = group.getElements();
            String key = null;
            List<AbstractElement> value = new ArrayList<>();
            for (int i = 0; i < children.size(); i++) {
                AbstractElement child = children.get(i);
                if (startsKey(children, i)) {
                    close(key, optional, value, entries);
                    key = ((Keyword) child).getValue();
                    value = new ArrayList<>();
                    i++;
                } else if (child instanceof UnorderedGroup) {
                    close(key, optional, value, entries);
                    key = null;
                    walk(child, entries);
                } else if (key != null) {
                    value.add(child);
                }
            }
            close(key, optional, value, entries);
        }
    }

    private static void close(String key, boolean optional, List<AbstractElement> value, Map<String, Entry> entries) {
        if (key != null) {
            entries.put(key, new Entry(key, !optional, value));
        }
    }

    // ---- values

    private Value describe(List<AbstractElement> elements) {
        boolean[] dash = {false};
        List<AbstractRule> targets = new ArrayList<>();
        List<String> literals = new ArrayList<>();
        elements.forEach(e -> scan(e, dash, targets, literals, false));
        return new Value(dash[0], targets, literals);
    }

    private void scan(
            AbstractElement element,
            boolean[] dash,
            List<AbstractRule> targets,
            List<String> literals,
            boolean assigned) {
        if (element instanceof Assignment assignment) {
            scan(assignment.getTerminal(), dash, targets, literals, true);
        } else if (element instanceof Keyword keyword) {
            literals.add(keyword.getValue());
        } else if (element instanceof CrossReference) {
            targets.add(textRule());
        } else if (element instanceof RuleCall call) {
            if (assigned) {
                targets.add(call.getRule());
            } else if ("DASH".equals(call.getRule().getName())) {
                dash[0] = true;
            }
        } else {
            ((CompoundElement) element).getElements().forEach(e -> scan(e, dash, targets, literals, assigned));
        }
    }

    private AbstractRule textRule() {
        return GrammarUtil.findRuleForName(grammar, "Text");
    }

    private void value(Yaml.Node node, List<AbstractElement> elements, String path, List<Issue> out) {
        Value value = describe(elements);
        if (value.sequence()) {
            if (!node.isList()) {
                out.add(new Issue(path, "expected a sequence"));
                return;
            }
            for (int i = 0; i < node.list.size(); i++) {
                candidates(node.list.get(i), value, path + "/" + i, out);
            }
        } else {
            candidates(node, value, path, out);
        }
    }

    private static boolean accepts(AbstractRule rule, Yaml.Node node) {
        if (!node.isScalar()) {
            return false;
        }
        if (rule instanceof EnumRule enumeration) {
            return EcoreUtilLiterals.of(enumeration).contains(node.text) && !node.quoted;
        }
        return switch (rule.getName()) {
            case "Port" -> !node.quoted && node.text.matches("[0-9]+");
            case "Bool" -> !node.quoted && (node.text.equals("true") || node.text.equals("false"));
            default -> true;
        };
    }

    private void candidates(Yaml.Node node, Value expected, String path, List<Issue> out) {
        if (node.isScalar() && !node.quoted && expected.literals().contains(node.text)) {
            return;
        }
        List<Form> shapes = new ArrayList<>();
        for (AbstractRule target : expected.targets()) {
            if (target instanceof ParserRule parser && !GrammarUtil.isDatatypeRule(parser)) {
                shapes.addAll(formsOf(parser));
            } else if (accepts(target, node)) {
                return;
            }
        }
        if (node.isScalar()) {
            for (Form form : shapes) {
                if (form.plain() || !node.quoted && node.text.equals(form.literal())) {
                    return;
                }
            }
        } else if (node.isMap()) {
            List<Issue> best = null;
            for (Form form : shapes) {
                if (form.plain() || form.literal() != null) {
                    continue;
                }
                List<Issue> errors = new ArrayList<>();
                mapping(node, form, path, errors);
                if (errors.isEmpty()) {
                    return;
                }
                if (best == null || errors.size() < best.size()) {
                    best = errors;
                }
            }
            if (best != null) {
                out.addAll(best);
                return;
            }
        }
        out.add(new Issue(path, "does not match any shape the schema allows here"));
    }

    private void mapping(Yaml.Node node, Form form, String path, List<Issue> out) {
        for (Map.Entry<String, Yaml.Node> pair : node.map.entrySet()) {
            String child = path + "/" + pointer(pair.getKey());
            Entry entry = form.entries().get(pair.getKey());
            if (entry == null) {
                entry = form.any();
            }
            if (entry == null) {
                out.add(new Issue(child, "unknown field `" + pair.getKey() + "`"));
                continue;
            }
            int before = out.size();
            value(pair.getValue(), entry.value(), child, out);
            Predicate<Yaml.Node> constraint = CONSTRAINTS.get(form.rule() + "." + pair.getKey());
            if (out.size() == before && constraint != null && !constraint.test(pair.getValue())) {
                out.add(new Issue(child, "`" + pair.getKey() + "` is out of range"));
            }
        }
        for (Entry entry : form.entries().values()) {
            if (entry.required() && !node.map.containsKey(entry.key())) {
                out.add(new Issue(
                        path + "/" + pointer(entry.key()), "required field `" + entry.key() + "` is missing"));
            }
        }
    }

    private static String pointer(String key) {
        return key.replace("~", "~0").replace("/", "~1");
    }

    /** The literals of an enum rule. */
    private static final class EcoreUtilLiterals {
        static List<String> of(EnumRule rule) {
            List<String> literals = new ArrayList<>();
            for (java.util.Iterator<EObject> it = rule.eAllContents(); it.hasNext(); ) {
                if (it.next() instanceof EnumLiteralDeclaration declaration) {
                    literals.add(declaration.getLiteral().getValue());
                }
            }
            return literals;
        }
    }
}
