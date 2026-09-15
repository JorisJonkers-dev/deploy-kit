package dev.jorisjonkers.deploykit.emf.syntax.blocks;

/**
 * The token types {@link BlockTokenSource} rewrites, as the generated parser numbers them.
 *
 * @param begin the synthetic token that opens a block
 * @param end the synthetic token that closes one
 * @param whitespace whitespace, which carries the line breaks and the indentation
 * @param comment a comment, which is hidden and never opens a block
 * @param dash the marker of a block sequence item
 * @param flowBegin an opening brace
 * @param flowEnd a closing brace
 * @param listBegin an opening bracket
 * @param listEnd a closing bracket
 * @param separator the comma between flow entries
 */
public record BlockTokens(
        int begin,
        int end,
        int whitespace,
        int comment,
        int dash,
        int flowBegin,
        int flowEnd,
        int listBegin,
        int listEnd,
        int separator) {

    /** Whether {@code type} opens a flow collection, which is a block on one line. */
    public boolean opensFlow(int type) {
        return type == flowBegin || type == listBegin;
    }

    /** Whether {@code type} closes one. */
    public boolean closesFlow(int type) {
        return type == flowEnd || type == listEnd;
    }
}
