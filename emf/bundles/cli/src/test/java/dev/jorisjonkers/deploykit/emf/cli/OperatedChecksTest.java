package dev.jorisjonkers.deploykit.emf.cli;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.tuple;

import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.Application;
import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.Monitoring;
import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.Platform;
import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.Process;
import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.Project;
import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.ProjectIntentFactory;
import java.util.List;
import java.util.Map;
import org.eclipse.emf.common.util.URI;
import org.eclipse.emf.ecore.InternalEObject;
import org.eclipse.emf.ecore.xmi.impl.XMIResourceImpl;
import org.junit.jupiter.api.Test;

/** The arguments of the monitoring stack's Prometheus and Alertmanager, which the operator runs. */
class OperatedChecksTest {

    private static final ProjectIntentFactory MODEL = ProjectIntentFactory.eINSTANCE;

    /** A project file `observability.project.yml` declaring a Prometheus and an Alertmanager. */
    private final Project project = project();

    private final Application prometheus = project.getApplications().get(0);
    private final Application alertmanager = project.getApplications().get(1);

    private static Project project() {
        Project project = MODEL.createProject();
        project.setProject("observability");
        for (String id : List.of("prometheus", "alertmanager")) {
            Application application = MODEL.createApplication();
            application.setId(id);
            Process process = MODEL.createProcess();
            process.setName(id);
            application.getProcesses().add(process);
            project.getApplications().add(application);
        }
        new XMIResourceImpl(URI.createURI("observability.project.yml"))
                .getContents()
                .add(project);
        return project;
    }

    private static Platform platform(Application prometheus, Application alertmanager) {
        Platform platform = MODEL.createPlatform();
        Monitoring monitoring = MODEL.createMonitoring();
        monitoring.setPrometheus(prometheus);
        monitoring.setAlertmanager(alertmanager);
        platform.setMonitoring(monitoring);
        return platform;
    }

    private List<Diagnostic> check(Platform platform) {
        return OperatedChecks.check(platform, Map.of(project, "observability.project.yml"));
    }

    private static void argue(Application application, String... args) {
        application.getProcesses().get(0).getArgs().addAll(List.of(args));
    }

    @Test
    void aFlagTheOperatorPassesOnIsNotRefused() {
        argue(prometheus, "--log.level=debug", "-query.max-concurrency", "--storage.tsdb.retention.time=15d");
        argue(alertmanager, "--data.retention=120h");

        assertThat(check(platform(prometheus, alertmanager))).isEmpty();
    }

    @Test
    void anArgumentThatIsNoFlagOrSetsWhatTheOperatorSetsIsRefusedAtItsEntry() {
        argue(prometheus, "--log.level=debug", "serve", "--config.file=/etc/prometheus.yml", "---triple", "--=x");
        argue(alertmanager, "--cluster.peer=elsewhere:9094", "--storage.path", "-config.file=a");

        assertThat(check(platform(prometheus, alertmanager)))
                .extracting(Diagnostic::code, Diagnostic::document, Diagnostic::path)
                .containsExactly(
                        tuple("E_OPERATED_PROCESS", "observability.project.yml", "/applications/0/processes/0/args/1"),
                        tuple("E_OPERATED_PROCESS", "observability.project.yml", "/applications/0/processes/0/args/2"),
                        tuple("E_OPERATED_PROCESS", "observability.project.yml", "/applications/0/processes/0/args/3"),
                        tuple("E_OPERATED_PROCESS", "observability.project.yml", "/applications/0/processes/0/args/4"),
                        tuple("E_OPERATED_PROCESS", "observability.project.yml", "/applications/1/processes/0/args/0"),
                        tuple("E_OPERATED_PROCESS", "observability.project.yml", "/applications/1/processes/0/args/1"),
                        tuple("E_OPERATED_PROCESS", "observability.project.yml", "/applications/1/processes/0/args/2"));
        assertThat(check(platform(prometheus, alertmanager)))
                .extracting(Diagnostic::message)
                .contains(
                        "prometheus: serve is not a flag, and the operator passes its Prometheus flags alone",
                        "prometheus: the operator sets --config.file itself",
                        "alertmanager: the operator sets --cluster.peer itself");
    }

    /** Each kind keeps its own list: a flag one kind's operator sets is the other's to pass on. */
    @Test
    void eachKindIsHeldToTheFlagsItsOwnOperatorSets() {
        argue(prometheus, "--cluster.peer=x", "--storage.path=/data");
        argue(alertmanager, "--storage.tsdb.path=/data", "--web.enable-lifecycle");

        assertThat(check(platform(prometheus, alertmanager))).isEmpty();
    }

    @Test
    void aRoleOfSeveralProcessesOrNoneDeclaredOrNoMonitoringBlockAsksNoArgument() {
        argue(prometheus, "serve");
        Process second = MODEL.createProcess();
        second.setName("second");
        prometheus.getProcesses().add(second);
        Application undeclared = MODEL.createApplication();
        ((InternalEObject) undeclared).eSetProxyURI(URI.createURI("observability.project.yml#nowhere"));

        assertThat(check(platform(prometheus, undeclared))).isEmpty();
        assertThat(check(MODEL.createPlatform())).isEmpty();
    }
}
