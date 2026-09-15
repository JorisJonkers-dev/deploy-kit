package dev.jorisjonkers.deploykit.emf.syntax.blocks;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

/** Which token types open and close a flow collection. */
class BlockTokensTest {

    private static final BlockTokens TYPES = new BlockTokens(1, 2, 3, 4, 5, 6, 7, 8, 9, 10);

    @Test
    void aBraceAndABracketOpenAndCloseAFlowCollection() {
        assertThat(TYPES.opensFlow(TYPES.flowBegin())).isTrue();
        assertThat(TYPES.opensFlow(TYPES.listBegin())).isTrue();
        assertThat(TYPES.closesFlow(TYPES.flowEnd())).isTrue();
        assertThat(TYPES.closesFlow(TYPES.listEnd())).isTrue();
    }

    @Test
    void nothingElseOpensOrClosesOne() {
        assertThat(TYPES.opensFlow(TYPES.flowEnd())).isFalse();
        assertThat(TYPES.opensFlow(TYPES.dash())).isFalse();
        assertThat(TYPES.closesFlow(TYPES.flowBegin())).isFalse();
        assertThat(TYPES.closesFlow(TYPES.separator())).isFalse();
    }

    @Test
    void theTypesAreTheOnesItWasGiven() {
        assertThat(TYPES.begin()).isEqualTo(1);
        assertThat(TYPES.end()).isEqualTo(2);
        assertThat(TYPES.whitespace()).isEqualTo(3);
        assertThat(TYPES.comment()).isEqualTo(4);
        assertThat(TYPES.dash()).isEqualTo(5);
        assertThat(TYPES.flowBegin()).isEqualTo(6);
        assertThat(TYPES.flowEnd()).isEqualTo(7);
        assertThat(TYPES.listBegin()).isEqualTo(8);
        assertThat(TYPES.listEnd()).isEqualTo(9);
        assertThat(TYPES.separator()).isEqualTo(10);
    }
}
