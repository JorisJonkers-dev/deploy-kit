package dev.jorisjonkers.deploykit.emf.syntax.values;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.eclipse.xtext.conversion.ValueConverterException;
import org.junit.jupiter.api.Test;

/** What the authored text of a scalar means. */
class ProjectIntentValueConvertersTest {

    private static final ProjectIntentValueConverters CONVERTERS = new ProjectIntentValueConverters();

    @Test
    void aQuotedScalarLosesItsQuotesAndAPlainOneIsUnchanged() {
        assertThat(CONVERTERS.text().toValue("\"0400\"", null)).isEqualTo("0400");
        assertThat(CONVERTERS.text().toValue("'0400'", null)).isEqualTo("0400");
        assertThat(CONVERTERS.text().toValue("0400", null)).isEqualTo("0400");
        assertThat(CONVERTERS.text().toValue("\"", null)).isEqualTo("\"");
        assertThat(CONVERTERS.text().toValue("\"unbalanced", null)).isEqualTo("\"unbalanced");
        assertThat(CONVERTERS.text().toValue("'mixed\"", null)).isEqualTo("'mixed\"");
    }

    @Test
    void theTextOfAScalarIsTheValueItself() {
        assertThat(CONVERTERS.text().toString("0400")).isEqualTo("0400");
    }

    @Test
    void aBooleanIsABoolean() {
        assertThat(CONVERTERS.bool().toValue("true", null)).isTrue();
        assertThat(CONVERTERS.bool().toValue("false", null)).isFalse();
        assertThat(CONVERTERS.bool().toString(true)).isEqualTo("true");
    }

    @Test
    void anythingElseIsNotABoolean() {
        assertThatThrownBy(() -> CONVERTERS.bool().toValue("yes", null))
                .isInstanceOf(ValueConverterException.class)
                .hasMessageContaining("yes is not true or false");
    }
}
