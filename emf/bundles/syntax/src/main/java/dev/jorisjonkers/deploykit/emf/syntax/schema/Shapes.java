package dev.jorisjonkers.deploykit.emf.syntax.schema;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Predicate;
import java.util.regex.Pattern;
import org.eclipse.emf.ecore.EObject;
import org.eclipse.xtext.AbstractElement;
import org.eclipse.xtext.AbstractRule;
import org.eclipse.xtext.Alternatives;
import org.eclipse.xtext.Assignment;
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

    /** Scalar constraints the grammar cannot say: a count of at least one, a period in whole units. */
    private static final Map<String, Predicate<String>> CONSTRAINTS = Map.of(
            "RateLimit.requests", text -> !text.matches("0+"),
            "RateLimit.per", text -> Pattern.matches("[1-9][0-9]*(s|m|h)", text));

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
        } else if (element instanceof RuleCall call
                && call.getRule() instanceof ParserRule called
                && !GrammarUtil.isDatatypeRule(called)) {
            out.addAll(formsOf(called));
        } else {
            Map<String, Entry> entries = new LinkedHashMap<>();
            walk(element, false, entries);
            Entry any = entries.isEmpty() ? anyKey(element) : null;
            Keyword keyword = null;
            if (entries.isEmpty() && any == null) {
                keyword = firstKeyword(element);
            }
            boolean plain = entries.isEmpty() && any == null && keyword == null;
            out.add(new Form(rule.getName(), keyword == null ? null : keyword.getValue(), plain, entries, any));
        }
    }

    private static Keyword firstKeyword(AbstractElement element) {
        if (element instanceof Keyword k) {
            return k;
        }
        if (element instanceof Group group) {
            for (AbstractElement child : group.getElements()) {
                Keyword k = firstKeyword(child);
                if (k != null) {
                    return k;
                }
            }
        }
        return null;
    }

    /** {@code key=Text ':' value=Port}: a mapping whose every key is data. */
    private static Entry anyKey(AbstractElement element) {
        if (element instanceof Group group) {
            List<AbstractElement> children = group.getElements();
            for (int i = 1; i < children.size(); i++) {
                if (children.get(i) instanceof Keyword colon
                        && colon.getValue().equals(":")
                        && children.get(i - 1) instanceof Assignment) {
                    return new Entry("*", true, children.subList(i + 1, children.size()));
                }
            }
        }
        return null;
    }

    private static boolean startsKey(List<AbstractElement> children, int i) {
        return children.get(i) instanceof Keyword k
                && !k.getValue().equals(":")
                && i + 1 < children.size()
                && children.get(i + 1) instanceof Keyword colon
                && colon.getValue().equals(":");
    }

    private static boolean holdsKeys(AbstractElement element) {
        if (element instanceof UnorderedGroup) {
            return true;
        }
        if (element instanceof Group group) {
            List<AbstractElement> children = group.getElements();
            for (int i = 0; i < children.size(); i++) {
                if (startsKey(children, i) || holdsKeys(children.get(i)) && !(children.get(i) instanceof Alternatives)) {
                    return true;
                }
            }
        }
        return false;
    }

    private void walk(AbstractElement element, boolean optional, Map<String, Entry> entries) {
        if (element instanceof UnorderedGroup group) {
            boolean here = optional || "?".equals(group.getCardinality());
            group.getElements().forEach(child -> walk(child, here, entries));
        } else if (element instanceof Group group) {
            boolean here = optional || "?".equals(group.getCardinality());
            List<AbstractElement> children = group.getElements();
            String key = null;
            List<AbstractElement> value = new ArrayList<>();
            for (int i = 0; i < children.size(); i++) {
                AbstractElement child = children.get(i);
                if (startsKey(children, i)) {
                    close(key, here, value, entries);
                    key = ((Keyword) child).getValue();
                    value = new ArrayList<>();
                    i++;
                } else if (key != null && holdsKeys(child)) {
                    close(key, here, value, entries);
                    key = null;
                    walk(child, here, entries);
                } else if (key != null) {
                    value.add(child);
                } else if (holdsKeys(child)) {
                    walk(child, here, entries);
                }
            }
            close(key, here, value, entries);
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
            AbstractElement element, boolean[] dash, List<AbstractRule> targets, List<String> literals, boolean assigned) {
        if (element instanceof Assignment assignment) {
            scan(assignment.getTerminal(), dash, targets, literals, true);
        } else if (element instanceof Keyword keyword) {
            if (assigned) {
                literals.add(keyword.getValue());
            }
        } else if (element instanceof CrossReference) {
            targets.add(textRule());
        } else if (element instanceof RuleCall call) {
            if (assigned) {
                targets.add(call.getRule());
            } else if ("DASH".equals(call.getRule().getName())) {
                dash[0] = true;
            }
        } else if (element instanceof Group group) {
            group.getElements().forEach(e -> scan(e, dash, targets, literals, assigned));
        } else if (element instanceof Alternatives alternatives) {
            alternatives.getElements().forEach(e -> scan(e, dash, targets, literals, assigned));
        } else if (element instanceof UnorderedGroup group) {
            group.getElements().forEach(e -> scan(e, dash, targets, literals, assigned));
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
                if (form.plain() || node.text.equals(form.literal())) {
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
            Predicate<String> constraint = CONSTRAINTS.get(form.rule() + "." + pair.getKey());
            if (out.size() == before
                    && constraint != null
                    && pair.getValue().isScalar()
                    && !constraint.test(pair.getValue().text)) {
                out.add(new Issue(child, "`" + pair.getKey() + "` is out of range"));
            }
        }
        for (Entry entry : form.entries().values()) {
            if (entry.required() && !node.map.containsKey(entry.key())) {
                out.add(new Issue(path + "/" + pointer(entry.key()), "required field `" + entry.key() + "` is missing"));
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
