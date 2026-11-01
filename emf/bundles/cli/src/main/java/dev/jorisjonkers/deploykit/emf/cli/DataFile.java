package dev.jorisjonkers.deploykit.emf.cli;

import dev.jorisjonkers.deploykit.emf.metamodel.pinnedinputs.Datum;
import dev.jorisjonkers.deploykit.emf.metamodel.pinnedinputs.DatumEntry;
import dev.jorisjonkers.deploykit.emf.metamodel.pinnedinputs.DatumKind;
import dev.jorisjonkers.deploykit.emf.metamodel.pinnedinputs.DatumList;
import dev.jorisjonkers.deploykit.emf.metamodel.pinnedinputs.DatumMap;
import dev.jorisjonkers.deploykit.emf.metamodel.pinnedinputs.DatumScalar;
import dev.jorisjonkers.deploykit.emf.metamodel.pinnedinputs.PinnedInputsFactory;
import java.math.BigDecimal;
import java.math.BigInteger;
import java.util.HashSet;
import java.util.Optional;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * A data file an Application ships, read as YAML reads it, into the data it holds: a rule-group
 * file, which the monitoring stack's rules are written from as the file writes them
 * (spec/v1/10-project-intent.md#alert-rules). It reads the YAML such a file is written in: block
 * mappings and sequences, flow collections over any number of lines, JSON among them, plain scalars
 * over one line or several, single- and double-quoted scalars on one line, literal and folded block
 * scalars, and comments. A plain scalar is typed as YAML's core schema types it. A file that is not
 * YAML, or that uses what this reader has no meaning for (an anchor, an alias, a tag, a directive, a
 * second document, an indentation indicator, a duplicated key), holds nothing.
 */
final class DataFile {

    private static final PinnedInputsFactory MODEL = PinnedInputsFactory.eINSTANCE;
    private static final String KEY = "groups";

    /** A line that opens or ends a document: after the first token, a second document. */
    private static final Pattern MARKER = Pattern.compile("(?m)^(---|\\.\\.\\.)([ \\t].*)?$");

    private final String text;
    private int at;

    private DataFile(String text) {
        this.text = text.replace("\r\n", "\n");
    }

    /** What {@code text} holds, or nothing where it is not YAML this reader reads. */
    static Optional<Datum> read(String text) {
        DataFile file = new DataFile(text);
        try {
            file.blank();
            if (file.text.startsWith("---", file.at) && file.ends(file.at + 3)) {
                file.at += 3;
                file.blank();
            }
            if (MARKER.matcher(file.text).region(file.at, file.text.length()).find()) {
                throw new Malformed();
            }
            Datum datum = file.more() ? file.node(-1) : scalar("null", DatumKind.EMPTY);
            file.blank();
            if (file.more()) {
                throw new Malformed();
            }
            return Optional.of(datum);
        } catch (Malformed e) {
            return Optional.empty();
        }
    }

    /** The rule groups {@code text} holds: the list a top-level mapping holds under `groups`, where it holds one. */
    static Optional<DatumList> groups(String text) {
        return read(text)
                .filter(DatumMap.class::isInstance)
                .flatMap(root -> ((DatumMap) root)
                        .getEntries().stream()
                                .filter(entry -> entry.getKey().equals(KEY))
                                .map(DatumEntry::getValue)
                                .findFirst())
                .filter(DatumList.class::isInstance)
                .map(DatumList.class::cast)
                .filter(list -> !list.getItems().isEmpty());
    }

    /** What YAML has no meaning for here, or no meaning for at all. */
    private static final class Malformed extends RuntimeException {
        private static final long serialVersionUID = 1L;
    }

    // ------------------------------------------------------------------ positions

    /**
     * The character at {@code index}, where the end of the file reads as a line break. No index before
     * the file is asked for: a comment's {@code #} is only looked behind past a token's first character.
     */
    private char peek(int index) {
        return index < text.length() ? text.charAt(index) : '\n';
    }

    /** The column {@code index} sits at on its line. */
    private int column(int index) {
        return index - (text.lastIndexOf('\n', index - 1) + 1);
    }

    /** Whether {@code index} ends a token: the end of the file, a space or a line break. */
    private boolean ends(int index) {
        char c = peek(index);
        return c == ' ' || c == '\t' || c == '\n';
    }

    /** Whether a block sequence's dash opens at {@code at}. */
    private boolean dash() {
        return peek(at) == '-' && ends(at + 1);
    }

    private boolean more() {
        return at < text.length();
    }

    /** Spaces and tabs on the line. */
    private void spaces() {
        while (peek(at) == ' ' || peek(at) == '\t') {
            at++;
        }
    }

    /** Whether nothing but a comment is left on the line; the rest of the line is skipped if so. */
    private boolean lineEnds() {
        spaces();
        if (peek(at) == '#') {
            while (peek(at) != '\n') {
                at++;
            }
        }
        return peek(at) == '\n';
    }

    /** Every blank line and comment, up to the next token of the file. */
    private void blank() {
        while (more() && lineEnds()) {
            at++;
        }
    }

    /** The token on the line at {@code at} ends its value: nothing but a comment follows it. */
    private void endOfValue() {
        if (!lineEnds()) {
            throw new Malformed();
        }
    }

    // ------------------------------------------------------------------ block structure

    /** The node at {@code at}, inside a parent at column {@code parent}. */
    private Datum node(int parent) {
        int column = column(at);
        if (dash()) {
            return sequence(column);
        }
        if (keyAhead()) {
            return mapping(column);
        }
        return value(parent);
    }

    private DatumList sequence(int column) {
        DatumList list = MODEL.createDatumList();
        while (more() && column(at) == column && dash()) {
            at++;
            list.getItems().add(lineEnds() ? below(column) : node(column));
            blank();
        }
        if (more() && column(at) > column) {
            throw new Malformed();
        }
        return list;
    }

    private DatumMap mapping(int column) {
        DatumMap map = MODEL.createDatumMap();
        Set<String> keys = new HashSet<>();
        do {
            DatumEntry entry = MODEL.createDatumEntry();
            entry.setKey(key());
            if (!keys.add(entry.getKey())) {
                throw new Malformed();
            }
            if (lineEnds()) {
                blank();
                entry.setValue(more() && column(at) == column && dash() ? sequence(column) : below(column));
            } else {
                entry.setValue(value(column));
            }
            map.getEntries().add(entry);
            blank();
        } while (more() && column(at) == column && !dash() && keyAhead());
        if (more() && column(at) > column) {
            throw new Malformed();
        }
        return map;
    }

    /** The node on the lines below a key or a dash at {@code column}, or an empty scalar where there is none. */
    private Datum below(int column) {
        blank();
        return more() && column(at) > column ? node(column) : scalar("null", DatumKind.EMPTY);
    }

    /** Whether a mapping key opens at {@code at}: a key, then a colon a space or the line's end follows. */
    private boolean keyAhead() {
        int start = at;
        try {
            key();
            return true;
        } catch (Malformed e) {
            return false;
        } finally {
            at = start;
        }
    }

    /** The key at {@code at}, with the colon after it. */
    private String key() {
        String key;
        char c = peek(at);
        if (c == '"' || c == '\'') {
            key = quoted();
            spaces();
        } else {
            int start = at;
            while (!(peek(at) == ':' && ends(at + 1)) && peek(at) != '\n' && !(peek(at) == '#' && ends(at - 1))) {
                at++;
            }
            key = text.substring(start, at).strip();
            // A key opens on no indicator: an anchor or a tag is outside the subset.
            if (!key.isEmpty() && "[]{},#&*!|>'\"%@`".indexOf(key.charAt(0)) >= 0) {
                throw new Malformed();
            }
        }
        if (peek(at) != ':' || !ends(at + 1)) {
            throw new Malformed();
        }
        at++;
        return key;
    }

    /** A value that is no collection of the block: a flow collection, a block scalar, or a scalar. */
    private Datum value(int parent) {
        char c = peek(at);
        if (c == '[' || c == '{') {
            Datum flow = flow();
            endOfValue();
            return flow;
        }
        if (c == '|' || c == '>') {
            return block(parent);
        }
        if (c == '"' || c == '\'') {
            String quoted = quoted();
            endOfValue();
            return scalar(quoted, DatumKind.STRING);
        }
        if ("&*!%@`".indexOf(c) >= 0) {
            throw new Malformed();
        }
        return plain(parent);
    }

    /**
     * A plain scalar, to the end of its line or a comment, and every line after it indented further than
     * its parent, folded: a line break is a space, and each blank line between two is one line break.
     */
    private Datum plain(int parent) {
        StringBuilder value = new StringBuilder(rest());
        int breaks = 0;
        int resume = at;
        while (more()) {
            at++;
            spaces();
            // The end of the file reads as a line break, so it is counted with the blank lines.
            if (peek(at) == '\n') {
                breaks++;
            } else if (column(at) > parent && peek(at) != '#') {
                // A key there would open a mapping inside a scalar, which YAML refuses.
                if (keyAhead()) {
                    throw new Malformed();
                }
                value.append(breaks == 0 ? " " : "\n".repeat(breaks)).append(rest());
                breaks = 0;
                resume = at;
            } else {
                break;
            }
        }
        at = resume;
        return typed(value.toString());
    }

    /** The rest of the line from {@code at}, short of a comment, trimmed; {@code at} is left at the line's end. */
    private String rest() {
        int start = at;
        while (peek(at) != '\n' && !(peek(at) == '#' && ends(at - 1))) {
            at++;
        }
        String line = text.substring(start, at).strip();
        lineEnds();
        return line;
    }

    /**
     * A literal or folded block scalar: every line under the indicator indented at least as far as its
     * first, with that indentation removed, joined by a line break under {@code |} and folded under
     * {@code >}, and its trailing line breaks clipped to one, stripped under {@code -} or kept under
     * {@code +}.
     */
    private Datum block(int parent) {
        boolean literal = peek(at) == '|';
        at++;
        char chomp = peek(at) == '-' || peek(at) == '+' ? text.charAt(at++) : ' ';
        endOfValue();
        StringBuilder value = new StringBuilder();
        int indent = -1;
        int breaks = 0;
        boolean previousMore = false;
        while (at + 1 < text.length()) {
            int start = at + 1;
            int end = text.indexOf('\n', start);
            String line = text.substring(start, end < 0 ? text.length() : end);
            int width = line.length() - line.stripLeading().length();
            if (line.isBlank()) {
                breaks++;
            } else if (width > parent && (indent < 0 || width >= indent)) {
                indent = indent < 0 ? width : indent;
                String content = line.substring(indent).stripTrailing();
                boolean more = content.startsWith(" ") || content.startsWith("\t");
                // A line break is kept under `|`, around a line indented further and before the first
                // line; elsewhere under `>` it folds to a space, or into the blank lines after it.
                boolean kept = literal || more || previousMore || value.length() == 0;
                value.append(value.length() == 0 ? "" : kept || breaks > 0 ? "\n" : " ")
                        .append("\n".repeat(kept ? breaks : Math.max(breaks - 1, 0)))
                        .append(content);
                previousMore = more;
                breaks = 0;
            } else {
                break;
            }
            at = end < 0 ? text.length() : end;
        }
        String content = value.toString();
        String trailing = content.isEmpty() ? "" : "\n";
        return scalar(
                content + (chomp == '-' ? "" : chomp == '+' ? trailing + "\n".repeat(breaks) : trailing),
                DatumKind.STRING);
    }

    // ------------------------------------------------------------------ flow structure

    /** Spaces, line breaks and comments inside a flow collection. */
    private void flowBlank() {
        while (more() && lineEnds()) {
            at++;
        }
        spaces();
    }

    private Datum flow() {
        boolean map = text.charAt(at++) == '{';
        char close = map ? '}' : ']';
        DatumMap entries = MODEL.createDatumMap();
        DatumList items = MODEL.createDatumList();
        Set<String> keys = new HashSet<>();
        flowBlank();
        while (peek(at) != close) {
            if (map) {
                DatumEntry entry = MODEL.createDatumEntry();
                entry.setKey(peek(at) == '"' || peek(at) == '\'' ? quoted() : flowPlain(true));
                if (!keys.add(entry.getKey())) {
                    throw new Malformed();
                }
                flowBlank();
                if (peek(at) != ':') {
                    throw new Malformed();
                }
                at++;
                flowBlank();
                entry.setValue(peek(at) == ',' || peek(at) == close ? scalar("null", DatumKind.EMPTY) : flowNode());
                entries.getEntries().add(entry);
            } else {
                items.getItems().add(flowNode());
            }
            flowBlank();
            if (peek(at) == ',') {
                at++;
                flowBlank();
            } else if (peek(at) != close) {
                throw new Malformed();
            }
        }
        at++;
        return map ? entries : items;
    }

    private Datum flowNode() {
        char c = peek(at);
        if (c == '[' || c == '{') {
            return flow();
        }
        if (c == '"' || c == '\'') {
            return scalar(quoted(), DatumKind.STRING);
        }
        return typed(flowPlain(false));
    }

    /** A plain scalar in a flow collection, to the next indicator; a key's also stops at its colon. */
    private String flowPlain(boolean key) {
        int start = at;
        while (more()
                && ",[]{}".indexOf(peek(at)) < 0
                && !(peek(at) == ':' && (key || ends(at + 1)))
                && !(peek(at) == '#' && ends(at - 1))) {
            at++;
        }
        String plain = text.substring(start, at).strip().replaceAll("\\s*\\n\\s*", " ");
        if (plain.isEmpty() || "&*!%@`|>".indexOf(plain.charAt(0)) >= 0) {
            throw new Malformed();
        }
        return plain;
    }

    // ------------------------------------------------------------------ scalars

    /** A single- or double-quoted scalar on one line, its escapes read. */
    private String quoted() {
        char quote = text.charAt(at++);
        StringBuilder value = new StringBuilder();
        while (true) {
            char c = peek(at++);
            if (c == '\n') {
                throw new Malformed();
            } else if (c == quote && quote == '\'' && peek(at) == '\'') {
                value.append('\'');
                at++;
            } else if (c == quote) {
                return value.toString();
            } else if (c == '\\' && quote == '"') {
                value.append(escaped());
            } else {
                value.append(c);
            }
        }
    }

    /** The character a double-quoted scalar's escape after the backslash stands for. */
    private String escaped() {
        char c = peek(at++);
        return switch (c) {
            case 'n' -> "\n";
            case 't' -> "\t";
            case 'r' -> "\r";
            case 'b' -> "\b";
            case 'f' -> "\f";
            case '0' -> "\0";
            case '"', '\\', '/', ' ' -> String.valueOf(c);
            case 'u' -> {
                try {
                    String hex = text.substring(at, at + 4);
                    at += 4;
                    yield String.valueOf((char) Integer.parseInt(hex, 16));
                } catch (NumberFormatException | StringIndexOutOfBoundsException e) {
                    throw new Malformed();
                }
            }
            default -> throw new Malformed();
        };
    }

    /** A plain scalar as YAML's core schema types it: null, a boolean, an integer, a float, or a string. */
    private static DatumScalar typed(String plain) {
        if (plain.matches("~|null|Null|NULL")) {
            return scalar("null", DatumKind.EMPTY);
        }
        if (plain.matches("true|True|TRUE|false|False|FALSE")) {
            return scalar(plain.toLowerCase(java.util.Locale.ROOT), DatumKind.BOOLEAN);
        }
        if (plain.matches("[-+]?[0-9]+")) {
            return scalar(new BigInteger(plain).toString(), DatumKind.NUMBER);
        }
        if (plain.matches("0o[0-7]+|0x[0-9a-fA-F]+")) {
            return scalar(
                    new BigInteger(plain.substring(2), plain.charAt(1) == 'o' ? 8 : 16).toString(), DatumKind.NUMBER);
        }
        if (plain.matches("[-+]?(\\.[0-9]+|[0-9]+(\\.[0-9]*)?)([eE][-+]?[0-9]+)?")) {
            return scalar(new BigDecimal(plain).stripTrailingZeros().toPlainString(), DatumKind.NUMBER);
        }
        return scalar(plain, DatumKind.STRING);
    }

    private static DatumScalar scalar(String text, DatumKind kind) {
        DatumScalar scalar = MODEL.createDatumScalar();
        scalar.setText(text);
        scalar.setKind(kind);
        return scalar;
    }
}
