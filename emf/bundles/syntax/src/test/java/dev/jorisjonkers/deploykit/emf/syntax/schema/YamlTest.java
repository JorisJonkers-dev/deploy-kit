package dev.jorisjonkers.deploykit.emf.syntax.schema;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.stream.Collectors;
import org.junit.jupiter.api.Test;

/** The YAML subset, read into a tree: each case is a document in and the tree it reads as out. */
class YamlTest {

    /** A node as one line: {@code {k=v}}, {@code [a,b]}, a scalar's text, quoted ones in single quotes. */
    private static String show(Yaml.Node node) {
        if (node.isMap()) {
            return node.map.entrySet().stream()
                    .map(e -> e.getKey() + "=" + show(e.getValue()))
                    .collect(Collectors.joining(",", "{", "}"));
        }
        if (node.isList()) {
            return node.list.stream().map(YamlTest::show).collect(Collectors.joining(",", "[", "]"));
        }
        return node.quoted ? "'" + node.text + "'" : node.text;
    }

    private static String read(String text) {
        return show(Yaml.read(text));
    }

    @Test
    void aBlockMappingNestsByIndentation() {
        assertThat(read("a: 1\nb:\n  c: x\n  d: y\ne: z")).isEqualTo("{a=1,b={c=x,d=y},e=z}");
    }

    @Test
    void aNodeKnowsWhichKindItIs() {
        Yaml.Node map = Yaml.read("a: [b]");
        assertThat(map.isMap()).isTrue();
        assertThat(map.isList()).isFalse();
        assertThat(map.isScalar()).isFalse();
        Yaml.Node list = map.map.get("a");
        assertThat(list.isList()).isTrue();
        assertThat(list.isMap()).isFalse();
        Yaml.Node scalar = list.list.get(0);
        assertThat(scalar.isScalar()).isTrue();
        assertThat(scalar.isMap()).isFalse();
        assertThat(scalar.isList()).isFalse();
    }

    @Test
    void aBlockSequenceHoldsScalarsMappingsAndSequences() {
        assertThat(read("a:\n  - x\n  - k: 1\n    l: 2\n  - - p\n    - q\n  -\n    m: 3"))
                .isEqualTo("{a=[x,{k=1,l=2},[p,q],{m=3}]}");
    }

    @Test
    void aSequenceMayShareItsKeysIndentation() {
        assertThat(read("a:\n- x\n- y\nb: 1")).isEqualTo("{a=[x,y],b=1}");
    }

    @Test
    void aDashAloneOnTheLastLineIsAnEmptyScalar() {
        assertThat(read("a:\n  -")).isEqualTo("{a=[]}");
        assertThat(read("a:\n  - x\n  -\nb: 1")).isEqualTo("{a=[x,],b=1}");
    }

    @Test
    void aKeyWithNothingAfterItIsAnEmptyScalar() {
        assertThat(read("a:\nb: 1")).isEqualTo("{a=,b=1}");
        assertThat(read("a:")).isEqualTo("{a=}");
    }

    @Test
    void aSequenceAtTheSameIndentationOnlyBelongsToItsKey() {
        assertThat(read("a:\nb:\n- x")).isEqualTo("{a=,b=[x]}");
    }

    @Test
    void commentsAreDroppedExceptInsideQuotes() {
        assertThat(read("# first\na: 1 # trailing\nb: \"x # y\"\nc: 'p # q'\nd: it's # note\ne: a#b"))
                .isEqualTo("{a=1,b='x # y',c='p # q',d=it's,e=a#b}");
    }

    @Test
    void aQuoteMidTokenOpensNoString() {
        assertThat(read("a: it's\nb: 'x'")).isEqualTo("{a=it's,b='x'}");
    }

    @Test
    void aQuoteAfterAnyDelimiterOpensAString() {
        assertThat(read("a: [\"x # y\"]\nb: {k: 'p # q'}")).isEqualTo("{a=['x # y'],b={k='p # q'}}");
    }

    @Test
    void aQuotedKeyIsUnquoted() {
        assertThat(read("\"a b\": 1\n'c': 2")).isEqualTo("{a b=1,c=2}");
    }

    @Test
    void anUnclosedQuotedKeyIsNotAMappingEntry() {
        assertThatThrownBy(() -> Yaml.read("\"abc: 1"))
                .isInstanceOf(Yaml.Unsupported.class)
                .hasMessage("not a mapping entry: \"abc: 1");
    }

    @Test
    void aColonWithoutASpaceIsNotAKey() {
        assertThatThrownBy(() -> Yaml.read("a:b"))
                .isInstanceOf(Yaml.Unsupported.class)
                .hasMessage("not a mapping entry: a:b");
        assertThatThrownBy(() -> Yaml.read("a")).isInstanceOf(Yaml.Unsupported.class);
    }

    @Test
    void aKeyMayEndTheLine() {
        assertThat(read("a:\n  b:")).isEqualTo("{a={b=}}");
    }

    @Test
    void aFlowCollectionOpensNoKey() {
        assertThat(read("- {a: 1}\n- [b]")).isEqualTo("[{a=1},[b]]");
    }

    @Test
    void flowMappingsAndSequencesNestAndQuote() {
        assertThat(read("a: { b: 1, c: [x, \"y, z\", 'w'], d: {e: f}, \"g\": h }"))
                .isEqualTo("{a={b=1,c=[x,'y, z','w'],d={e=f},g=h}}");
        assertThat(read("a: {}\nb: []")).isEqualTo("{a={},b=[]}");
        assertThat(read("a: {b: 1,}\nc: [x,]")).isEqualTo("{a={b=1},c=[x]}");
    }

    /**
     * A colon not followed by a space ends no key and opens no mapping, in a flow sequence as in a
     * block one: an item such as {@code --listen=:9100} is one plain scalar, as YAML reads it.
     */
    @Test
    void aColonInsideASequenceItemIsPartOfItsScalar() {
        assertThat(read("a: [--listen=:9100, x:y]")).isEqualTo("{a=[--listen=:9100,x:y]}");
        assertThat(read("a:\n  - --listen=:9100")).isEqualTo("{a=[--listen=:9100]}");
        assertThat(read("a: {b: [--l=:1]}")).isEqualTo("{a={b=[--l=:1]}}");
    }

    @Test
    void aFlowCollectionMayRunOverSeveralLines() {
        assertThat(read("a: {b: 1,\n   c: 2}\nd: 3")).isEqualTo("{a={b=1,c=2},d=3}");
        assertThat(read("a: [\"{\", x\n  ]\nd: 3")).isEqualTo("{a=['{',x],d=3}");
        assertThat(read("a: ['}'\n]\nd: 3")).isEqualTo("{a=['}'],d=3}");
    }

    @Test
    void aFoldedScalarJoinsItsIndentedLines() {
        assertThat(read("a: >\n  one\n  two\nb: |-\n  three\nc: >+\n  four\nd: 1"))
                .isEqualTo("{a=one two,b=three,c=four,d=1}");
        assertThat(read("a: >\nb: 1")).isEqualTo("{a=,b=1}");
    }

    @Test
    void aSequenceItemMayBeAFlowCollectionOrScalar() {
        assertThat(read("- [a, b]\n- c\n- \"d\"")).isEqualTo("[[a,b],c,'d']");
    }

    @Test
    void aLeadingDocumentMarkerIsAllowed() {
        assertThat(read("---\na: 1")).isEqualTo("{a=1}");
        assertThat(read("--- \na: 1")).isEqualTo("{a=1}");
    }

    @Test
    void aSecondDocumentIsOutsideTheSubset() {
        assertThatThrownBy(() -> Yaml.read("a: 1\n---\nb: 2"))
                .isInstanceOf(Yaml.Unsupported.class)
                .hasMessage("more than one document");
        assertThatThrownBy(() -> Yaml.read("a: 1\n--- x\nb: 2"))
                .isInstanceOf(Yaml.Unsupported.class)
                .hasMessage("more than one document");
        assertThatThrownBy(() -> Yaml.read("a: 1\n..."))
                .isInstanceOf(Yaml.Unsupported.class)
                .hasMessage("more than one document");
    }

    @Test
    void aFileWithNoContentHoldsNoDocument() {
        assertThatThrownBy(() -> Yaml.read(""))
                .isInstanceOf(Yaml.Unsupported.class)
                .hasMessage("no document");
        assertThatThrownBy(() -> Yaml.read("# only\n\n---\n"))
                .isInstanceOf(Yaml.Unsupported.class)
                .hasMessage("no document");
    }

    @Test
    void anAnchorAnAliasAndATagAreOutsideTheSubset() {
        assertThatThrownBy(() -> Yaml.read("a: &x 1"))
                .isInstanceOf(Yaml.Unsupported.class)
                .hasMessage("anchor, alias or tag: &x 1");
        assertThatThrownBy(() -> Yaml.read("a: *x"))
                .isInstanceOf(Yaml.Unsupported.class)
                .hasMessage("anchor, alias or tag: *x");
        assertThatThrownBy(() -> Yaml.read("a: !!str x"))
                .isInstanceOf(Yaml.Unsupported.class)
                .hasMessage("anchor, alias or tag: !!str x");
        assertThatThrownBy(() -> Yaml.read("a: [&x 1]")).isInstanceOf(Yaml.Unsupported.class);
    }

    @Test
    void contentBelowTheRootIndentationIsUnexpected() {
        assertThatThrownBy(() -> Yaml.read("a: 1\n  b: 2"))
                .isInstanceOf(Yaml.Unsupported.class)
                .hasMessage("unexpected content");
    }

    @Test
    void trailingSpacesAreDropped() {
        assertThat(read("a: x   \nb:   \n  c: y  ")).isEqualTo("{a=x,b={c=y}}");
    }

    @Test
    void windowsLineEndingsRead() {
        assertThat(read("a: 1\r\nb: 2\r\n")).isEqualTo("{a=1,b=2}");
    }

    @Test
    void aTextSequenceItemReadsAsTheTextAfterItsDash() {
        assertThat(read("-   x\n-  k: 1\n   l: 2")).isEqualTo("[x,{k=1,l=2}]");
    }

    @Test
    void aKeyMayStartWithADashThatIsNoSequence() {
        assertThat(read("-x: 1\n-y: 2")).isEqualTo("{-x=1,-y=2}");
    }

    @Test
    void aQuotedKeyMustBeFollowedByItsColon() {
        assertThatThrownBy(() -> Yaml.read("\"abc\"")).isInstanceOf(Yaml.Unsupported.class);
        assertThatThrownBy(() -> Yaml.read("\"abc\" x")).isInstanceOf(Yaml.Unsupported.class);
    }

    @Test
    void aSequenceCannotFollowAMappingAtTheSameIndentationUnlessItBelongsToAKey() {
        assertThatThrownBy(() -> Yaml.read("a: 1\n- b"))
                .isInstanceOf(Yaml.Unsupported.class)
                .hasMessage("unexpected content");
    }

    @Test
    void aKeyWithNothingBelowItBeforeALessIndentedLineIsEmpty() {
        assertThat(read("a:\n  b:\nc: 1")).isEqualTo("{a={b=},c=1}");
    }

    @Test
    void aFoldedScalarMayEndTheFile() {
        assertThat(read("a: >\n  x")).isEqualTo("{a=x}");
    }

    @Test
    void aQuoteThatDoesNotMatchLeavesTheTextAsWritten() {
        assertThat(read("a: \"abc")).isEqualTo("{a='\"abc'}");
        assertThat(read("a: 'abc")).isEqualTo("{a=''abc'}");
        assertThat(read("a: \"x'")).isEqualTo("{a='\"x''}");
        assertThat(read("a: 'x\"")).isEqualTo("{a=''x\"'}");
        assertThat(read("a: \"")).isEqualTo("{a='\"'}");
        assertThat(read("a: ''")).isEqualTo("{a=''}");
    }

    @Test
    void aFlowCollectionMayHoldOnlySpaces() {
        assertThat(read("a: { }\nb: [ ]")).isEqualTo("{a={},b=[]}");
        assertThat(Yaml.read("a: [ ]").map.get("a").list).isEmpty();
    }

    @Test
    void spacesMayStandBeforeACommaOrAfterATrailingOne() {
        assertThat(read("a: {b: [x] , c: d}")).isEqualTo("{a={b=[x],c=d}}");
        assertThat(read("a: {b: c, }\nd: [x, ]")).isEqualTo("{a={b=c},d=[x]}");
    }

    @Test
    void aFlowValueEndsItsOwnLine() {
        assertThat(read("a: [x]\nb: y")).isEqualTo("{a=[x],b=y}");
    }

    @Test
    void aHashGluedToAWordOpensNoComment() {
        assertThat(read("a: b# c")).isEqualTo("{a=b# c}");
        assertThat(read("a: b #c")).isEqualTo("{a=b}");
    }

    @Test
    void anEmptyDashBeforeASiblingIsAnEmptyItem() {
        assertThat(read("-\n- b")).isEqualTo("[,b]");
    }

    @Test
    void aKeyMayBeEmpty() {
        assertThat(read(": x\na: 1")).isEqualTo("{=x,a=1}");
        assertThat(read("- : x")).isEqualTo("[{=x}]");
    }

    @Test
    void aFlowCollectionCannotStandForAKey() {
        assertThatThrownBy(() -> Yaml.read("a: 1\n{b: 2}")).isInstanceOf(Yaml.Unsupported.class);
    }
}
