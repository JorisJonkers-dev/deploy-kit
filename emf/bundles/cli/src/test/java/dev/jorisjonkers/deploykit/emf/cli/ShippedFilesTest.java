package dev.jorisjonkers.deploykit.emf.cli;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.tuple;

import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.AlertRules;
import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.Application;
import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.Dashboard;
import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.Platform;
import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.Project;
import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.ProjectIntentFactory;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

/** The files an Application ships for the monitoring stack: there, keyed, and keyed once across the estate. */
class ShippedFilesTest {

    private static final ProjectIntentFactory MODEL = ProjectIntentFactory.eINSTANCE;

    /** A project of one Application per entry, each shipping the dashboards and rule files named. */
    private static Project project(List<String> dashboards, List<String> rules) {
        Project project = MODEL.createProject();
        project.setProject("refusals");
        Application application = MODEL.createApplication();
        application.setId("api");
        for (String from : dashboards) {
            Dashboard dashboard = MODEL.createDashboard();
            dashboard.setFrom(from);
            application.getDashboards().add(dashboard);
        }
        for (String from : rules) {
            AlertRules file = MODEL.createAlertRules();
            file.setFrom(from);
            application.getAlertRules().add(file);
        }
        project.getApplications().add(application);
        return project;
    }

    private static List<Diagnostic> check(
            Project project, Map<String, String> files, List<ShippedFiles.Placed> placed) {
        return ShippedFiles.check(
                project, "refusals.project.yml", from -> Optional.ofNullable(files.get(from)), placed);
    }

    @Test
    void aDashboardThatIsNotThereOrNamesNoUidIsRefusedAndOneThatDoesIsPlaced() {
        List<ShippedFiles.Placed> placed = new ArrayList<>();
        Project project = project(List.of("absent.json", "keyless.json", "board.json"), List.of());

        List<Diagnostic> refusals = check(
                project, Map.of("keyless.json", "{\"title\": \"x\"}", "board.json", "{\"uid\": \"board\"}"), placed);

        assertThat(refusals)
                .extracting(Diagnostic::code, Diagnostic::document, Diagnostic::path)
                .containsExactly(
                        tuple(
                                ShippedFiles.DASHBOARD_NOT_FOUND,
                                "refusals.project.yml",
                                "/applications/0/dashboards/0/from"),
                        tuple(
                                ShippedFiles.DASHBOARD_WITHOUT_UID,
                                "refusals.project.yml",
                                "/applications/0/dashboards/1/from"));
        assertThat(refusals.get(0).message()).isEqualTo("no file absent.json is read beside the project file");
        assertThat(refusals.get(1).message())
                .isEqualTo("keyless.json names no uid, so Grafana would key it by a value of its own");
        assertThat(placed)
                .containsExactly(
                        new ShippedFiles.Placed("refusals.project.yml", "/applications/0/dashboards/2/from", "board"));
    }

    @Test
    void aRuleFileThatIsNotThereOrHoldsNoGroupsIsRefused() {
        Project project = project(List.of(), List.of("absent.yaml", "rules.yaml", "groups.yaml"));

        List<Diagnostic> refusals = check(
                project,
                Map.of("rules.yaml", "rules:\n  - alert: ApiDown\n", "groups.yaml", "groups:\n  - name: api\n"),
                new ArrayList<>());

        assertThat(refusals)
                .extracting(Diagnostic::code, Diagnostic::path, Diagnostic::message)
                .containsExactly(
                        tuple(
                                ShippedFiles.ALERT_RULES_NOT_FOUND,
                                "/applications/0/alertRules/0/from",
                                "no file absent.yaml is read beside the project file"),
                        tuple(
                                ShippedFiles.ALERT_RULES_WITHOUT_GROUPS,
                                "/applications/0/alertRules/1/from",
                                "rules.yaml holds no list of rule groups under `groups`"));
    }

    @ParameterizedTest
    @ValueSource(
            strings = {
                "groups:\n  - name: api\n",
                "groups:\n- name: api\n",
                "groups: # the rule groups\n\n  # first\n  - name: api\n",
                "groups: [ {name: api} ]\n",
                "# rules\ngroups:\n  - name: api\n",
                "  groups:\n  - name: api\n",
                "{\n  \"groups\": [\n    {\"name\": \"api\"}\n  ]\n}\n"
            })
    void aListUnderATopLevelGroupsKeyHoldsGroups(String content) {
        assertThat(check(project(List.of(), List.of("r.yaml")), Map.of("r.yaml", content), new ArrayList<>()))
                .isEmpty();
    }

    @ParameterizedTest
    @ValueSource(
            strings = {
                "",
                "groups:\n",
                "groups: []\n",
                "groups: [ ]\n",
                "groups: api\n",
                "- groups: [a]\n",
                "groups: [a\n"
            })
    void anythingElseHoldsNone(String content) {
        assertThat(check(project(List.of(), List.of("r.yaml")), Map.of("r.yaml", content), new ArrayList<>()))
                .extracting(Diagnostic::code)
                .containsExactly(ShippedFiles.ALERT_RULES_WITHOUT_GROUPS);
    }

    @Test
    void aUidTheEstateCarriesAlreadyIsRefusedAtEveryLaterDashboard() {
        List<ShippedFiles.Placed> placed = List.of(
                new ShippedFiles.Placed("a.project.yml", "/applications/0/dashboards/0/from", "board"),
                new ShippedFiles.Placed("b.project.yml", "/applications/1/dashboards/0/from", "other"),
                new ShippedFiles.Placed("b.project.yml", "/applications/1/dashboards/1/from", "board"));

        assertThat(ShippedFiles.acrossTheEstate(placed, Optional.empty()))
                .extracting(Diagnostic::code, Diagnostic::document, Diagnostic::path, Diagnostic::message)
                .containsExactly(tuple(
                        ShippedFiles.DUPLICATE_DASHBOARD_UID,
                        "b.project.yml",
                        "/applications/1/dashboards/1/from",
                        "another dashboard of the estate already carries the uid board"));
    }

    @Test
    void aPlatformThatNamesNoGrafanaRefusesEveryDashboardAndOneThatDoesNone() {
        List<ShippedFiles.Placed> placed =
                List.of(new ShippedFiles.Placed("a.project.yml", "/applications/0/dashboards/0/from", "board"));
        Platform platform = MODEL.createPlatform();

        assertThat(ShippedFiles.acrossTheEstate(placed, Optional.of(platform)))
                .extracting(Diagnostic::code, Diagnostic::document, Diagnostic::path, Diagnostic::message)
                .containsExactly(tuple(
                        ShippedFiles.NO_DASHBOARD_POLICY,
                        "a.project.yml",
                        "/applications/0/dashboards/0/from",
                        "the platform names no Grafana for a dashboard to ship to"));
        platform.setTelemetry(MODEL.createTelemetryPolicy());
        assertThat(ShippedFiles.acrossTheEstate(placed, Optional.of(platform)))
                .extracting(Diagnostic::code)
                .containsExactly(ShippedFiles.NO_DASHBOARD_POLICY);
        platform.getTelemetry().setDashboards(MODEL.createDashboardPolicy());
        assertThat(ShippedFiles.acrossTheEstate(placed, Optional.of(platform))).isEmpty();
    }

    @ParameterizedTest
    @ValueSource(
            strings = {
                "{\"uid\":\"board\"}",
                " { \"title\" : \"x\" , \"uid\" : \"board\" } \n",
                "{\"panels\": [{\"uid\": \"nested\"}, 1, -2.5e3, true, false, null, [], {}], \"uid\": \"board\"}",
                "{\"uid\": \"bo\\u0061rd\"}",
                "{\"uid\": \"x\", \"uid\": \"board\"}",
                "{\"a\": { }, \"b\": [ ], \"uid\": \"board\"}"
            })
    void aDocumentsOwnUidIsReadAndNoNestedOne(String json) {
        assertThat(ShippedFiles.TopLevel.uid(json)).contains("board");
    }

    @Test
    void anEscapedStringReadsAsWhatItEscapes() {
        assertThat(ShippedFiles.TopLevel.uid("{\"uid\": \"a\\nb\\tc\\rd\\be\\ff\\\"g\\\\h\\/i\"}"))
                .contains("a\nb\tc\rd\be\ff\"g\\h/i");
    }

    @ParameterizedTest
    @ValueSource(
            strings = {
                "",
                "[]",
                "{}",
                "{\"uid\": \"\"}",
                "{\"uid\": 7}",
                "{\"panels\": [{\"uid\": \"nested\"}]}",
                "{\"uid\": \"board\"} trailing",
                "{\"uid\": \"board\" \"title\": \"x\"}",
                "{\"uid\" \"board\"}",
                "{\"a\": [1 2], \"uid\": \"board\"}",
                "{\"a\": tru, \"uid\": \"board\"}",
                "{\"uid\": \"\\u12G4\"}",
                "{\"a\": truex, \"uid\": \"board\"}",
                "{\"a\": , \"uid\": \"board\"}",
                "{uid: \"board\"}",
                "{\"uid\": \"board\"",
                "{\"uid\": \"bo\\u00",
                "{\"uid\": \"board\", \"a\": 1"
            })
    void aDocumentThatIsNoObjectOrNamesNoUidOfItsOwnHasNone(String json) {
        assertThat(ShippedFiles.TopLevel.uid(json)).isEmpty();
    }
}
