package dev.jorisjonkers.deploykit.emf.syntax.blocks;

import java.util.ArrayDeque;
import java.util.Deque;
import java.util.Queue;
import org.antlr.runtime.CommonToken;
import org.antlr.runtime.Token;
import org.antlr.runtime.TokenSource;

/**
 * Turns the block structure of the authored YAML into the synthetic BEGIN and END tokens the grammar
 * reads, so the grammar states the model's shape rather than the file's layout
 * (emf/docs/architecture.md#concrete-syntax).
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
        }
        lineStart = false;
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
