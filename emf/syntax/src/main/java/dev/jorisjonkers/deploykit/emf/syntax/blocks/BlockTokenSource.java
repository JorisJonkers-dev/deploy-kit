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
    private final BlockTokens types;
    private final Deque<Integer> blocks = new ArrayDeque<>();
    private final Queue<Token> pending = new ArrayDeque<>();
    private boolean lineStart = true;
    private boolean afterDash = false;
    private int flowDepth = 0;
    private int lineColumn = 0;

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
        if (types.opensFlow(token.getType())) {
            afterDash = false;
            flowDepth++;
            pending.add(marker(types.begin(), token));
        } else if (types.closesFlow(token.getType())) {
            flowDepth--;
            pending.add(marker(types.end(), token));
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
        CommonToken scalar = new CommonToken(types.scalar(), fold(marker.getText(), raw));
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
