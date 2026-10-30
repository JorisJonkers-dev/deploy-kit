package dev.jorisjonkers.deploykit.emf.syntax.schema;

import static org.assertj.core.api.Assertions.assertThat;

import dev.jorisjonkers.deploykit.emf.syntax.PlatformIntentStandaloneSetup;
import dev.jorisjonkers.deploykit.emf.syntax.ProjectIntentStandaloneSetup;
import dev.jorisjonkers.deploykit.emf.syntax.schema.Shapes.Issue;
import java.util.List;
import org.eclipse.xtext.Grammar;
import org.eclipse.xtext.IGrammarAccess;
import org.junit.jupiter.api.Test;

/** The shape check: each case is a document in and the refusals it earns out, by JSON pointer. */
class ShapesTest {

    private static final Grammar PROJECT = new ProjectIntentStandaloneSetup()
            .createInjectorAndDoEMFRegistration()
            .getInstance(IGrammarAccess.class)
            .getGrammar();

    private static final Grammar PLATFORM = new PlatformIntentStandaloneSetup()
            .createInjectorAndDoEMFRegistration()
            .getInstance(IGrammarAccess.class)
            .getGrammar();

    private static final String HEAD =
            "apiVersion: a\nkind: Project\nschemaVersion: 1\nproject: p\nowner: o\napplications:\n  - id: x\n";

    private static final String PROCESS =
            "    processes:\n      - name: n\n        lifecycle: application\n        image: i\n        runtime: node\n";

    /** The paths refused in a project whose one process also holds {@code extra}, indented to the process. */
    private static List<String> paths(String extra) {
        return check(HEAD + PROCESS + extra).stream().map(Issue::path).toList();
    }

    private static List<Issue> check(String text) {
        return Shapes.check(text, PROJECT);
    }

    private static String indented(String lines) {
        return lines.lines().map(l -> "        " + l + "\n").reduce("", String::concat);
    }

    @Test
    void aDocumentThatHoldsRefusesNothing() {
        assertThat(check(HEAD + PROCESS)).isEmpty();
    }

    @Test
    void anUnknownKeyIsRefusedAtItself() {
        assertThat(check(HEAD.replace("id: x\n", "id: x\n    colour: blue\n    size: 3\n") + PROCESS))
                .containsExactlyInAnyOrder(
                        new Issue("/applications/0/colour", "unknown field `colour`"),
                        new Issue("/applications/0/size", "unknown field `size`"));
    }

    @Test
    void aMissingKeyIsRefusedAtTheNodeItBelongsTo() {
        assertThat(check(HEAD + PROCESS.replace("        image: i\n", "")))
                .containsExactly(new Issue("/applications/0/processes/0/image", "required field `image` is missing"));
        assertThat(check(HEAD.replace("owner: o\n", "") + PROCESS))
                .containsExactly(new Issue("/owner", "required field `owner` is missing"));
    }

    @Test
    void anOptionalKeyMayBeAbsent() {
        assertThat(check(HEAD.replace("id: x\n", "id: x\n    description: d\n") + PROCESS))
                .isEmpty();
    }

    @Test
    void anEnumValueOutsideItsVocabularyIsRefusedAtTheValue() {
        assertThat(check(HEAD + PROCESS.replace("runtime: node", "runtime: cobol")))
                .containsExactly(new Issue(
                        "/applications/0/processes/0/runtime", "does not match any shape the schema allows here"));
        assertThat(paths("")).isEmpty();
        assertThat(check(HEAD + PROCESS.replace("runtime: node", "runtime: \"node\"")))
                .hasSize(1);
        assertThat(check(HEAD + PROCESS.replace("runtime: node", "runtime: {a: b}")))
                .hasSize(1);
    }

    @Test
    void aNumberMustBeAnUnquotedInteger() {
        String at = "/applications/0/processes/0/provides/http";
        assertThat(paths(indented("provides:\n  http: 8080"))).isEmpty();
        assertThat(paths(indented("provides:\n  http: \"8080\""))).containsExactly(at);
        assertThat(paths(indented("provides:\n  http: abc"))).containsExactly(at);
        assertThat(paths(indented("provides:\n  http: 80a"))).containsExactly(at);
        assertThat(paths(indented("provides:\n  http: {a: 1}"))).containsExactly(at);
    }

    @Test
    void aSurfaceNameIsAnyKeyAndEscapedInThePointer() {
        assertThat(paths(indented("provides:\n  \"a/b\": x\n  \"c~d\": y")))
                .containsExactlyInAnyOrder(
                        "/applications/0/processes/0/provides/a~1b", "/applications/0/processes/0/provides/c~0d");
        assertThat(paths(indented("provides: [a]"))).containsExactly("/applications/0/processes/0/provides");
    }

    @Test
    void aBooleanIsTrueOrFalseUnquoted() {
        String sidecar = "sidecars:\n  - name: s\n    image: i\n    memory: 1Mi\n    cpu: 1m\n    init: ";
        assertThat(paths(indented(sidecar + "true"))).isEmpty();
        assertThat(paths(indented(sidecar + "false"))).isEmpty();
        assertThat(paths(indented(sidecar + "maybe"))).containsExactly("/applications/0/processes/0/sidecars/0/init");
        assertThat(paths(indented(sidecar + "\"true\""))).hasSize(1);
        assertThat(paths(indented(sidecar + "{}"))).hasSize(1);
    }

    @Test
    void aValueOfNoShapeIsRefusedOnceAtTheValue() {
        String at = "/applications/0/processes/0/probes";
        assertThat(paths(indented("probes: none"))).isEmpty();
        assertThat(paths(indented("probes: some"))).containsExactly(at);
        assertThat(paths(indented("probes: [a]"))).containsExactly(at);
        assertThat(paths(indented("probes:\n  readiness: { path: /x, port: 1 }\n  liveness: { tcp: 2 }")))
                .isEmpty();
    }

    @Test
    void aMappingThatMatchesNoFormIsRefusedByTheClosestOne() {
        assertThat(paths(indented("probes:\n  readiness: { path: /x }")))
                .containsExactly("/applications/0/processes/0/probes/readiness/port");
        assertThat(paths(indented("probes:\n  readiness: { tcp: 1, path: /x }")))
                .containsExactly("/applications/0/processes/0/probes/readiness/path");
        assertThat(paths(indented("probes:\n  readiness: { path: /x, port: 1, extra: 1 }")))
                .containsExactly("/applications/0/processes/0/probes/readiness/extra");
    }

    @Test
    void ofTwoEquallyCloseFormsTheFirstTheGrammarWritesRefuses() {
        assertThat(check(HEAD + PROCESS + indented("assets:\n  - from: a")))
                .containsExactly(new Issue(
                        "/applications/0/processes/0/assets/0/mountAt", "required field `mountAt` is missing"));
    }

    @Test
    void aSequenceIsExpectedWhereTheGrammarWritesADash() {
        assertThat(paths(indented("command: foo"))).containsExactly("/applications/0/processes/0/command");
        assertThat(check(HEAD + PROCESS + indented("command: foo")))
                .containsExactly(new Issue("/applications/0/processes/0/command", "expected a sequence"));
        assertThat(paths(indented("command: [a, b]"))).isEmpty();
        assertThat(paths(indented("command:\n  - a\n  - b"))).isEmpty();
        assertThat(paths(indented("command: [{a: 1}]"))).containsExactly("/applications/0/processes/0/command/0");
    }

    @Test
    void aSequenceItemIsRefusedByItsIndex() {
        assertThat(paths(indented("sidecars:\n  - name: a\n    image: i\n    memory: 1\n    cpu: 1\n  - name: b")))
                .containsExactlyInAnyOrder(
                        "/applications/0/processes/0/sidecars/1/image",
                        "/applications/0/processes/0/sidecars/1/memory",
                        "/applications/0/processes/0/sidecars/1/cpu");
    }

    @Test
    void aWordMayStandWhereAFormIsOneKeyword() {
        String migration = "    migration: ";
        assertThat(check(HEAD + migration + "self\n" + PROCESS)).isEmpty();
        assertThat(check(HEAD + migration + "none\n" + PROCESS)).isEmpty();
        assertThat(check(HEAD + migration + "\"self\"\n" + PROCESS)).hasSize(1);
        assertThat(check(HEAD + migration + "other\n" + PROCESS))
                .containsExactly(
                        new Issue("/applications/0/migration", "does not match any shape the schema allows here"));
        assertThat(check(HEAD + migration + "\n      changelog: c.xml\n" + PROCESS))
                .isEmpty();
        assertThat(paths(indented("rollback: forward-only"))).isEmpty();
        assertThat(paths(indented("rollback: back"))).containsExactly("/applications/0/processes/0/rollback");
    }

    @Test
    void aPlainScalarMayStandWhereAFormIsOnlyAValue() {
        assertThat(paths(indented("writablePaths: [/tmp, {path: /a, memory: 1Mi}]")))
                .isEmpty();
        assertThat(paths(indented("writablePaths: [{path: /a}]")))
                .containsExactly("/applications/0/processes/0/writablePaths/0/memory");
    }

    @Test
    void aCrossReferenceIsAScalar() {
        String exposure = "    l4Exposure:\n      - {address: a, port: 1, protocol: tcp, process: p, surface: s}\n";
        assertThat(check(HEAD + exposure + PROCESS)).isEmpty();
        assertThat(check(HEAD + exposure.replace("process: p", "process: [p]") + PROCESS))
                .containsExactly(new Issue(
                        "/applications/0/l4Exposure/0/process", "does not match any shape the schema allows here"));
    }

    @Test
    void aGroupNestedInAKeyIsWalked() {
        String grant =
                "secrets:\n  - engine: database\n    role: r\n    delivery: env\n    rotation: {tolerates: restart}";
        assertThat(paths(indented(grant))).isEmpty();
        assertThat(paths(indented(grant.replace("role: r\n    ", "")))).hasSize(1);
        assertThat(paths(indented(grant.replace("database", "other")))).hasSize(1);
    }

    @Test
    void aRateLimitAllowsAtLeastOneRequestOverAWholePeriod() {
        String route = "    exposure:\n      - name: e\n        host: h\n        audience: anonymous\n        routes:\n"
                + "          - {path: /, match: exact, process: p, surface: s, rateLimit: %s}\n";
        String at = "/applications/0/exposure/0/routes/0/rateLimit";
        assertThat(check(HEAD + route.formatted("{requests: 1, per: 1h}") + PROCESS))
                .isEmpty();
        assertThat(check(HEAD + route.formatted("{requests: 10, per: 30s}") + PROCESS))
                .isEmpty();
        assertThat(check(HEAD + route.formatted("{requests: 10, per: 5m}") + PROCESS))
                .isEmpty();
        assertThat(check(HEAD + route.formatted("{requests: 0, per: 1h}") + PROCESS))
                .containsExactly(new Issue(at + "/requests", "`requests` is out of range"));
        assertThat(check(HEAD + route.formatted("{requests: 00, per: 1h}") + PROCESS))
                .hasSize(1);
        assertThat(check(HEAD + route.formatted("{requests: 10, per: 500ms}") + PROCESS))
                .containsExactly(new Issue(at + "/per", "`per` is out of range"));
        assertThat(check(HEAD + route.formatted("{requests: 10, per: 0s}") + PROCESS))
                .hasSize(1);
        assertThat(check(HEAD + route.formatted("{requests: 10, per: 1d}") + PROCESS))
                .hasSize(1);
        assertThat(check(HEAD + route.formatted("{requests: 10}") + PROCESS))
                .containsExactly(new Issue(at + "/per", "required field `per` is missing"));
        assertThat(check(HEAD + route.formatted("{requests: abc, per: 1h}") + PROCESS))
                .containsExactly(new Issue(at + "/requests", "does not match any shape the schema allows here"));
        assertThat(check(HEAD + route.formatted("{requests: 10, per: {a: b}}") + PROCESS))
                .containsExactly(new Issue(at + "/per", "does not match any shape the schema allows here"));
    }

    @Test
    void aConstraintOnlyAppliesToTheKeyItNames() {
        String route = "    exposure:\n      - name: e\n        host: h\n        audience: anonymous\n        routes:\n"
                + "          - {path: /, match: exact, process: p, surface: s, rateLimit: {requests: 5, per: 1h}}\n";
        assertThat(check(HEAD + route + PROCESS)).isEmpty();
        assertThat(check(HEAD + route.replace("path: /,", "path: 0,") + PROCESS))
                .isEmpty();
    }

    @Test
    void aDocumentOutsideTheSubsetIsRefusedOnceAtTheRoot() {
        assertThat(check(HEAD + PROCESS.replace("runtime: node", "runtime: !!str node")))
                .containsExactly(new Issue("", "outside the YAML subset: anchor, alias or tag: !!str node"));
        assertThat(check("a: 1\n---\nb: 2"))
                .containsExactly(new Issue("", "outside the YAML subset: more than one document"));
        assertThat(check("")).containsExactly(new Issue("", "outside the YAML subset: no document"));
        assertThat(check("")).extracting(Issue::message).containsExactly("outside the YAML subset: no document");
    }

    @Test
    void aDocumentTheReaderCannotReadLeavesTheVerdictToTheParser() {
        assertThat(check("applications: {a: 1")).isEmpty();
    }

    @Test
    void aSequenceAtTheRootIsNoProject() {
        assertThat(check("- a\n- b")).containsExactly(new Issue("", "does not match any shape the schema allows here"));
        assertThat(check("a")).hasSize(1);
    }

    @Test
    void aPlatformKeyLiteralIsAnAcceptedValue() {
        List<Issue> issues = Shapes.check(
                "l4Addresses:\n  a:\n    kind: pool\n    site: s\n    range: r\n  b:\n    kind: node\n    node: n\n"
                        + "  c:\n    kind: other\n    node: n\n  d:\n    kind: \"pool\"\n    site: s\n    range: r\n",
                PLATFORM);
        assertThat(issues.stream().map(Issue::path))
                .contains("/l4Addresses/c/kind", "/l4Addresses/d/kind")
                .doesNotContain("/l4Addresses/a/kind", "/l4Addresses/b/kind", "/l4Addresses/a", "/l4Addresses/b");
    }
}
