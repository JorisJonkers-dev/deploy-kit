package dev.jorisjonkers.deploykit.emf.syntax.blocks;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.List;
import java.util.Queue;
import java.util.stream.Collectors;
import org.antlr.runtime.CommonToken;
import org.antlr.runtime.Token;
import org.antlr.runtime.TokenSource;

/**
 * Turns the block structure of the authored YAML into the synthetic BEGIN and END tokens the grammar
 * reads, so the grammar states the model's shape rather than the file's layout
 * (emf/docs/architecture.md#concrete-syntax).
 *
 * <p>A scalar introduced by {@code >} or {@code |} is folded: the indented lines under it become one
 * scalar token, so the grammar reads a value rather than a layout.
 *
 * <p>A line indented further than the line before it opens a block, and every level it falls back
 * closes one. A dash opens a block of its own around the item that follows it, so the first key of
 * an item sits in the same block as the keys under it. A flow collection opens and closes a block on
 * one line, and the comma between its entries becomes whitespace. Inside a flow collection
 * indentation says nothing, so it is not read.
 */
public class BlockTokenSource implements TokenSource {

    private final TokenSource delegate;
    /** The colon that ends a key, after which a value of several words is one plain scalar. */
    private static final String KEY = ":";

    private final BlockTokens types;
    private final Deque<Integer> blocks = new ArrayDeque<>();
    private final Queue<Token> pending = new ArrayDeque<>();
    private boolean lineStart = true;
    private boolean afterDash = false;
    private int flowDepth = 0;
    private int lineColumn = 0;
    private int colonLine = -1;

    public BlockTokenSource(TokenSource delegate, BlockTokens types) {
        this.delegate = delegate;
        this.types = types;
        blocks.push(0);
    }

    @Override
    public Token nextToken() {
        while (pending.isEmpty()) {
            read(delegate.nextToken());
        }
        return pending.remove();
    }

    @Override
    public String getSourceName() {
        return delegate.getSourceName();
    }

    private void read(Token token) {
        if (token.getType() == Token.EOF) {
            closeTo(0, token);
            pending.add(token);
        } else if (token.getType() == types.whitespace() || token.getType() == types.comment()) {
            lineStart |= token.getText().indexOf('\n') >= 0;
            pending.add(token);
        } else if (token.getType() == types.separator()) {
            pending.add(hidden(token));
        } else {
            significant(token);
        }
    }

    private void significant(Token token) {
        if (lineStart && flowDepth == 0) {
            indent(token);
            lineColumn = token.getCharPositionInLine();
        }
        lineStart = false;
        if (token.getType() == types.fold()) {
            folded(token);
            return;
        }
        if (token.getLine() == colonLine && plain(token)) {
            return;
        }
        colonLine = KEY.equals(token.getText()) ? token.getLine() : -1;
        if (types.opensFlow(token.getType())) {
            afterDash = false;
            flowDepth++;
            pending.add(marker(types.begin(), token));
            // The brace stays in the stream as whitespace, so every character still has its token.
            pending.add(hidden(token));
        } else if (types.closesFlow(token.getType())) {
            flowDepth--;
            pending.add(marker(types.end(), token));
            pending.add(hidden(token));
        } else {
            if (afterDash) {
                afterDash = false;
                blocks.push(token.getCharPositionInLine());
                pending.add(marker(types.begin(), token));
            }
            pending.add(token);
            afterDash = token.getType() == types.dash();
        }
    }

    /**
     * A plain scalar of several words, from the value after a key to the end of its line, or in a flow
     * collection to the next separator: the words become one scalar token spanning them, so the grammar
     * reads a value rather than its words. A value of one word is left as the token it is, so a keyword
     * and a vocabulary literal still read as themselves. Returns whether it wrote the value.
     */
    private boolean plain(Token first) {
        colonLine = -1;
        if (types.opensFlow(first.getType()) || types.closesFlow(first.getType()) || first.getType() == types.dash()) {
            return false;
        }
        List<Token> words = new ArrayList<>(List.of(first));
        List<Token> between = new ArrayList<>();
        Token next = delegate.nextToken();
        while (continues(next)) {
            if (next.getType() == types.whitespace()) {
                between.add(next);
            } else {
                between.clear();
                words.add(next);
            }
            next = delegate.nextToken();
        }
        if (words.size() == 1) {
            pending.add(first);
            afterDash = false;
        } else {
            CommonToken start = (CommonToken) first;
            CommonToken last = (CommonToken) words.get(words.size() - 1);
            CommonToken scalar = new CommonToken(
                    types.scalar(), start.getInputStream().substring(start.getStartIndex(), last.getStopIndex()));
            scalar.setLine(start.getLine());
            scalar.setCharPositionInLine(start.getCharPositionInLine());
            scalar.setStartIndex(start.getStartIndex());
            scalar.setStopIndex(last.getStopIndex());
            pending.add(scalar);
            afterDash = false;
        }
        between.forEach(this::read);
        read(next);
        return true;
    }

    /** Whether {@code token} is still part of a plain value: on its line, and before a separator in a flow. */
    private boolean continues(Token token) {
        if (token.getType() == Token.EOF || token.getType() == types.comment()) {
            return false;
        }
        if (token.getType() == types.whitespace()) {
            return token.getText().indexOf('\n') < 0;
        }
        return flowDepth == 0 || !(token.getType() == types.separator() || types.closesFlow(token.getType()));
    }

    /**
     * One scalar from the lines under a fold marker: every line indented further than the key's own
     * line, with the indentation removed, joined by a space for {@code >} and by a line break for
     * {@code |}. A trailing {@code -} drops the final line break, as YAML says it does.
     */
    private void folded(Token fold) {
        CommonToken marker = (CommonToken) fold;
        List<Token> trailing = new ArrayList<>();
        Token last = marker;
        Token next = delegate.nextToken();
        while (next.getType() != Token.EOF && inBlock(next)) {
            if (next.getType() == types.whitespace()) {
                trailing.add(next);
            } else {
                trailing.clear();
                last = next;
            }
            next = delegate.nextToken();
        }
        int end = ((CommonToken) last).getStopIndex();
        String raw = marker.getInputStream().substring(marker.getStartIndex(), end);
        // The token's text is the source it covers, so every node after it sits where its text is;
        // the value the lines fold to is the value converter's to read (valueOf).
        CommonToken scalar = new CommonToken(types.scalar(), raw);
        scalar.setLine(marker.getLine());
        scalar.setCharPositionInLine(marker.getCharPositionInLine());
        scalar.setStartIndex(marker.getStartIndex());
        scalar.setStopIndex(end);
        pending.add(scalar);
        lineStart = true;
        trailing.forEach(this::read);
        read(next);
    }

    /**
     * Whether {@code token} still belongs to the block under the fold marker: whitespace always, and
     * anything else while it is indented further than the key that opened the block. A {@code #} inside
     * the block is content, as YAML says it is; one at or left of the key is a comment on what follows.
     */
    private boolean inBlock(Token token) {
        return token.getType() == types.whitespace() || token.getCharPositionInLine() > lineColumn;
    }

    /**
     * The value a scalar token's text stands for: a block scalar's lines folded as its marker says, and
     * any other text as it is. Only a block scalar opens on {@code >} or {@code |}, which no plain
     * scalar may.
     */
    public static String valueOf(String text) {
        if (text.isEmpty() || (text.charAt(0) != '>' && text.charAt(0) != '|')) {
            return text;
        }
        return fold(text.length() > 1 && text.charAt(1) == '-' ? text.substring(0, 2) : text.substring(0, 1), text);
    }

    /**
     * The value of a block scalar, from the marker's own line onwards: the lines under it with their
     * common indentation removed,
     * joined by a line break under {@code |} and by a space under {@code >}, where a blank line is
     * the paragraph break the subset does not carry. A trailing {@code -} drops the final line break.
     */
    private static String fold(String marker, String raw) {
        List<String> lines = new ArrayList<>(List.of(raw.split("\n", -1)));
        lines.remove(0); // the marker's own line, which carries no content
        int indent = lines.stream()
                .filter(line -> !line.isBlank())
                .mapToInt(line -> line.length() - line.stripLeading().length())
                .min()
                .orElse(0);
        List<String> content = lines.stream()
                .map(line -> line.isBlank() ? "" : line.substring(indent).stripTrailing())
                .toList();
        String joined = marker.startsWith("|")
                ? String.join("\n", content)
                : content.stream().filter(line -> !line.isEmpty()).collect(Collectors.joining(" "));
        return marker.endsWith("-") ? joined : joined + "\n";
    }

    /** Opens or closes the blocks the column of the line's first token asks for. */
    private void indent(Token token) {
        int column = token.getCharPositionInLine();
        if (column > current()) {
            blocks.push(column);
            pending.add(marker(types.begin(), token));
        } else {
            closeTo(column, token);
        }
    }

    private void closeTo(int column, Token token) {
        while (current() > column) {
            blocks.pop();
            pending.add(marker(types.end(), token));
        }
    }

    private int current() {
        return blocks.element();
    }

    /** A zero-width token at {@code at}, so the node model's text stays the file's. The lexer's tokens are
     * {@link CommonToken}s, the end of file included. */
    private Token marker(int type, Token at) {
        CommonToken marker = new CommonToken(type, "");
        marker.setLine(at.getLine());
        marker.setCharPositionInLine(at.getCharPositionInLine());
        int start = ((CommonToken) at).getStartIndex();
        marker.setStartIndex(start);
        marker.setStopIndex(start - 1);
        return marker;
    }

    private Token hidden(Token token) {
        CommonToken copy = new CommonToken(token);
        copy.setType(types.whitespace());
        return copy;
    }
}
