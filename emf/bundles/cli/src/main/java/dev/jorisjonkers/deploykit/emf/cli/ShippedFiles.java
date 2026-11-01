package dev.jorisjonkers.deploykit.emf.cli;

import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.AlertRules;
import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.Application;
import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.Dashboard;
import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.Platform;
import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.Project;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.function.Function;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * The files an Application ships beside its project file for the monitoring stack to load: its
 * dashboards and its alert-rule groups (spec/v1/10-project-intent.md#observability). Each must be
 * there and hold what its loader keys it by, and no two dashboards of the estate share a uid.
 */
final class ShippedFiles {

    static final String DASHBOARD_NOT_FOUND = "E_DASHBOARD_NOT_FOUND";
    static final String DASHBOARD_WITHOUT_UID = "E_DASHBOARD_WITHOUT_UID";
    static final String DUPLICATE_DASHBOARD_UID = "E_DUPLICATE_DASHBOARD_UID";
    static final String NO_DASHBOARD_POLICY = "E_NO_DASHBOARD_POLICY";
    static final String ALERT_RULES_NOT_FOUND = "E_ALERT_RULES_NOT_FOUND";
    static final String ALERT_RULES_WITHOUT_GROUPS = "E_ALERT_RULES_WITHOUT_GROUPS";

    /** A dashboard of one project whose file holds a uid, by where it is written. */
    record Placed(String document, String path, String uid) {}

    private ShippedFiles() {}

    /**
     * Every dashboard and rule-group file {@code project} names that {@code read} does not hold, or
     * that holds no uid or no groups; each dashboard that holds a uid is added to {@code placed}.
     */
    static List<Diagnostic> check(
            Project project, String document, Function<String, Optional<String>> read, List<Placed> placed) {
        List<Diagnostic> refusals = new ArrayList<>();
        for (Application application : project.getApplications()) {
            for (Dashboard dashboard : application.getDashboards()) {
                String path = Pointer.of(dashboard) + "/from";
                Optional<String> content = read.apply(dashboard.getFrom());
                Optional<String> uid = content.flatMap(TopLevel::uid);
                if (content.isEmpty()) {
                    refusals.add(new Diagnostic(
                            DASHBOARD_NOT_FOUND,
                            document,
                            path,
                            "no file " + dashboard.getFrom() + " is read beside the project file"));
                } else if (uid.isEmpty()) {
                    refusals.add(new Diagnostic(
                            DASHBOARD_WITHOUT_UID,
                            document,
                            path,
                            dashboard.getFrom() + " names no uid, so Grafana would key it by a value of its own"));
                } else {
                    placed.add(new Placed(document, path, uid.get()));
                }
            }
            for (AlertRules rules : application.getAlertRules()) {
                String path = Pointer.of(rules) + "/from";
                Optional<String> content = read.apply(rules.getFrom());
                if (content.isEmpty()) {
                    refusals.add(new Diagnostic(
                            ALERT_RULES_NOT_FOUND,
                            document,
                            path,
                            "no file " + rules.getFrom() + " is read beside the project file"));
                } else if (DataFile.groups(content.get()).isEmpty()) {
                    refusals.add(new Diagnostic(
                            ALERT_RULES_WITHOUT_GROUPS,
                            document,
                            path,
                            rules.getFrom() + " holds no list of rule groups under `groups`"));
                }
            }
        }
        return refusals;
    }

    /**
     * Every dashboard of the estate after the first that carries a uid already carried, and, where a
     * Platform document is read and names no Grafana, every dashboard, which would ship nowhere.
     */
    static List<Diagnostic> acrossTheEstate(List<Placed> placed, Optional<Platform> platform) {
        List<Diagnostic> refusals = new ArrayList<>();
        Set<String> seen = new HashSet<>();
        for (Placed dashboard : placed) {
            if (!seen.add(dashboard.uid())) {
                refusals.add(new Diagnostic(
                        DUPLICATE_DASHBOARD_UID,
                        dashboard.document(),
                        dashboard.path(),
                        "another dashboard of the estate already carries the uid " + dashboard.uid()));
            }
        }
        boolean shipsNowhere = platform.map(
                        p -> p.getTelemetry() == null || p.getTelemetry().getDashboards() == null)
                .orElse(false);
        if (shipsNowhere) {
            for (Placed dashboard : placed) {
                refusals.add(new Diagnostic(
                        NO_DASHBOARD_POLICY,
                        dashboard.document(),
                        dashboard.path(),
                        "the platform names no Grafana for a dashboard to ship to"));
            }
        }
        return refusals;
    }

    /**
     * The one top-level string a JSON document carries under a key, read by a parser just large enough
     * to tell a top-level key from a nested one and a document from text that is not JSON.
     */
    static final class TopLevel {
        /** A number, or one of the three words JSON spells a value with. */
        private static final Pattern LITERAL = Pattern.compile("true|false|null|-?\\d+(\\.\\d+)?([eE][-+]?\\d+)?");

        private final String text;
        private int at;

        private TopLevel(String text) {
            this.text = text;
        }

        /** The non-empty string the document's own `uid` holds, where it is a JSON object that has one. */
        static Optional<String> uid(String content) {
            TopLevel json = new TopLevel(content);
            try {
                json.space();
                if (json.peek() != '{') {
                    return Optional.empty();
                }
                Optional<String> uid = json.object(true);
                json.space();
                return json.at == json.text.length() ? uid.filter(value -> !value.isEmpty()) : Optional.empty();
            } catch (IllegalStateException | IndexOutOfBoundsException e) {
                return Optional.empty();
            }
        }

        private char peek() {
            return text.charAt(at);
        }

        private void space() {
            while (at < text.length() && Character.isWhitespace(text.charAt(at))) {
                at++;
            }
        }

        private void expect(char c) {
            space();
            if (text.charAt(at++) != c) {
                throw new IllegalStateException("expected " + c);
            }
        }

        /** An object; at the top level, the string its `uid` holds, if it holds one. */
        private Optional<String> object(boolean top) {
            expect('{');
            Optional<String> uid = Optional.empty();
            space();
            if (peek() == '}') {
                at++;
                return uid;
            }
            while (true) {
                space();
                String key = string();
                expect(':');
                space();
                if (top && key.equals("uid") && peek() == '"') {
                    uid = Optional.of(string());
                } else {
                    value();
                }
                space();
                char next = text.charAt(at++);
                if (next == '}') {
                    return uid;
                }
                if (next != ',') {
                    throw new IllegalStateException("expected , or }");
                }
            }
        }

        private void value() {
            space();
            char c = peek();
            if (c == '{') {
                object(false);
            } else if (c == '[') {
                at++;
                space();
                if (peek() == ']') {
                    at++;
                    return;
                }
                while (true) {
                    value();
                    space();
                    char next = text.charAt(at++);
                    if (next == ']') {
                        return;
                    }
                    if (next != ',') {
                        throw new IllegalStateException("expected , or ]");
                    }
                }
            } else if (c == '"') {
                string();
            } else {
                Matcher literal = LITERAL.matcher(text).region(at, text.length());
                if (!literal.lookingAt()) {
                    throw new IllegalStateException("not a value");
                }
                at = literal.end();
            }
        }

        private String string() {
            if (text.charAt(at++) != '"') {
                throw new IllegalStateException("expected a string");
            }
            StringBuilder out = new StringBuilder();
            while (true) {
                char c = text.charAt(at++);
                if (c == '"') {
                    return out.toString();
                }
                if (c == '\\') {
                    char escaped = text.charAt(at++);
                    if (escaped == 'u') {
                        try {
                            out.append((char) Integer.parseInt(text.substring(at, at + 4), 16));
                        } catch (NumberFormatException e) {
                            throw new IllegalStateException("a \\u escape needs four hex digits", e);
                        }
                        at += 4;
                    } else {
                        out.append(
                                switch (escaped) {
                                    case 'n' -> '\n';
                                    case 't' -> '\t';
                                    case 'r' -> '\r';
                                    case 'b' -> '\b';
                                    case 'f' -> '\f';
                                    default -> escaped;
                                });
                    }
                } else {
                    out.append(c);
                }
            }
        }
    }
}
