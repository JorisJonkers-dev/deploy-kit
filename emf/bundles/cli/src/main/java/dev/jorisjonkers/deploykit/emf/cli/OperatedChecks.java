package dev.jorisjonkers.deploykit.emf.cli;

import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.Application;
import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.Monitoring;
import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.Platform;
import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.Process;
import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.Project;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * The arguments of the monitoring stack's Prometheus and Alertmanager, which the Prometheus operator
 * runs (spec/v1/14-platform-intent.md#the-operators-objects): each is a flag, and none sets what the
 * operator sets itself. A refusal is placed at the argument's entry of a list of strings, which no
 * invariant's path can name, so it is decided here; the rest of what the operator asks of the
 * Process is decided in OCL.
 */
final class OperatedChecks {

    static final String OPERATED_PROCESS = "E_OPERATED_PROCESS";

    /** One or two dashes, a name that opens on neither a dash nor {@code =}, and any value after {@code =}. */
    private static final Pattern FLAG = Pattern.compile("--?([^=-][^=]*)(?:=.*)?", Pattern.DOTALL);

    /** The flags the operator sets on its Prometheus itself. */
    private static final Set<String> PROMETHEUS_OWNED = Set.of(
            "config.file",
            "storage.tsdb.path",
            "web.config.file",
            "web.console.libraries",
            "web.console.templates",
            "web.enable-lifecycle",
            "web.external-url",
            "web.listen-address",
            "web.route-prefix");

    /** The flags the operator sets on its Alertmanager itself. */
    private static final Set<String> ALERTMANAGER_OWNED = Set.of(
            "cluster.listen-address",
            "cluster.peer",
            "config.file",
            "storage.path",
            "web.config.file",
            "web.external-url",
            "web.listen-address",
            "web.route-prefix");

    private OperatedChecks() {}

    static List<Diagnostic> check(Platform platform, Map<Project, String> projects) {
        Monitoring monitoring = platform.getMonitoring();
        List<Diagnostic> refusals = new ArrayList<>();
        if (monitoring != null) {
            refusals.addAll(arguments(monitoring.getPrometheus(), "Prometheus", PROMETHEUS_OWNED, projects));
            refusals.addAll(arguments(monitoring.getAlertmanager(), "Alertmanager", ALERTMANAGER_OWNED, projects));
        }
        return refusals;
    }

    /**
     * Every argument of the role's one Process that is no flag, or a flag the operator sets. A role with
     * several Processes is refused at its Application, in OCL, and its arguments are not asked.
     */
    private static List<Diagnostic> arguments(
            Application role, String kind, Set<String> owned, Map<Project, String> projects) {
        List<Diagnostic> refusals = new ArrayList<>();
        // A role no project file of the set declares links to nothing, and is refused for that.
        if (role.eIsProxy() || role.getProcesses().size() != 1) {
            return refusals;
        }
        Process process = role.getProcesses().get(0);
        String document = projects.get((Project) role.eContainer());
        List<String> args = process.getArgs();
        for (int i = 0; i < args.size(); i++) {
            String argument = args.get(i);
            Matcher flag = FLAG.matcher(argument);
            if (!flag.matches()) {
                refusals.add(refusal(
                        document,
                        process,
                        i,
                        role.getId() + ": " + argument + " is not a flag, and the operator passes its " + kind
                                + " flags alone"));
            } else if (owned.contains(flag.group(1))) {
                refusals.add(refusal(
                        document, process, i, role.getId() + ": the operator sets --" + flag.group(1) + " itself"));
            }
        }
        return refusals;
    }

    private static Diagnostic refusal(String document, Process process, int index, String message) {
        return new Diagnostic(OPERATED_PROCESS, document, Pointer.of(process) + "/args/" + index, message);
    }
}
