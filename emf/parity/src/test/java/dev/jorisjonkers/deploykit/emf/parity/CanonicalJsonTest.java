package dev.jorisjonkers.deploykit.emf.parity;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

/**
 * The RFC 8785 serialisation the parity contract compares oracle files with. Cases marked RFC come
 * from the specification's own examples.
 */
class CanonicalJsonTest {

    @Test
    void sortsObjectKeysByUtf16CodeUnitsAtEveryDepth() {
        // RFC 8785 section 3.2.3: the property sorting example.
        Map<String, Object> inner = new LinkedHashMap<>();
        inner.put("\u20ac", "Euro Sign");
        inner.put("\r", "Carriage Return");
        inner.put("\ufb33", "Hebrew Letter Dalet With Dagesh");
        inner.put("1", "One");
        inner.put("\ud83d\ude00", "Emoji: Grinning Face");
        inner.put("\u0080", "Control");
        inner.put("\u00f6", "Latin Small Letter O With Diaeresis");

        assertThat(CanonicalJson.write(inner))
                .isEqualTo("{\"\\r\":\"Carriage Return\",\"1\":\"One\",\"\u0080\":\"Control\","
                        + "\"\u00f6\":\"Latin Small Letter O With Diaeresis\",\"\u20ac\":\"Euro Sign\","
                        + "\"\ud83d\ude00\":\"Emoji: Grinning Face\",\"\ufb33\":\"Hebrew Letter Dalet With Dagesh\"}");
    }

    @Test
    void writesNestedStructuresWithoutInsignificantWhitespace() {
        Map<String, Object> document = new LinkedHashMap<>();
        document.put("processes", List.of(Map.of("name", "api"), Map.of()));
        document.put("applications", new ArrayList<>());
        document.put("enabled", true);
        document.put("disabled", false);

        assertThat(CanonicalJson.write(document))
                .isEqualTo("{\"applications\":[],\"disabled\":false,\"enabled\":true,"
                        + "\"processes\":[{\"name\":\"api\"},{}]}");
    }

    @Test
    void escapesOnlyWhatTheSpecificationEscapes() {
        String text = "quote\" backslash\\ controls\b\f\n\r\t\u000f\u001f slash/ del\u007f line\u2028 euro\u20ac";

        assertThat(CanonicalJson.write(text))
                .isEqualTo("\"quote\\\" backslash\\\\ controls\\b\\f\\n\\r\\t\\u000f\\u001f"
                        + " slash/ del\u007f line\u2028 euro\u20ac\"");
    }

    @ParameterizedTest(name = "{0} -> {1}")
    @CsvSource({
        // RFC 8785 appendix B and ECMAScript Number::toString boundaries.
        "0.0, 0",
        "-0.0, 0",
        "1.0, 1",
        "-1.5, -1.5",
        "4.50, 4.5",
        "0.002, 0.002",
        "0.5, 0.5",
        "-0.000001, -0.000001",
        "10.0, 10",
        "1.0E-6, 0.000001",
        "0.000001, 0.000001",
        "0.0000001, 1e-7",
        "1.0E-27, 1e-27",
        "123456789012345680000, 123456789012345680000",
        "1.0E21, 1e+21",
        "1.0E30, 1e+30",
        "1.2345E25, 1.2345e+25",
        "333333333.33333329, 333333333.3333333",
        "9007199254740991.0, 9007199254740991",
        "-9007199254740991.0, -9007199254740991",
        "1.7976931348623157E308, 1.7976931348623157e+308",
        "4.9E-324, 5e-324",
        "295147905179352830000, 295147905179352830000",
    })
    void formatsDoublesAsEcmaScriptDoes(double value, String expected) {
        assertThat(CanonicalJson.write(value)).isEqualTo(expected);
    }

    @Test
    void writesIntegralNumbersExactlyWithinTheSafeRange() {
        assertThat(CanonicalJson.write(
                        List.of(0, -7, 42L, (short) 3, (byte) -2, 9007199254740991L, -9007199254740991L)))
                .isEqualTo("[0,-7,42,3,-2,9007199254740991,-9007199254740991]");
    }

    @Test
    void refusesAnAbsentValueWrittenAsNullAndSaysWhere() {
        Map<String, Object> document = new LinkedHashMap<>();
        document.put("applications", Arrays.asList(Map.of("id", "auth"), null));

        assertThatThrownBy(() -> CanonicalJson.write(document))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("null at /applications/1: an absent optional field is absent, never null");
    }

    @Test
    void escapesPointerSegmentsInMessages() {
        Map<String, Object> inner = new LinkedHashMap<>();
        inner.put("a/b~c", null);

        assertThatThrownBy(() -> CanonicalJson.write(Map.of("x", inner))).hasMessageStartingWith("null at /x/a~1b~0c:");
    }

    @Test
    void refusesANullRootAndNullKeys() {
        Map<String, Object> nullKey = new LinkedHashMap<>();
        nullKey.put(null, 1);

        assertThatThrownBy(() -> CanonicalJson.write(null)).hasMessageStartingWith("null at :");
        assertThatThrownBy(() -> CanonicalJson.write(nullKey))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("object key at  is not a string");
    }

    @Test
    void refusesNonStringKeys() {
        assertThatThrownBy(() -> CanonicalJson.write(Map.of(1, "one")))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("object key at  is not a string");
    }

    @Test
    void refusesNumbersJsonCannotCarryExactly() {
        assertThatThrownBy(() -> CanonicalJson.write(Double.NaN)).hasMessage("NaN at  is not a JSON number");
        assertThatThrownBy(() -> CanonicalJson.write(Double.POSITIVE_INFINITY))
                .hasMessage("Infinity at  is not a JSON number");
        assertThatThrownBy(() -> CanonicalJson.write(9007199254740992L))
                .hasMessage("9007199254740992 at  is outside the range a JSON number carries exactly");
        assertThatThrownBy(() -> CanonicalJson.write(-9007199254740992L))
                .hasMessage("-9007199254740992 at  is outside the range a JSON number carries exactly");
    }

    @Test
    void refusesTypesThatAreNotJson() {
        assertThatThrownBy(() -> CanonicalJson.write(1.5f)).hasMessage("java.lang.Float at  is not a JSON value");
        assertThatThrownBy(() -> CanonicalJson.write(new Object()))
                .hasMessage("java.lang.Object at  is not a JSON value");
    }

    @Test
    void refusesStringsThatAreNotWellFormedUnicode() {
        assertThatThrownBy(() -> CanonicalJson.write("lone \ud800 high"))
                .hasMessage("string at  holds a lone surrogate at index 5");
        assertThatThrownBy(() -> CanonicalJson.write("lone \udc00 low"))
                .hasMessage("string at  holds a lone surrogate at index 5");
        assertThatThrownBy(() -> CanonicalJson.write("ends \ud800"))
                .hasMessage("string at  holds a lone surrogate at index 5");
        assertThatThrownBy(() -> CanonicalJson.write(Map.of("bad \ud800", 1)))
                .hasMessage("string at  holds a lone surrogate at index 4");
    }
}
