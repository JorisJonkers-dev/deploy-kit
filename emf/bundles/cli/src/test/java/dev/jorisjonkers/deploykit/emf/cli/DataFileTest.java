package dev.jorisjonkers.deploykit.emf.cli;

import static org.assertj.core.api.Assertions.assertThat;

import dev.jorisjonkers.deploykit.emf.metamodel.pinnedinputs.Datum;
import dev.jorisjonkers.deploykit.emf.metamodel.pinnedinputs.DatumKind;
import dev.jorisjonkers.deploykit.emf.metamodel.pinnedinputs.DatumList;
import dev.jorisjonkers.deploykit.emf.metamodel.pinnedinputs.DatumMap;
import dev.jorisjonkers.deploykit.emf.metamodel.pinnedinputs.DatumScalar;
import java.util.stream.Collectors;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.junit.jupiter.params.provider.ValueSource;

/** A data file read as YAML reads it, into the data it holds, or into nothing where it is not that YAML. */
class DataFileTest {

    /** The data as JSON, a string's text quoted and every other scalar as its own text. */
    private static String json(Datum datum) {
        if (datum instanceof DatumMap map) {
            return map.getEntries().stream()
                    .map(entry -> "\"" + entry.getKey() + "\":" + json(entry.getValue()))
                    .collect(Collectors.joining(",", "{", "}"));
        }
        if (datum instanceof DatumList list) {
            return list.getItems().stream().map(DataFileTest::json).collect(Collectors.joining(",", "[", "]"));
        }
        return quoted((DatumScalar) datum);
    }

    private static String quoted(DatumScalar scalar) {
        return scalar.getKind() == DatumKind.STRING ? "\"" + scalar.getText() + "\"" : scalar.getText();
    }

    private static String read(String text) {
        return DataFile.read(text).map(DataFileTest::json).orElse("nothing");
    }

    static Stream<Arguments> documents() {
        return Stream.of(
                // Block collections, nested, and a sequence as a mapping's value at the key's own column.
                Arguments.of(
                        "a: 1\nb:\n  c: x\n  d:\n  - y\n  - z: w\n    v: u\n",
                        "{\"a\":1,\"b\":{\"c\":\"x\",\"d\":[\"y\",{\"z\":\"w\",\"v\":\"u\"}]}}"),
                Arguments.of("- a\n-\n  - b\n-\n- # nothing\n", "[\"a\",[\"b\"],null,null]"),
                Arguments.of("  a: 1\n  b: 2\n", "{\"a\":1,\"b\":2}"),
                Arguments.of("a:\nb: # empty\n", "{\"a\":null,\"b\":null}"),
                // Comments, a document marker, and a file of nothing.
                Arguments.of("# head\n---\na: b # tail\n\n# end\n", "{\"a\":\"b\"}"),
                Arguments.of("--- [a]\n", "[\"a\"]"),
                Arguments.of("", "null"),
                Arguments.of("# only\n", "null"),
                Arguments.of("a: x\r\nb: y\r\n", "{\"a\":\"x\",\"b\":\"y\"}"),
                // Quoted keys and scalars, and their escapes.
                Arguments.of(
                        "\"a b\": 'it''s'\n'c': \"\\\"\\\\\\/\\n\\t\\r\\b\\f\\0\\ \\u0041\"\n",
                        "{\"a b\":\"it's\",\"c\":\"\"\\/\n\t\r\b\f\0 A\"}"),
                Arguments.of("a: x#y\nb: 'q' # c\n", "{\"a\":\"x#y\",\"b\":\"q\"}"),
                // Plain scalars over several lines fold: a line break is a space, a blank line a break.
                Arguments.of("a: one\n  two\n\n  three\nb: c\n", "{\"a\":\"one two\nthree\",\"b\":\"c\"}"),
                Arguments.of("- one\n  two\n  # comment\n- three\n", "[\"one two\",\"three\"]"),
                Arguments.of("root scalar\nover lines\n", "\"root scalar over lines\""),
                // Literal and folded block scalars, and how each keeps its trailing line breaks.
                Arguments.of("a: |\n  x\n\n   y\n  z\nb: 1\n", "{\"a\":\"x\n\n y\nz\n\",\"b\":1}"),
                Arguments.of("a: |-\n  x\n  y\n", "{\"a\":\"x\ny\"}"),
                Arguments.of("a: |+\n  x\n\n\nb: 1\n", "{\"a\":\"x\n\n\n\",\"b\":1}"),
                Arguments.of("a: >\n\n  x\n  y\n\n  z\n   more\n  w\n", "{\"a\":\"\nx y\nz\n more\nw\n\"}"),
                Arguments.of("a: >-\n  x\n\n\n  y", "{\"a\":\"x\n\ny\"}"),
                Arguments.of("a: |\nb: 1\n", "{\"a\":\"\",\"b\":1}"),
                Arguments.of("a: |+\n\n", "{\"a\":\"\n\"}"),
                // Flow collections, over lines, with comments, empty values and JSON among them.
                Arguments.of(
                        "{\"g\": [\n  {\"n\": \"x\", \"r\": [1, 2.50, true]}, # one\n  {}\n], k: , m: [ ], o: {p: q r,\n s: t}}\n",
                        "{\"g\":[{\"n\":\"x\",\"r\":[1,2.5,true]},{}],\"k\":null,\"m\":[],\"o\":{\"p\":\"q r\",\"s\":\"t\"}}"),
                Arguments.of("[a:b, http://x, 'q', [c]]\n", "[\"a:b\",\"http://x\",\"q\",[\"c\"]]"),
                Arguments.of("[a\n  b, c]\n", "[\"a b\",\"c\"]"),
                Arguments.of("{a: b}\n", "{\"a\":\"b\"}"),
                Arguments.of("{'a': , b: }\n", "{\"a\":null,\"b\":null}"),
                Arguments.of("[a#b, c #d\n]\n", "[\"a#b\",\"c\"]"),
                // Keys as YAML writes them: after a marker's look-alike, with a colon or a hash inside,
                // with a tab after, and empty.
                Arguments.of("---x: 1\n", "{\"---x\":1}"),
                Arguments.of("a:b: 1\na#b:\t2\n", "{\"a:b\":1,\"a#b\":2}"),
                Arguments.of(": 1\n", "{\"\":1}"),
                Arguments.of("x #c\n", "\"x\""),
                Arguments.of("-5\n", "-5"),
                Arguments.of("a:\n- x\nb: y\n", "{\"a\":[\"x\"],\"b\":\"y\"}"),
                Arguments.of("a: x\n  ", "{\"a\":\"x\"}"),
                Arguments.of("a: |\n  x\n  \ty\n", "{\"a\":\"x\n\ty\n\"}"),
                Arguments.of("a: 'x\\y'\n", "{\"a\":\"x\\y\"}"),
                Arguments.of("{a: 1 b}\n", "{\"a\":\"1 b\"}"),
                Arguments.of("- a\n  - b\n", "[\"a - b\"]"),
                // A plain scalar is typed as the core schema types it.
                Arguments.of(
                        "[~, null, Null, NULL, true, False, 007, -3, +4, 0o17, 0x1F, 1.50, .5, 1e3, -0.0, 1.2.3, 0b1, yes]\n",
                        "[null,null,null,null,true,false,7,-3,4,15,31,1.5,0.5,1000,0,\"1.2.3\",\"0b1\",\"yes\"]"));
    }

    @ParameterizedTest
    @MethodSource("documents")
    void aDocumentHoldsWhatYamlReadsItAs(String text, String expected) {
        assertThat(read(text)).isEqualTo(expected);
    }

    @ParameterizedTest
    @ValueSource(
            strings = {
                "a: 1\na: 2\n",
                "{a: 1, a: 2}\n",
                "a: 1\n  b: 2\n",
                "a: [1]\n  b\n",
                "- [a]\n  b\n",
                "a: 1\nb\n",
                "a: [1] x\n",
                "a: 'x' y\n",
                "a: 'x\n",
                "a: \"x\n",
                "a: \"\\q\"\n",
                "a: \"\\u00G1\"\n",
                "a: \"\\u0",
                "a: &x 1\n",
                "a: *x\n",
                "a: !x 1\n",
                "a: |2\n  x\n",
                "&x a: 1\n",
                "{a 1}\n",
                "{a: 1 b: 2}\n",
                "[&x]\n",
                "{: 1}\n",
                "[a, b\n",
                "--- a\n--- b\n",
                "a: 1\n...\n",
                "%YAML 1.2\n",
                "a: 1\n- b\n",
                "a: |\n    x\n  y\n",
                "\"a\":b\n",
                "\"a\" b\n"
            })
    void textThatIsNotTheYamlItReadsHoldsNothing(String text) {
        assertThat(DataFile.read(text)).isEmpty();
    }

    @Test
    void aFilesGroupsAreTheListItsTopLevelMappingHoldsUnderGroups() {
        assertThat(DataFile.groups("x: 1\ngroups:\n  - name: a\n").map(DataFileTest::json))
                .contains("[{\"name\":\"a\"}]");
        assertThat(DataFile.groups("- groups: [a]\n")).isEmpty();
        assertThat(DataFile.groups("groups: a\n")).isEmpty();
        assertThat(DataFile.groups("groups: []\n")).isEmpty();
        assertThat(DataFile.groups("rules: [a]\n")).isEmpty();
        assertThat(DataFile.groups("groups: [a\n")).isEmpty();
    }
}
