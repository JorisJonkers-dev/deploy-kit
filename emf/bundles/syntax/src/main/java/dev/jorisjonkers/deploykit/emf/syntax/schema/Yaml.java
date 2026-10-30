package dev.jorisjonkers.deploykit.emf.syntax.schema;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * The YAML subset the authored files use, read into a plain tree so a refusal can name the node it
 * is about by its JSON pointer. It reads block and flow mappings and sequences, plain, quoted and
 * folded scalars and comments, and refuses an anchor, an alias, a tag or a second document as
 * {@link Unsupported}: the reader has no meaning for them.
 */
public final class Yaml {

    /** One node: a mapping, a sequence or a scalar. */
    public static final class Node {
        public final Map<String, Node> map;
        public final List<Node> list;
        public final String text;
        public final boolean quoted;

        private Node(Map<String, Node> map, List<Node> list, String text, boolean quoted) {
            this.map = map;
            this.list = list;
            this.text = text;
            this.quoted = quoted;
        }

        public boolean isMap() {
            return map != null;
        }

        public boolean isList() {
            return list != null;
        }

        public boolean isScalar() {
            return text != null;
        }
    }

    /** Text the subset does not cover. */
    public static final class Unsupported extends RuntimeException {
        private static final long serialVersionUID = 1L;

        Unsupported(String message) {
            super(message);
        }
    }

    private final List<String> lines = new ArrayList<>();
    private int at;

    private Yaml(String text) {
        for (String raw : text.split("\r?\n", -1)) {
            String line = stripComment(raw);
            if (line.isBlank()) {
                continue;
            }
            if (line.equals("---") || line.startsWith("--- ") || line.equals("...")) {
                if (!lines.isEmpty()) {
                    throw new Unsupported("more than one document");
                }
                continue;
            }
            lines.add(line.stripTrailing());
        }
    }

    public static Node read(String text) {
        Yaml yaml = new Yaml(text);
        if (yaml.lines.isEmpty()) {
            throw new Unsupported("no document");
        }
        Node root = yaml.block(indent(yaml.lines.get(0)));
        if (yaml.at < yaml.lines.size()) {
            throw new Unsupported("unexpected content");
        }
        return root;
    }

    private static String stripComment(String line) {
        char quote = 0;
        for (int i = 0; i < line.length(); i++) {
            char c = line.charAt(i);
            if (quote != 0) {
                if (c == quote) {
                    quote = 0;
                }
            } else if (c == '"' || c == '\'') {
                if (i == 0 || " \t[{,:-".indexOf(line.charAt(i - 1)) >= 0) {
                    quote = c;
                }
            } else if (c == '#' && (i == 0 || Character.isWhitespace(line.charAt(i - 1)))) {
                return line.substring(0, i);
            }
        }
        return line;
    }

    private static int indent(String line) {
        int n = 0;
        while (n < line.length() && line.charAt(n) == ' ') {
            n++;
        }
        return n;
    }

    private static boolean dash(String line, int indent) {
        return line.startsWith("-", indent) && (line.length() == indent + 1 || line.charAt(indent + 1) == ' ');
    }

    private Node block(int indent) {
        return dash(lines.get(at), indent) ? sequence(indent) : mapping(indent);
    }

    private Node sequence(int indent) {
        List<Node> items = new ArrayList<>();
        while (at < lines.size() && indent(lines.get(at)) == indent && dash(lines.get(at), indent)) {
            String line = lines.get(at);
            String rest = line.substring(indent + 1);
            int inner = indent + 1 + indent(rest);
            rest = rest.strip();
            if (rest.isEmpty()) {
                at++;
                if (at < lines.size() && indent(lines.get(at)) > indent) {
                    items.add(block(indent(lines.get(at))));
                } else {
                    items.add(new Node(null, null, "", false));
                }
            } else if (dash(rest, 0) || keyed(rest)) {
                lines.set(at, " ".repeat(inner) + rest);
                items.add(block(inner));
            } else {
                at++;
                items.add(value(rest, indent));
            }
        }
        return new Node(null, items, null, false);
    }

    /** Whether {@code text} opens with {@code key:}. */
    private static boolean keyed(String text) {
        return keyEnd(text) > 0;
    }

    private static int keyEnd(String text) {
        if (text.startsWith("{") || text.startsWith("[")) {
            return -1;
        }
        int i = 0;
        if (text.startsWith("\"") || text.startsWith("'")) {
            int close = text.indexOf(text.charAt(0), 1);
            if (close < 0) {
                return -1;
            }
            i = close + 1;
        } else {
            while (i < text.length() && text.charAt(i) != ':') {
                i++;
            }
        }
        if (i < text.length() && text.charAt(i) == ':' && (i + 1 == text.length() || text.charAt(i + 1) == ' ')) {
            return i;
        }
        return -1;
    }

    private Node mapping(int indent) {
        Map<String, Node> entries = new LinkedHashMap<>();
        while (at < lines.size() && indent(lines.get(at)) == indent && !dash(lines.get(at), indent)) {
            String text = lines.get(at).substring(indent);
            int colon = keyEnd(text);
            if (colon < 0) {
                throw new Unsupported("not a mapping entry: " + text);
            }
            String key = unquote(text.substring(0, colon).strip());
            String rest = text.substring(colon + 1).strip();
            at++;
            Node child;
            if (rest.isEmpty()) {
                if (at < lines.size() && indent(lines.get(at)) > indent) {
                    child = block(indent(lines.get(at)));
                } else if (at < lines.size() && indent(lines.get(at)) == indent && dash(lines.get(at), indent)) {
                    child = sequence(indent);
                } else {
                    child = new Node(null, null, "", false);
                }
            } else {
                child = value(rest, indent);
            }
            entries.put(key, child);
        }
        return new Node(entries, null, null, false);
    }

    /** A value that opens on the line already consumed. */
    private Node value(String rest, int indent) {
        if (rest.startsWith("{") || rest.startsWith("[")) {
            StringBuilder flow = new StringBuilder(rest);
            while (depth(flow) > 0 && at < lines.size()) {
                flow.append(' ').append(lines.get(at++).strip());
            }
            int[] pos = {0};
            Node node = flow(flow.toString(), pos);
            return node;
        }
        if (rest.matches("[>|][-+]?")) {
            StringBuilder folded = new StringBuilder();
            while (at < lines.size() && indent(lines.get(at)) > indent) {
                folded.append(folded.length() == 0 ? "" : " ")
                        .append(lines.get(at++).strip());
            }
            return new Node(null, null, folded.toString(), false);
        }
        return scalar(rest);
    }

    private static int depth(CharSequence flow) {
        int depth = 0;
        char quote = 0;
        for (int i = 0; i < flow.length(); i++) {
            char c = flow.charAt(i);
            if (quote != 0) {
                if (c == quote) {
                    quote = 0;
                }
            } else if (c == '"' || c == '\'') {
                quote = c;
            } else if (c == '{' || c == '[') {
                depth++;
            } else if (c == '}' || c == ']') {
                depth--;
            }
        }
        return depth;
    }

    private static Node scalar(String text) {
        String t = text.strip();
        if (t.startsWith("&") || t.startsWith("*") || t.startsWith("!")) {
            throw new Unsupported("anchor, alias or tag: " + t);
        }
        if (t.startsWith("\"") || t.startsWith("'")) {
            return new Node(null, null, unquote(t), true);
        }
        return new Node(null, null, t, false);
    }

    private static String unquote(String t) {
        if (t.length() >= 2 && (t.startsWith("\"") && t.endsWith("\"") || t.startsWith("'") && t.endsWith("'"))) {
            return t.substring(1, t.length() - 1);
        }
        return t;
    }

    private static void skip(String s, int[] pos) {
        while (pos[0] < s.length() && s.charAt(pos[0]) == ' ') {
            pos[0]++;
        }
    }

    private static Node flow(String s, int[] pos) {
        skip(s, pos);
        char c = s.charAt(pos[0]);
        if (c == '{') {
            pos[0]++;
            Map<String, Node> entries = new LinkedHashMap<>();
            skip(s, pos);
            while (s.charAt(pos[0]) != '}') {
                String key = unquote(token(s, pos, ":").strip());
                pos[0]++;
                entries.put(key, flow(s, pos));
                skip(s, pos);
                if (s.charAt(pos[0]) == ',') {
                    pos[0]++;
                    skip(s, pos);
                }
            }
            pos[0]++;
            return new Node(entries, null, null, false);
        }
        if (c == '[') {
            pos[0]++;
            List<Node> items = new ArrayList<>();
            skip(s, pos);
            while (s.charAt(pos[0]) != ']') {
                items.add(flow(s, pos));
                skip(s, pos);
                if (s.charAt(pos[0]) == ',') {
                    pos[0]++;
                    skip(s, pos);
                }
            }
            pos[0]++;
            return new Node(null, items, null, false);
        }
        return scalar(token(s, pos, ",}]"));
    }

    private static String token(String s, int[] pos, String stops) {
        int start = pos[0];
        char first = s.charAt(start);
        if (first == '"' || first == '\'') {
            int close = s.indexOf(first, start + 1);
            pos[0] = close + 1;
            return s.substring(start, pos[0]);
        }
        while (pos[0] < s.length() && stops.indexOf(s.charAt(pos[0])) < 0) {
            pos[0]++;
        }
        return s.substring(start, pos[0]);
    }
}
