package dev.jorisjonkers.deploykit.emf.syntax.blocks;

import static org.assertj.core.api.Assertions.assertThat;

import dev.jorisjonkers.deploykit.emf.syntax.parser.antlr.ProjectIntentTokenSource;
import dev.jorisjonkers.deploykit.emf.syntax.parser.antlr.internal.InternalProjectIntentParser;
import dev.jorisjonkers.deploykit.emf.syntax.parser.antlr.lexer.InternalProjectIntentLexer;
import java.util.ArrayList;
import java.util.List;
import org.antlr.runtime.ANTLRStringStream;
import org.antlr.runtime.CommonToken;
import org.antlr.runtime.Token;
import org.junit.jupiter.api.Test;

/** The block structure the grammar reads, as the tokens this source produces for authored YAML. */
class BlockTokenSourceTest {

    /** Every significant token of {@code text}, as "BEGIN", "END" or its own text. */
    private static List<String> blocks(String text) {
        ProjectIntentTokenSource source =
                new ProjectIntentTokenSource(new InternalProjectIntentLexer(new ANTLRStringStream(text)));
        List<String> tokens = new ArrayList<>();
        for (Token token = source.nextToken(); token.getType() != Token.EOF; token = source.nextToken()) {
            if (token.getType() == InternalProjectIntentParser.RULE_BEGIN) {
                tokens.add("BEGIN");
            } else if (token.getType() == InternalProjectIntentParser.RULE_END) {
                tokens.add("END");
            } else if (token.getType() != InternalProjectIntentParser.RULE_WS
                    && token.getType() != InternalProjectIntentParser.RULE_SL_COMMENT) {
                tokens.add(token.getText());
            }
        }
        return tokens;
    }

    @Test
    void theSourceNameIsTheOneTheLexerGives() {
        assertThat(new ProjectIntentTokenSource(new InternalProjectIntentLexer(new ANTLRStringStream("a: 1")))
                        .getSourceName())
                .isEqualTo(new InternalProjectIntentLexer(new ANTLRStringStream("a: 1")).getSourceName());
    }

    @Test
    void anIndentedLineOpensABlockAndFallingBackClosesIt() {
        assertThat(blocks("a:\n  b:\n    c: 1\nd: 2\n"))
                .containsExactly("a", ":", "BEGIN", "b", ":", "BEGIN", "c", ":", "1", "END", "END", "d", ":", "2");
    }

    @Test
    void everyBlockStillOpenAtTheEndOfTheFileIsClosed() {
        assertThat(blocks("a:\n  b:\n    c: 1")).endsWith("1", "END", "END");
    }

    @Test
    void aDashOpensABlockAroundTheItemThatFollowsIt() {
        assertThat(blocks("a:\n  - b: 1\n    c: 2\n  - b: 3\n"))
                .containsExactly(
                        "a", ":", "BEGIN", "-", "BEGIN", "b", ":", "1", "c", ":", "2", "END", "-", "BEGIN", "b", ":",
                        "3", "END", "END");
    }

    @Test
    void aFlowMappingIsABlockOnOneLine() {
        assertThat(blocks("a: { b: 1, c: 2 }\n"))
                .containsExactly("a", ":", "BEGIN", "b", ":", "1", "c", ":", "2", "END");
    }

    @Test
    void aDashFollowedByAFlowMappingOpensOneBlock() {
        assertThat(blocks("a:\n  - { b: 1 }\n  - { b: 2 }\n"))
                .containsExactly(
                        "a", ":", "BEGIN", "-", "BEGIN", "b", ":", "1", "END", "-", "BEGIN", "b", ":", "2", "END",
                        "END");
    }

    @Test
    void aBlockOpenedByAFlowMappingIsClosedWithIt() {
        assertThat(blocks("a: { b: 1 }\nc:\n  d: 2\n"))
                .containsExactly("a", ":", "BEGIN", "b", ":", "1", "END", "c", ":", "BEGIN", "d", ":", "2", "END");
    }

    @Test
    void aSyntheticTokenSitsWhereTheTokenThatAskedForItSits() {
        ProjectIntentTokenSource source =
                new ProjectIntentTokenSource(new InternalProjectIntentLexer(new ANTLRStringStream("a:\n  b: 1\n")));
        List<Token> tokens = new ArrayList<>();
        for (Token token = source.nextToken(); token.getType() != Token.EOF; token = source.nextToken()) {
            tokens.add(token);
        }
        Token begin = tokens.stream()
                .filter(token -> token.getType() == InternalProjectIntentParser.RULE_BEGIN)
                .findFirst()
                .orElseThrow();
        CommonToken key = (CommonToken) tokens.stream()
                .filter(token -> "b".equals(token.getText()))
                .findFirst()
                .orElseThrow();

        assertThat(begin.getText()).isEmpty();
        assertThat(begin.getLine()).isEqualTo(key.getLine());
        assertThat(begin.getCharPositionInLine()).isEqualTo(key.getCharPositionInLine());
        assertThat(((CommonToken) begin).getStartIndex()).isEqualTo(key.getStartIndex());
        assertThat(((CommonToken) begin).getStopIndex()).isEqualTo(key.getStartIndex() - 1);
    }

    @Test
    void indentationInsideAFlowMappingIsNotRead() {
        assertThat(blocks("a: { b: 1,\n        c: 2 }\nd: 3\n"))
                .containsExactly("a", ":", "BEGIN", "b", ":", "1", "c", ":", "2", "END", "d", ":", "3");
    }

    @Test
    void aCommentLineOpensNoBlock() {
        assertThat(blocks("a: 1\n      # a comment, indented\nb: 2\n")).containsExactly("a", ":", "1", "b", ":", "2");
    }

    @Test
    void aFlowSequenceIsAnEmptyBlockRatherThanAnItem() {
        assertThat(blocks("a: []\n")).containsExactly("a", ":", "BEGIN", "END");
    }
}
