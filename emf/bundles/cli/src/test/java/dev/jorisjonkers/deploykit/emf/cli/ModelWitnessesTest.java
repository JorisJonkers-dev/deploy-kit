package dev.jorisjonkers.deploykit.emf.cli;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

/**
 * The model behaviours of the behaviour ledger that landed in the production implementation after
 * this one was frozen (docs/witnesses.md): each test renders or checks the worked examples, or one
 * with a single edit, and asserts the one behaviour its name states, in the rendered file or the
 * refusal the production implementation's test asserts too.
 */
class ModelWitnessesTest {

    /** The renders every test below reads, one per example, in a directory that outlives the tests. */
    @TempDir
    static Path shared;

    private static final Map<String, Path> TREES = new HashMap<>();

    /** One change to a worked example: {@code from} becomes {@code to} in {@code file}. */
    private record Edit(String file, String from, String to) {}

    private static Path tree(String example) {
        return TREES.computeIfAbsent(example, name -> {
            try {
                Outputs.Resolving resolving = Outputs.RESOLVED.get(name);
                List<Path> files =
                        resolving.documents().stream().map(Examples::of).toList();
                Path out = shared.resolve(name);
                assertThat(Pipeline.render(files, List.of(resolving.project()), Outputs.INTEGRITY, out))
                        .isEmpty();
                return out;
            } catch (IOException e) {
                throw new UncheckedIOException(e);
            }
        });
    }

    /** What the render of {@code example} wrote at {@code path} below the tree. */
    private static String rendered(String example, String path) {
        try {
            return Files.readString(tree(example).resolve(path));
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    /** The documents of {@code example} with {@code edits} made to copies of the directories they sit in. */
    private static List<Path> edited(String example, Path work, Edit... edits) throws IOException {
        List<String> copied = new ArrayList<>();
        for (Edit edit : edits) {
            String top = edit.file().substring(0, edit.file().indexOf('/'));
            if (!copied.contains(top)) {
                copied.add(top);
                copy(Examples.of(top), work.resolve(top));
            }
            Path target = work.resolve(edit.file());
            String text = Files.readString(target);
            assertThat(text)
                    .as("the text %s edits in %s", edit.from(), edit.file())
                    .contains(edit.from());
            Files.writeString(target, text.replace(edit.from(), edit.to()));
        }
        return Outputs.RESOLVED.get(example).documents().stream()
                .map(file ->
                        copied.contains(file.substring(0, file.indexOf('/'))) ? work.resolve(file) : Examples.of(file))
                .toList();
    }

    private static void copy(Path from, Path to) throws IOException {
        try (Stream<Path> walk = Files.walk(from)) {
            for (Path source : walk.toList()) {
                Path target = to.resolve(from.relativize(source).toString());
                if (Files.isDirectory(source)) {
                    Files.createDirectories(target);
                } else {
                    Files.copy(source, target);
                }
            }
        }
    }

    /** The render of {@code example} with {@code edits}, written below {@code work}. */
    private static Path renderedWith(String example, Path work, Edit... edits) throws IOException {
        List<Path> files = edited(example, work.resolve("in"), edits);
        Path out = work.resolve("out");
        assertThat(Pipeline.render(files, List.of(Outputs.RESOLVED.get(example).project()), Outputs.INTEGRITY, out))
                .isEmpty();
        return out;
    }

    /** The diagnostics, as {@code code path}, of the fixture {@code name} below {@code directory}. */
    private static List<String> refusal(String directory, String name) throws IOException {
        Path set = Examples.of(directory + "/" + name);
        List<Diagnostic> diagnostics;
        if (Files.isDirectory(set)) {
            try (Stream<Path> entries = Files.list(set)) {
                diagnostics =
                        Pipeline.check(entries.filter(file -> file.toString().endsWith(".yml"))
                                .sorted()
                                .toList());
            }
        } else {
            diagnostics = Pipeline.intent(Examples.of(directory + "/" + name + ".project.yml"))
                    .diagnostics();
        }
        return diagnostics.stream()
                .map(diagnostic -> diagnostic.code() + " " + diagnostic.path())
                .toList();
    }

    private static List<String> refusal(String name) throws IOException {
        return refusal("refusals", name);
    }

    /** The one object of kind {@code kind} and name {@code name} in a multi-document YAML text. */
    private static String object(String text, String kind, String name) {
        List<String> found = Stream.of(text.split("\n---\n"))
                .filter(document ->
                        document.contains("\nkind: " + kind + "\n") && document.contains("\n  name: " + name + "\n"))
                .toList();
        assertThat(found).as("%s %s", kind, name).hasSize(1);
        return found.get(0);
    }

    /** The capabilities a Vault policy JSON grants on {@code path}. */
    private static List<String> capabilities(String policy, String path) {
        Matcher found = Pattern.compile("\"" + Pattern.quote(path) + "\": \\{\\s*\"capabilities\": \\[([^\\]]*)\\]")
                .matcher(policy);
        assertThat(found.find()).as(path).isTrue();
        return Stream.of(found.group(1).split(","))
                .map(word -> word.replace("\"", "").trim())
                .toList();
    }

    @Test
    void aLowPortKeepsNetBindServiceAloneAndAHighPortAddsNothing() {
        String workloads = rendered("auth", "apps/auth/auth/workload.yaml");

        String ui = object(workloads, "Deployment", "auth-ui");
        assertThat(ui)
                .contains("containerPort: 80\n")
                .contains("add:\n                - NET_BIND_SERVICE\n              drop:\n                - ALL");
        String api = object(workloads, "Deployment", "auth-api");
        assertThat(api).contains("containerPort: 8080\n").doesNotContain("NET_BIND_SERVICE");
        assertThat(workloads).doesNotContain("sysctl");
    }

    @Test
    void aTransitGrantThatReadsCoversTheKeyAndUpdatesEachOtherOperationsOnePath() {
        String policy = rendered("auth", "apps/auth/vault-policy/policies/auth-system-auth-api.policy.json");

        assertThat(capabilities(policy, "transit/keys/auth-api-jwt")).containsExactly("read");
        assertThat(capabilities(policy, "transit/sign/auth-api-jwt")).containsExactly("update");
        assertThat(capabilities(policy, "transit/keys/auth-api-jwt/rotate")).containsExactly("update");
    }

    @Test
    void aMongoIsDumpedByThePlatformsMethodOwnsNoDatabaseAndIsRefusedWithoutADurableVolume() throws IOException {
        String backup = rendered("data", "apps/data/platform-mongo/backup.yaml");

        assertThat(backup)
                .contains("platform/mongo-backup@sha256:")
                .contains("schedule: 45 2 * * *\n")
                .contains("- name: BACKUP_HOST\n                  value: mongo.data-system.svc.cluster.local")
                .contains("- name: BACKUP_PORT\n                  value: \"27017\"");
        try (Stream<Path> files = Files.list(tree("data").resolve("apps/data/platform-mongo"))) {
            assertThat(files.map(file -> file.getFileName().toString()).toList())
                    .noneMatch(name -> name.contains("catalog"));
        }
        assertThat(refusal("mongo-credentials-without-database"))
                .containsExactly("E_CREDENTIALS_WITHOUT_DATABASE /applications/2/processes/0/dependsOn/0/credentials");
        assertThat(refusal("mongo-without-durability"))
                .containsExactly("E_ENGINE_WITHOUT_DURABILITY /applications/0/processes/0");
    }

    @Test
    void aScheduledProcessIsACronJobThatNeverRunsTwiceAndSkipsALateRun() throws IOException {
        String cron = object(rendered("data", "apps/data/asset-sync/workload.yaml"), "CronJob", "asset-sync");

        assertThat(cron)
                .contains("schedule: \"*/15 * * * *\"\n")
                .contains("concurrencyPolicy: Forbid\n")
                .contains("startingDeadlineSeconds: 300\n");
        assertThat(refusal("schedule-missing")).containsExactly("E_SCHEDULE_MISSING /applications/0/processes/0");
        assertThat(refusal("schedule-unscheduled"))
                .containsExactly("E_SCHEDULE_UNSCHEDULED /applications/0/processes/0/schedule");
        assertThat(refusal("scheduled-process-serves"))
                .containsExactly("E_SCHEDULED_PROCESS_SERVES /applications/0/processes/0");
        assertThat(refusal("schema-refusals", "schedule-malformed"))
                .containsExactly("schema /applications/0/processes/0/schedule");
    }

    @Test
    void eachHumanGrantIsOneClusterRoleBindingInEveryCompositionAndADuplicateIsRefused() throws IOException {
        String binding = object(
                rendered("auth", "estate/human-grants/clusterrolebindings.yaml"),
                "ClusterRoleBinding",
                "human:oidc:k8s-admin:cluster-admin");

        assertThat(binding)
                .contains("kind: ClusterRole\n  name: cluster-admin\n")
                .contains("kind: Group\n    name: oidc:k8s-admin\n");
        assertThat(rendered("mail", "estate/human-grants/clusterrolebindings.yaml"))
                .isEqualTo(rendered("auth", "estate/human-grants/clusterrolebindings.yaml"));
        assertThat(refusal("duplicate-human-grant")).containsExactly("E_DUPLICATE_HUMAN_GRANT /humanGrants/1");
        assertThat(refusal("schema-refusals", "human-grant-to-a-user")).contains("schema /humanGrants/0/user");
        assertThat(refusal("schema-refusals", "human-grant-in-a-namespace"))
                .contains("schema /humanGrants/0/namespace");
        assertThat(refusal("schema-refusals", "human-grant-role-outside-vocabulary"))
                .contains("schema /humanGrants/0/clusterRole");
        assertThat(refusal("schema-refusals", "human-grant-without-reason")).contains("schema /humanGrants/0/reason");
    }

    @Test
    void theSameHostOnOneTierIsRefusedAndOnTwoTiersRendersOneRoutePerProxy() throws IOException {
        assertThat(refusalOfNegative("duplicate-host"))
                .containsExactly(
                        "E_DUPLICATE_HOST /applications/0/exposure/0", "E_DUPLICATE_HOST /applications/0/exposure/0");

        String host = "Host(`hermes.jorisjonkers.dev`)";
        assertThat(rendered("agents", "apps/agents/hermes/route-public.yaml"))
                .contains(host)
                .contains("kubernetes.io/ingress.class: traefik-public\n");
        assertThat(rendered("agents", "apps/agents/hermes/route-lan.yaml"))
                .contains(host)
                .contains("kubernetes.io/ingress.class: traefik-lan\n");
    }

    /** The diagnostics of a negative fixture, composed with the foundation, as {@code code path}. */
    private static List<String> refusalOfNegative(String name) throws IOException {
        List<Path> files = new ArrayList<>(Outputs.RESOLVED.get("delivery").documents().stream()
                .map(Examples::of)
                .toList());
        try (Stream<Path> tree = Files.walk(Examples.of("negative/" + name))) {
            files.addAll(tree.filter(file -> file.toString().endsWith(".yml"))
                    .sorted()
                    .toList());
        }
        return Pipeline.check(files).stream()
                .map(diagnostic -> diagnostic.code() + " " + diagnostic.path())
                .toList();
    }

    @Test
    void everyRouteCarriesItsTiersIngressClassAndATierThatNamesNoneIsRefused() throws IOException {
        assertThat(rendered("auth", "apps/auth/auth/route-public.yaml"))
                .contains("    kubernetes.io/ingress.class: traefik-public\n");
        assertThat(rendered("data", "apps/data/platform-rabbitmq/route-lan.yaml"))
                .contains("    kubernetes.io/ingress.class: traefik-lan\n");
        assertThat(refusal("tier-without-ingress-class"))
                .containsExactly("E_TIER_WITHOUT_INGRESS_CLASS /applications/0/exposure/0");
    }

    @Test
    void theProjectThatDeclaresAProxyRendersTheSharedMiddlewaresOncePerNamespace() throws IOException {
        String middlewares = rendered("edge", "apps/edge/traefik-lan/middlewares.yaml");

        for (String name : List.of(
                "forward-auth",
                "security-headers",
                "security-headers-strict",
                "security-headers-admin",
                "security-headers-workflow")) {
            assertThat(object(middlewares, "Middleware", name)).contains("namespace: edge-system\n");
        }
        assertThat(tree("edge").resolve("apps/edge/traefik-public/middlewares.yaml"))
                .doesNotExist();
        try (Stream<Path> files = Files.walk(tree("edge"))) {
            assertThat(files.filter(file -> file.toString().endsWith(".yaml"))
                            .filter(file -> read(file).contains("  name: security-headers\n")))
                    .hasSize(1);
        }
    }

    private static String read(Path file) {
        try {
            return Files.readString(file);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    @Test
    void aForwardAuthNamesAProviderSurfaceAndPathAndAnUnknownProviderIsRefused() throws IOException {
        assertThat(object(rendered("edge", "apps/edge/traefik-lan/middlewares.yaml"), "Middleware", "forward-auth"))
                .contains("address: http://identity-http.estate-system.svc.cluster.local:")
                .contains("/gate/forward\n");
        assertThat(refusal("unknown-forward-auth-provider"))
                .contains("E_UNKNOWN_FORWARD_AUTH_PROVIDER /tiers/0/forwardAuth");
    }

    @Test
    void aTiersProxyIsConfiguredByItsSurfacesAndTheCrdProviderFilteredOnItsClass() throws IOException {
        String publicProxy = rendered("edge", "apps/edge/traefik-public/workload.yaml");

        assertThat(publicProxy)
                .contains("- --entryPoints.web.address=:8000/tcp\n")
                .contains("- --entryPoints.websecure.address=:8443/tcp\n")
                .contains("- --entryPoints.websecure.http.tls=true\n")
                .contains("- --entryPoints.traefik.address=:8080/tcp\n")
                .contains("- --providers.kubernetescrd=true\n")
                .contains("- --providers.kubernetescrd.ingressClass=traefik-public\n");
        String lanProxy = rendered("edge", "apps/edge/traefik-lan/workload.yaml");
        assertThat(lanProxy)
                .contains("- --providers.kubernetescrd.ingressClass=traefik-lan\n")
                .doesNotContain("websecure");
        assertThat(refusal("tier-class-unfiltered")).containsExactly("E_TIER_CLASS_UNFILTERED /tiers/1/ingressClass");
    }

    @Test
    void eachDashboardFileIsOneGrafanaDashboardInItsFolderAndAnUnusableOneIsRefused() throws IOException {
        String dashboard = rendered("data", "apps/data/platform-rabbitmq/dashboards.yaml");

        assertThat(dashboard)
                .contains("kind: GrafanaDashboard\n")
                .contains("namespace: data-system\n")
                .contains("instanceSelector:\n    matchLabels:\n      dashboards: grafana\n")
                .contains("folder: data\n")
                .contains("\"uid\": \"rabbitmq\"")
                .contains("- inputName: DS_PROMETHEUS\n      datasourceName: prometheus\n");
        assertThat(refusal("dashboard-not-found"))
                .containsExactly("E_DASHBOARD_NOT_FOUND /applications/0/dashboards/0/from");
        assertThat(refusal("dashboard-without-uid"))
                .containsExactly("E_DASHBOARD_WITHOUT_UID /applications/0/dashboards/0/from");
        assertThat(refusal("duplicate-dashboard-uid"))
                .containsExactly("E_DUPLICATE_DASHBOARD_UID /applications/1/dashboards/0/from");
        assertThat(refusal("no-dashboard-policy")).contains("E_NO_DASHBOARD_POLICY /applications/0/dashboards/0/from");
    }

    @Test
    void aRouteOnATierThatDeclaresDnsCarriesTheExternalDnsAnnotationsAndOneOnATierWithoutCarriesNone() {
        assertThat(rendered("auth", "apps/auth/auth/route-public.yaml"))
                .contains("    external-dns.alpha.kubernetes.io/target: ingress.jorisjonkers.dev\n")
                .contains("    external-dns.alpha.kubernetes.io/cloudflare-proxied: \"true\"\n");
        assertThat(rendered("data", "apps/data/platform-rabbitmq/route-lan.yaml"))
                .doesNotContain("external-dns");
    }

    @Test
    void aParkedProcessKeepsWhatItOwnsRunsNoPodAndAParkedScheduleStartsNoRun(@TempDir Path work) throws IOException {
        Path parked = tree("agents").resolve("apps/agents/agents-api");

        assertThat(read(parked.resolve("workload.yaml"))).contains("  replicas: 0\n");
        assertThat(parked.resolve("service.yaml")).isRegularFile();
        assertThat(parked.resolve("networkpolicy.yaml")).isRegularFile();
        assertThat(parked.resolve("serviceaccount.yaml")).isRegularFile();
        assertThat(parked.resolve("canary.yaml")).doesNotExist();

        Path suspended = renderedWith(
                "data",
                work,
                new Edit(
                        "data/data.project.yml",
                        "        lifecycle: scheduled\n",
                        "        lifecycle: scheduled\n        parked: { reason: Stopped while the bucket is moved. }\n"));
        assertThat(Files.readString(suspended.resolve("apps/data/asset-sync/workload.yaml")))
                .contains("suspend: true\n");
    }

    @Test
    void aDatastoreRunsAtTheDataClassACriticalApplicationAtTheCriticalClassAndAnyOtherAtNone() throws IOException {
        assertThat(rendered("data", "apps/data/platform-postgres/workload.yaml"))
                .contains("priorityClassName: platform-data\n");
        assertThat(rendered("data", "apps/data/asset-sync/workload.yaml")).doesNotContain("priorityClassName");
        assertThat(rendered("data", "apps/data/platform-valkey/workload.yaml")).doesNotContain("priorityClassName");
        assertThat(rendered("auth", "apps/auth/auth/workload.yaml"))
                .contains("priorityClassName: platform-critical-app\n");
        String classes = rendered("auth", "estate/priority-classes/priorityclasses.yaml");
        assertThat(object(classes, "PriorityClass", "platform-data")).contains("value: 1000000\n");
        assertThat(object(classes, "PriorityClass", "platform-critical-app")).contains("value: 100000\n");
        assertThat(refusal("unknown-critical-application"))
                .contains("E_UNKNOWN_CRITICAL_APPLICATION /priority/criticalApplications/0");
    }

    @Test
    void aNodeAddressExposureIsAHostPortOnTheProcessHoldsItToTheNodeAndRendersNoLoadBalancer() throws IOException {
        String workload = rendered("mail", "apps/mail/stalwart/workload.yaml");

        assertThat(workload)
                .contains("- name: smtp\n              containerPort: 25\n              hostPort: 25\n")
                .contains("- name: imaps\n              containerPort: 993\n              hostPort: 993\n")
                .contains("kubernetes.io/hostname")
                .contains("- frankfurt-contabo-1\n");
        assertThat(rendered("mail", "apps/mail/stalwart/service.yaml")).doesNotContain("LoadBalancer");
        assertThat(refusal("node-port-taken"))
                .containsExactly(
                        "E_NODE_PORT_TAKEN /applications/0/l4Exposure/0",
                        "E_NODE_PORT_TAKEN /applications/1/l4Exposure/0");
        assertThat(refusal("node-address-replicated"))
                .containsExactly("E_NODE_ADDRESS_REPLICATED /applications/0/processes/0/replicas");
        assertThat(refusal("node-address-continuous"))
                .containsExactly("E_CUTOVER_UNHONOURABLE /applications/0/processes/0");
    }

    @Test
    void aTiersAddressExposesItsProxyOnTheListenersPortsAndAnAcmeTierGetsAResolverWithItsOwnState() throws IOException {
        String publicProxy = rendered("edge", "apps/edge/traefik-public/workload.yaml");

        assertThat(publicProxy)
                .contains("- name: web\n              containerPort: 8000\n              hostPort: 80\n")
                .contains("- name: websecure\n              containerPort: 8443\n              hostPort: 443\n")
                .doesNotContain("- name: tcp-80\n")
                .contains("- --certificatesresolvers.public-frankfurt.acme.email=hostmaster@jorisjonkers.dev\n")
                .contains("- --certificatesresolvers.public-frankfurt.acme.storage=/acme/public-frankfurt.json\n")
                .contains("- --certificatesresolvers.public-frankfurt.acme.dnschallenge.provider=cloudflare\n")
                .contains("secretKeyRef:\n                  name: traefik-public-platform-cloudflare\n")
                .contains("key: CF_DNS_API_TOKEN\n");
        assertThat(rendered("edge", "apps/edge/traefik-public/pvc.yaml")).contains("  name: acme\n");
        assertThat(rendered("edge", "apps/edge/traefik-lan/service.yaml"))
                .contains("metallb.io/address-pool: lan-edge\n")
                .contains("- name: tcp-80\n      port: 80\n      protocol: TCP\n      targetPort: 8000\n");
        assertThat(refusal("unknown-l4-address")).containsExactly("E_UNKNOWN_L4_ADDRESS /applications/0/l4Exposure/0");
        assertThat(refusal("tier-surface-missing")).containsExactly("E_TIER_SURFACE_MISSING /tiers/0");
    }

    @Test
    void aRoutesTlsFollowsItsTierAnAcmeTierNamesItsResolverAPlainTierRendersNoneAndATlsTierThatIssuesNoneAnEmptyBlock(
            @TempDir Path work) throws IOException {
        assertThat(rendered("auth", "apps/auth/auth/route-public.yaml"))
                .contains("  tls:\n    certResolver: public-frankfurt\n");
        assertThat(rendered("data", "apps/data/platform-rabbitmq/route-lan.yaml"))
                .doesNotContain("tls:")
                .doesNotContain("certResolver");

        Path terminating = renderedWith(
                "data",
                work,
                new Edit(
                        "platform/platform.intent.yml",
                        "    listener: plain\n    certificates: none\n",
                        "    listener: tls\n    certificates: none\n"),
                new Edit(
                        "edge/edge.project.yml",
                        "          web: 8000\n          admin: 8080\n",
                        "          web: 8000\n          websecure: 8443\n          admin: 8080\n"));
        assertThat(Files.readString(terminating.resolve("apps/data/platform-rabbitmq/route-lan.yaml")))
                .contains("  tls: {}\n");
    }

    @Test
    void aProcessAnsweringOnPort53ResolvesThroughThePlatformsUpstreamNameserversAndIsRefusedWithoutThem()
            throws IOException {
        String workload = rendered("utility", "apps/utility/adguard/workload.yaml");

        assertThat(workload)
                .contains("dnsPolicy: None\n")
                .contains("nameservers:\n          - 9.9.9.10\n          - 149.112.112.10\n");
        assertThat(rendered("utility", "apps/utility/adguard/networkpolicy.yaml"))
                .contains(
                        "- ipBlock:\n            cidr: 9.9.9.10/32\n        - ipBlock:\n            cidr: 149.112.112.10/32\n"
                                + "      ports:\n        - protocol: UDP\n          port: 53\n        - protocol: TCP\n          port: 53\n");
        assertThat(refusal("no-upstream-nameservers"))
                .containsExactly("E_NO_UPSTREAM_NAMESERVERS /applications/0/l4Exposure/0");
    }

    @Test
    void aProcessThatSpawnsCreatesPodsFromItsTemplateAlone() {
        String rules = rendered("agents", "apps/agents/agents-api/rbac.yaml");
        assertThat(rules)
                .contains(
                        "      - pods\n    verbs:\n      - get\n      - list\n      - watch\n      - create\n      - delete\n");

        String workload = rendered("agents", "apps/agents/agents-api/workload.yaml");
        assertThat(workload)
                .contains(
                        "- name: SPAWN_RUNNER_IMAGE\n              value: ghcr.io/jorisjonkers-dev/agents/agent-runner@sha256:")
                .contains(
                        "- name: SPAWN_RUNNER_LABELS\n              value: deploy-kit.jorisjonkers.dev/spawned-from=agents-api-runner,"
                                + "consumes.deploy-kit.jorisjonkers.dev/agents-api.http=true\n");
        assertThat(rendered("agents", "apps/agents/agents-api/networkpolicy.yaml"))
                .contains("deploy-kit.jorisjonkers.dev/spawned-from: agents-api-runner\n");
    }

    @Test
    void anAdmittedApiBlockWithNoRulesRendersNoRoleAndNoBindingBesideItsMountedToken() {
        Path headlamp = tree("utility").resolve("apps/utility/headlamp");

        assertThat(headlamp.resolve("rbac.yaml")).doesNotExist();
        assertThat(read(headlamp.resolve("kustomization.yaml"))).doesNotContain("rbac.yaml");
        assertThat(read(headlamp.resolve("workload.yaml"))).contains("automountServiceAccountToken: true\n");
        assertThat(read(headlamp.resolve("networkpolicy.yaml"))).contains("cidr: 10.43.0.1/32\n");
    }

    @Test
    void anEdgeIntoAnObjectStoreThatNamesBucketsDerivesItsCatalogAndHandsTheConsumerItsKey() throws IOException {
        String catalog = rendered("knowledge-platform", "estate/vso-secrets/garage-catalog.yaml");

        assertThat(catalog)
                .contains("\"keys\":[{\"buckets\":[\"knowledge-platform-assets\"],\"name\":\"knowledge-platform\","
                        + "\"path\":\"secret/data/knowledge-platform/garage/s3\"}]");
        assertThat(rendered("knowledge-platform", "apps/knowledge-platform/karakeep/vso.yaml"))
                .contains("path: knowledge-platform/garage/s3\n");
        assertThat(refusal("buckets-without-object-store"))
                .containsExactly("E_BUCKETS_WITHOUT_OBJECT_STORE /applications/1/processes/0/dependsOn/0/buckets");
    }

    @Test
    void everyStableAddressIsOneExternalNameCreatedOnceAndAConsumersAliasNamesItAlone() {
        String stable = object(
                rendered("auth", "estate/stable-addresses/services.yaml"), "Service", "platform-postgres-postgres");
        assertThat(stable)
                .contains("namespace: estate-system\n")
                .contains("kustomize.toolkit.fluxcd.io/ssa: IfNotPresent\n")
                .contains("type: ExternalName\n  externalName: postgres.data-system.svc.cluster.local");

        assertThat(object(rendered("auth", "apps/auth/aliases.yaml"), "Service", "platform-postgres"))
                .contains("type: ExternalName\n")
                .contains("externalName: platform-postgres-postgres.estate-system.svc.cluster.local");
        assertThat(rendered("edge", "apps/edge/traefik-lan/middlewares.yaml"))
                .contains(".estate-system.svc.cluster.local:");
    }

    @Test
    void anOpenMoveRendersItsFrozenSourceBesideItsTargetAndOneSuspendedJobPerStep() throws IOException {
        Map<String, byte[]> written = Stages.run("render", "data-moving");
        String workload = new String(written.get("apps/data/platform-postgres/workload.yaml"));
        String move = new String(written.get("apps/data/platform-postgres/move.yaml"));

        assertThat(object(workload, "Deployment", "postgres"))
                .contains("kustomize.toolkit.fluxcd.io/ssa: IfNotPresent\n");
        assertThat(object(workload, "Deployment", "postgres-fe331b712e81"))
                .contains("namespace: data-system\n")
                .contains("app.kubernetes.io/instance: postgres\n");
        for (String step : List.of("start", "sync", "lag", "fence")) {
            assertThat(object(move, "Job", "postgres-move-" + step + "-fe331b712e81"))
                    .contains("suspend: true\n")
                    .contains("serviceAccountName: postgres-move\n");
        }
        assertThat(object(move, "Role", "data-system-postgres-move"))
                .contains("namespace: estate-system\n")
                .contains("- platform-postgres-postgres\n")
                .contains("    verbs:\n      - get\n      - update\n      - patch");
    }

    @Test
    void everyCanaryAsksTheReleaseGateAFourthQuestionRollback() {
        String canary = rendered("auth", "apps/auth/auth/canary.yaml");

        for (String process : List.of("auth-api", "auth-ui")) {
            assertThat(object(canary, "Canary", process))
                    .contains("      - name: rollback\n        type: rollback\n"
                            + "        url: http://release-gate.delivery-system.svc.cluster.local:8080/rollback\n")
                    .contains("          process: " + process + "\n");
        }
    }

    @Test
    void aSeededAssetIsTheFirstInitContainerThatWritesItAtMode0600AndTheProcessNeverMountsIt() {
        String workload = rendered("utility", "apps/utility/adguard/workload.yaml");
        int init = workload.indexOf("      initContainers:\n        - name: seed\n");
        int main = workload.indexOf("      containers:\n        - name: adguard\n");

        assertThat(init).isPositive().isLessThan(main);
        String seed = workload.substring(init, main);
        assertThat(seed)
                .contains("- /bin/sh\n            - -c\n")
                .contains("mkdir -p '/opt/adguardhome/conf'")
                .contains(
                        "cp -p '/opt/adguardhome/conf/AdGuardHome.yaml' '/opt/adguardhome/conf/AdGuardHome.yaml.superseded'")
                .contains("chmod 0600 '/opt/adguardhome/conf/AdGuardHome.yaml.seeding'")
                .contains(
                        "mv '/opt/adguardhome/conf/AdGuardHome.yaml.seeding' '/opt/adguardhome/conf/AdGuardHome.yaml'")
                .contains("readOnlyRootFilesystem: true\n")
                .contains("mountPath: /seed/adguard-adguardhome-yaml-85a1bf27a7\n              readOnly: true\n");
        assertThat(workload.substring(main)).doesNotContain("/seed/");
    }

    @Test
    void aContainerThatMountsAWritableTmpGetsHomeAfterItsOwnVariablesAndOneWithoutGetsNone(@TempDir Path work)
            throws IOException {
        String auth = rendered("auth", "apps/auth/auth/workload.yaml");
        assertThat(object(auth, "Deployment", "auth-api"))
                .contains("- name: HOME\n              value: /tmp\n")
                .contains("mountPath: /tmp\n");
        assertThat(rendered("auth", "apps/auth/auth/migration.yaml"))
                .contains("- name: HOME\n              value: /tmp\n");
        assertThat(rendered("utility", "apps/utility/adguard/workload.yaml")).doesNotContain("name: HOME");
        assertThat(rendered("minimal", "apps/notes/notes/workload.yaml")).doesNotContain("name: HOME");

        Path authored = renderedWith(
                "auth",
                work,
                new Edit(
                        "auth/env/auth-api/base.env",
                        "SESSION_COOKIE_SECURE=true\n",
                        "SESSION_COOKIE_SECURE=true\nHOME=/work\n"));
        String api =
                object(Files.readString(authored.resolve("apps/auth/auth/workload.yaml")), "Deployment", "auth-api");
        assertThat(api).contains("- name: HOME\n              value: /work\n").doesNotContain("value: /tmp\n");
    }

    @Test
    void everyNamespaceTheRenderWritesIsNeverPruned() {
        for (String[] namespace : new String[][] {
            {"minimal", "apps/notes/namespace.yaml"},
            {"node", "apps/node/namespace.yaml"},
            {"auth", "estate/stable-addresses/namespace.yaml"}
        }) {
            assertThat(rendered(namespace[0], namespace[1]))
                    .as(namespace[1])
                    .contains("kind: Namespace")
                    .contains("  annotations:\n    kustomize.toolkit.fluxcd.io/prune: disabled\n");
        }
    }

    void everyMonitorCarriesThePlatformsSelectorLabelsBesideItsOwnAndTheMonitorsOwnValueWins(@TempDir Path work)
            throws IOException {
        String monitor = rendered("minimal", "apps/notes/notes/podmonitor.yaml");
        assertThat(monitor)
                .contains("  labels:\n    release: metrics-stack\n    app.kubernetes.io/name: notes-api\n")
                .containsOnlyOnce("app.kubernetes.io/managed-by:");

        String labels = "  labels:\n    release: metrics-stack\n";
        Edit collision = new Edit(
                "platform/platform.intent.yml", labels, labels + "    app.kubernetes.io/managed-by: someone-else\n");
        for (String[] where : new String[][] {
            {"minimal", "apps/notes/notes/podmonitor.yaml"},
            {"observability", "apps/observability/prometheus/flux-podmonitor.yaml"}
        }) {
            Path collided = renderedWith(where[0], work.resolve("collided-" + where[0]), collision);
            assertThat(Files.readString(collided.resolve(where[1])))
                    .containsOnlyOnce("app.kubernetes.io/managed-by:")
                    .contains("app.kubernetes.io/managed-by: deploy-kit\n");
        }

        Path bare = renderedWith("minimal", work.resolve("bare"), new Edit("platform/platform.intent.yml", labels, ""));
        assertThat(Files.readString(bare.resolve("apps/notes/notes/podmonitor.yaml")))
                .doesNotContain("release:")
                .contains("  labels:\n    app.kubernetes.io/name: notes-api\n");
    }

    @Test
    void anUnproxiedHostPointsAtTheTiersDirectAddressAndItsRoutesCountAClientByItsConnection(@TempDir Path work)
            throws IOException {
        String limit = "          - { path: /, match: prefix, process: notes-api, surface: http }";
        Edit limited = new Edit(
                "minimal/notes.project.yml",
                limit,
                limit.replace("surface: http }", "surface: http, rateLimit: { requests: 10, per: 1m } }"));
        Edit unproxied = new Edit(
                "minimal/notes.project.yml",
                "        contentPolicy: strict\n",
                "        contentPolicy: strict\n        proxied: false\n");

        String off = Files.readString(renderedWith("minimal", work.resolve("off"), limited, unproxied)
                .resolve("apps/notes/notes/route-public.yaml"));
        assertThat(off)
                .contains("external-dns.alpha.kubernetes.io/target: 167.86.79.203\n")
                .contains("external-dns.alpha.kubernetes.io/cloudflare-proxied: \"false\"\n")
                .contains("  rateLimit:\n    average: 10\n    period: 1m\n    burst: 10\n")
                .doesNotContain("CF-Connecting-IP");

        String on = Files.readString(
                renderedWith("minimal", work.resolve("on"), limited).resolve("apps/notes/notes/route-public.yaml"));
        assertThat(on)
                .contains("external-dns.alpha.kubernetes.io/target: ingress.jorisjonkers.dev\n")
                .contains("requestHeaderName: CF-Connecting-IP\n");

        assertThat(refusal("no-direct-target"))
                .containsExactly("E_NO_DIRECT_TARGET /applications/0/exposure/0/proxied");
    }

    @Test
    void theMetricsStackRendersRuleGroupsAndRoutesEachSeverityToItsReceiverAndNoRuleGroupsRenderElsewhere() {
        assertThat(rendered("observability", "apps/observability/prometheus/alertrules.yaml"))
                .contains("kind: PrometheusRule\n")
                .contains("  name: prometheus-platform\n")
                .contains("    - name: platform\n");
        String config = rendered("observability", "apps/observability/alertmanager/alertmanagerconfig.yaml");
        assertThat(config)
                .contains("kind: AlertmanagerConfig\n")
                .contains("          - name: severity\n            value: critical\n        receiver: discord\n")
                .contains("        repeatInterval: 4h\n")
                .contains("          - name: severity\n            value: warning\n        receiver: discord\n")
                .contains(
                        "            name: alertmanager-platform-alertmanager-discord\n            key: webhook-url\n");
        assertThat(rendered("observability", "apps/observability/alertmanager/vso.yaml"))
                .contains("alertmanager-platform-alertmanager-discord");
    }

    @Test
    void theLogCollectorReadsEveryPodsLogThroughTheApiAsOneCopyAndNoTreeHoldsAWebhookHookOrAggregatedRole()
            throws IOException {
        String rbac = rendered("observability", "apps/observability/alloy/rbac.yaml");
        assertThat(rbac).contains("kind: ClusterRole\n").contains("      - pods/log\n");
        String workload = rendered("observability", "apps/observability/alloy/workload.yaml");
        assertThat(workload)
                .contains("kind: Deployment\n")
                .doesNotContain("DaemonSet")
                .doesNotContain("hostNetwork");
        assertThat(workload).doesNotContain("hostPID").doesNotContain("hostPath");
        for (String example : Outputs.RESOLVED.keySet()) {
            try (Stream<Path> files = Files.walk(tree(example))) {
                assertThat(files.filter(file -> file.toString().endsWith(".yaml"))
                                .map(ModelWitnessesTest::read)
                                .filter(text -> text.contains("kind: MutatingWebhookConfiguration")
                                        || text.contains("kind: ValidatingWebhookConfiguration")
                                        || text.contains("helm.sh/hook")
                                        || text.contains("aggregate-to-")))
                        .as(example)
                        .isEmpty();
            }
        }
    }

    @Test
    void theMetricsStackScrapesFluxsControllersWhereThePlatformRecordsTheirMetricsAndNowhereElse(@TempDir Path work)
            throws IOException {
        String monitor = rendered("observability", "apps/observability/prometheus/flux-podmonitor.yaml");
        assertThat(monitor)
                .contains("  name: flux-controllers\n  namespace: observability-system\n")
                .contains("    release: metrics-stack\n")
                .contains("      app.kubernetes.io/part-of: flux\n")
                .contains("      - flux-system\n")
                .contains(
                        "    - portNumber: 8080\n      path: /metrics\n      interval: 30s\n      scrapeTimeout: 10s\n");
        assertThat(rendered("observability", "apps/observability/prometheus/networkpolicy.yaml"))
                .contains("kubernetes.io/metadata.name: flux-system");

        Path unrecorded = renderedWith(
                "observability",
                work,
                new Edit("platform/platform.intent.yml", "    metrics: {port: 8080, path: /metrics}\n", ""));
        assertThat(unrecorded.resolve("apps/observability/prometheus/flux-podmonitor.yaml"))
                .doesNotExist();
        assertThat(Files.readString(unrecorded.resolve("apps/observability/prometheus/networkpolicy.yaml")))
                .doesNotContain("flux-system");
    }

    /** A diagnostic as {@code code document path}. */
    private static String described(Diagnostic diagnostic) {
        return diagnostic.code() + " " + diagnostic.document() + " " + diagnostic.path();
    }

    /** What rendering {@code example} with {@code edits} refuses, as {@code code document path}. */
    private static List<String> renderRefusals(String example, Path work, Edit... edits) throws IOException {
        List<Path> files = edited(example, work.resolve("in"), edits);
        return Pipeline.render(
                        files, List.of(Outputs.RESOLVED.get(example).project()), Outputs.INTEGRITY, work.resolve("out"))
                .stream()
                .map(ModelWitnessesTest::described)
                .toList();
    }

    /** What checking the documents of {@code example} with {@code edits} refuses, as {@code code document path}. */
    private static List<String> checkRefusals(String example, Path work, Edit... edits) throws IOException {
        return Pipeline.check(edited(example, work.resolve("in"), edits)).stream()
                .map(ModelWitnessesTest::described)
                .toList();
    }

    private static final String UTILITY = "utility/utility.project.yml";
    private static final String PLATFORM_DOCUMENT = "platform/platform.intent.yml";

    @Test
    void aProcessExposedOnAPoolIsHeldToThePoolsSiteAndAPlacementThatContradictsItIsRefused(@TempDir Path work)
            throws IOException {
        assertThat(rendered("utility", "apps/utility/adguard/service.yaml"))
                .contains("metallb.io/address-pool: lan-dns\n")
                .contains("type: LoadBalancer\n")
                .contains("externalTrafficPolicy: Local\n")
                .contains("      protocol: TCP\n      targetPort: 5353\n")
                .contains("      protocol: UDP\n      targetPort: 5353\n");

        assertThat(rendered("utility", "apps/utility/adguard/workload.yaml")).contains("enschede");
        Edit elsewhere = new Edit(
                PLATFORM_DOCUMENT,
                "  lan-dns:\n    kind: pool\n    site: enschede\n",
                "  lan-dns:\n    kind: pool\n    site: frankfurt\n");
        assertThat(renderRefusals("utility", work, elsewhere))
                .containsExactly("E_PLACEMENT_UNSATISFIABLE utility.project.yml /applications/0/processes/0/placement");
    }

    @Test
    void replicasSpreadAcrossNodesRepelEachOtherWithinOneRevisionAndNeedANodeEach(@TempDir Path work)
            throws IOException {
        assertThat(rendered("utility", "apps/utility/adguard/workload.yaml"))
                .contains("podAntiAffinity:\n")
                .contains("requiredDuringSchedulingIgnoredDuringExecution:")
                .contains("- pod-template-hash\n")
                .contains("topologyKey: kubernetes.io/hostname\n");

        Edit forty = new Edit(UTILITY, "          count: 2\n", "          count: 40\n");
        assertThat(renderRefusals("utility", work.resolve("spread"), forty))
                .containsExactly("E_PLACEMENT_UNSATISFIABLE utility.project.yml /applications/0/processes/0/replicas");
        Path unspread = renderedWith(
                "utility", work.resolve("unspread"), forty, new Edit(UTILITY, "          across: node\n", ""));
        assertThat(Files.readString(unspread.resolve("apps/utility/adguard/workload.yaml")))
                .doesNotContain("podAntiAffinity");
    }

    @Test
    void aWritablePathsSizeIsAddedToTheProcessesMemoryAndAPathNoNodeCanHoldBesideItIsRefused(@TempDir Path work)
            throws IOException {
        String workload = rendered("utility", "apps/utility/adguard/workload.yaml");
        assertThat(workload)
                .contains("medium: Memory\n            sizeLimit: 128Mi\n")
                .contains("sizeLimit: 64Mi\n")
                .contains("memory: 256Mi\n");

        assertThat(renderRefusals(
                        "utility",
                        work.resolve("held"),
                        new Edit(
                                UTILITY,
                                "{ path: /opt/adguardhome/work, memory: 128Mi }",
                                "{ path: /opt/adguardhome/work, memory: 64Gi }")))
                .containsExactly("E_PLACEMENT_UNSATISFIABLE utility.project.yml /applications/0/processes/0/placement");
        // The same path above the Process, in either form, is declared twice.
        assertThat(checkRefusals(
                        "utility",
                        work.resolve("twice"),
                        new Edit(
                                UTILITY,
                                "    processes:\n      - name: adguard\n",
                                "    writablePaths: [/opt/adguardhome/conf]\n    processes:\n      - name: adguard\n")))
                .containsExactly("E_SHARED_DECLARATION_DUPLICATED utility.project.yml /applications/0/processes/0");
        assertThat(
                        checkRefusals(
                                "utility",
                                work.resolve("memory"),
                                new Edit(
                                        UTILITY,
                                        "    processes:\n      - name: adguard\n",
                                        "    writablePaths: [{ path: /opt/adguardhome/work, memory: 128Mi }]\n    processes:\n      - name: adguard\n")))
                .containsExactly("E_SHARED_DECLARATION_DUPLICATED utility.project.yml /applications/0/processes/0");
    }

    @Test
    void theNodeAgentsAreDerivedAndACatalogThatNamesNoImageForOneIsRefusedAtTheEntry(@TempDir Path work)
            throws IOException {
        assertThat(checkRefusals("node", work.resolve("whole"))).isEmpty();

        String speaker = "  l4-speaker:\n    image: metallb-speaker\n    memory: 64Mi\n    cpu: 20m\n"
                + "    controller: { image: metallb-controller, memory: 64Mi, cpu: 10m }\n";
        String platform = "platform.intent.yml";
        assertThat(checkRefusals("node", work.resolve("speaker"), new Edit(PLATFORM_DOCUMENT, speaker, "")))
                .containsExactly("E_NO_NODE_AGENT_POLICY " + platform + " /nodeAgents/l4-speaker");
        assertThat(checkRefusals(
                        "node",
                        work.resolve("catalog"),
                        new Edit(
                                PLATFORM_DOCUMENT,
                                "nodeAgents:\n  gpu-device: { image: nvidia-device-plugin, memory: 64Mi, cpu: 10m }\n"
                                        + "  gpu-metrics: { image: dcgm-exporter, memory: 256Mi, cpu: 50m }\n"
                                        + "  node-metrics: { image: node-exporter, memory: 64Mi, cpu: 20m }\n"
                                        + speaker,
                                "")))
                .containsExactly(
                        "E_NO_NODE_AGENT_POLICY " + platform + " /nodeAgents/gpu-device",
                        "E_NO_NODE_AGENT_POLICY " + platform + " /nodeAgents/gpu-metrics",
                        "E_NO_NODE_AGENT_POLICY " + platform + " /nodeAgents/node-metrics",
                        "E_NO_NODE_AGENT_POLICY " + platform + " /nodeAgents/l4-speaker");
    }

    @Test
    void aSetWithoutTheNodeContractDerivesNoAgentAndAPoolOnASiteWithNoNodeDerivesNoAnnouncer(@TempDir Path work)
            throws IOException {
        String speaker = "  l4-speaker:\n    image: metallb-speaker\n    memory: 64Mi\n    cpu: 20m\n"
                + "    controller: { image: metallb-controller, memory: 64Mi, cpu: 10m }\n";
        Edit unnamed = new Edit(PLATFORM_DOCUMENT, speaker, "");
        List<Path> without = edited("node", work.resolve("without"), unnamed).stream()
                .filter(file -> !file.getFileName().toString().equals("node-contract.yml"))
                .toList();
        assertThat(Pipeline.check(without)).isEmpty();

        List<Edit> nowhere = new ArrayList<>(List.of(unnamed));
        for (String pool : List.of("lan-dns", "lan-edge", "lan-mqtt")) {
            nowhere.add(new Edit(
                    PLATFORM_DOCUMENT,
                    "  " + pool + ":\n    kind: pool\n    site: enschede\n",
                    "  " + pool + ":\n    kind: pool\n    site: nowhere\n"));
        }
        assertThat(checkRefusals("node", work.resolve("nowhere"), nowhere.toArray(Edit[]::new)))
                .isEmpty();
    }

    @Test
    void aNodeContractThatDoesNotReadIsRefusedAtTheContract(@TempDir Path work) throws IOException {
        assertThat(checkRefusals(
                        "node",
                        work,
                        new Edit("platform/node-contract.yml", "labelPrefix: platform.jorisjonkers.dev\n", "")))
                .containsExactly("schema node-contract.yml /labelPrefix");
    }

    @Test
    void anOffClusterCopyNamesAnAgePublicKeyAndOneThatIsNoneIsRefusedWithThePlatformDocument(@TempDir Path work)
            throws IOException {
        assertThat(rendered("data", "apps/data/platform-postgres/backup.yaml"))
                .contains("- name: BACKUP_OFF_CLUSTER_RECIPIENT\n")
                .contains("age1s6v5qrx3mgcgk37gscv8y6z43rssksdct5lx3xk5xrtptjndqvhsnhj7h8");
        String key = "      recipient: age1s6v5qrx3mgcgk37gscv8y6z43rssksdct5lx3xk5xrtptjndqvhsnhj7h8\n";
        String at = "schema platform.intent.yml /durability/irreplaceable/offCluster/recipient";
        assertThat(checkRefusals("data", work.resolve("none"), new Edit(PLATFORM_DOCUMENT, key, "")))
                .containsExactly(at);
        assertThat(checkRefusals(
                        "data",
                        work.resolve("ssh"),
                        new Edit(PLATFORM_DOCUMENT, key, "      recipient: ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAI\n")))
                .containsExactly(at);
        assertThat(checkRefusals(
                        "data",
                        work.resolve("alphabet"),
                        new Edit(PLATFORM_DOCUMENT, "recipient: age1s6v5qrx3", "recipient: age1b6v5qrx3")))
                .containsExactly(at);
    }

    @Test
    void aProcessAndASidecarCarryTheCommandAndArgumentsTheyNameAsWrittenAndNamingNoneCarriesNone(@TempDir Path work)
            throws IOException {
        Path run = renderedWith(
                "mail",
                work.resolve("named"),
                new Edit(
                        "mail/mail.project.yml",
                        "        sidecars:\n          - name: stalwart-apply\n            image: stalwart-provisioner\n",
                        "        command: [/usr/bin/stalwart]\n        args: [serve, --port=8080, \"\"]\n"
                                + "        sidecars:\n          - name: stalwart-apply\n            image: stalwart-provisioner\n"
                                + "            command: [/bin/apply]\n            args: [--verbose]\n"));
        String workload = Files.readString(run.resolve("apps/mail/stalwart/workload.yaml"));
        assertThat(workload)
                .contains("          command:\n            - /usr/bin/stalwart\n          args:\n            - serve\n"
                        + "            - --port=8080\n            - \"\"\n")
                .contains("          command:\n            - /bin/apply\n          args:\n            - --verbose\n");
        assertThat(rendered("mail", "apps/mail/stalwart/workload.yaml"))
                .doesNotContain("command:")
                .doesNotContain("args:");
        int attempt = 0;
        for (String empty : List.of("command: []", "command: [\"\"]", "args: []")) {
            assertThat(checkRefusals(
                            "mail",
                            work.resolve("empty" + attempt++),
                            new Edit(
                                    "mail/mail.project.yml",
                                    "        sidecars:\n          - name: stalwart-apply\n",
                                    "        " + empty + "\n        sidecars:\n          - name: stalwart-apply\n")))
                    .hasSize(1)
                    .allMatch(refusal -> refusal.startsWith("schema mail.project.yml /applications/"));
        }
    }

    @Test
    void aDescriptionRendersNothingAndOneOverOneHundredAndSixtyCharactersOrEmptyIsASchemaRefusal(@TempDir Path work)
            throws IOException {
        Edit application = new Edit(
                "minimal/notes.project.yml",
                "applications:\n  - id: notes\n",
                "applications:\n  - id: notes\n    description: What notes does.\n");
        Edit process = new Edit(
                "minimal/notes.project.yml",
                "      - name: notes-api\n",
                "      - name: notes-api\n        description: Serves the notes.\n");
        Path described = renderedWith("minimal", work.resolve("described"), application, process);
        try (Stream<Path> files = Files.walk(tree("minimal"))) {
            for (Path file : files.filter(Files::isRegularFile).toList()) {
                assertThat(Files.readString(described.resolve(tree("minimal").relativize(file))))
                        .as(file.toString())
                        .isEqualTo(Files.readString(file));
            }
        }
        for (Edit edit : List.of(application, process)) {
            String sentence = edit.to()
                    .substring(edit.to().indexOf("description: ") + "description: ".length())
                    .stripTrailing();
            String path =
                    edit == application ? "/applications/0/description" : "/applications/0/processes/0/description";
            assertThat(checkRefusals(
                            "minimal",
                            work.resolve("long" + (edit == application)),
                            new Edit(edit.file(), edit.from(), edit.to().replace(sentence, "x".repeat(161)))))
                    .containsExactly("schema notes.project.yml " + path);
            assertThat(checkRefusals(
                            "minimal",
                            work.resolve("empty" + (edit == application)),
                            new Edit(edit.file(), edit.from(), edit.to().replace(sentence, "\"\""))))
                    .containsExactly("schema notes.project.yml " + path);
        }
    }

    @Test
    void anOptionalKeyMakesEveryReferenceToItOptionalAndOptionalFalseIsRefused(@TempDir Path work) throws IOException {
        String optional = "key: github-pat\n                  optional: true\n";
        assertThat(rendered("agents", "apps/agents/hermes/workload.yaml")).contains(optional);

        Path required = renderedWith(
                "agents",
                work.resolve("required"),
                new Edit("agents/agents.project.yml", "- { name: github-pat, optional: true }", "- github-pat"));
        assertThat(Files.readString(required.resolve("apps/agents/hermes/workload.yaml")))
                .contains("key: github-pat\n")
                .doesNotContain(optional);
        assertThat(checkRefusals(
                        "agents",
                        work.resolve("false"),
                        new Edit(
                                "agents/agents.project.yml",
                                "- { name: github-pat, optional: true }",
                                "- { name: github-pat, optional: false }")))
                .containsExactly("schema agents.project.yml /applications/0/processes/0/secrets/0/keys/2/optional");
    }

    @Test
    void aSeededAssetIsRefusedWhereThePlatformNamesNoSeederAndWhereItLandsBelowNoVolumeOrWritablePath(
            @TempDir Path work) throws IOException {
        String seeded = "utility.project.yml /applications/0/processes/0/assets/0/seedAt";
        assertThat(checkRefusals("utility", work.resolve("whole"))).isEmpty();
        assertThat(checkRefusals(
                        "utility",
                        work.resolve("unnamed"),
                        new Edit(PLATFORM_DOCUMENT, "seeder:\n  image: busybox\n  memory: 16Mi\n  cpu: 10m\n", "")))
                // Hermes, in the foundation, seeds its config too.
                .containsExactlyInAnyOrder(
                        "E_NO_SEEDER " + seeded,
                        "E_NO_SEEDER agents.project.yml /applications/0/processes/0/assets/0/seedAt");
        assertThat(checkRefusals(
                        "utility",
                        work.resolve("retired"),
                        new Edit("platform/images.lock.yml", "  busybox:\n", "  busybox-retired:\n")))
                .containsExactly("E_UNLOCKED_IMAGE platform.intent.yml /seeder/image");
        // A lock that does not read is refused for its shape, never for the seeder it cannot be asked about.
        assertThat(checkRefusals(
                        "utility",
                        work.resolve("unreadable"),
                        new Edit("platform/images.lock.yml", "  busybox:\n", "  busybox: 5\n")))
                .noneMatch(refusal -> refusal.startsWith("E_UNLOCKED_IMAGE"));
        for (String outside : List.of(
                "/etc/AdGuardHome.yaml",
                "/opt/adguardhome/conf",
                "/opt/adguardhome/conf/",
                "/opt/adguardhome/conf/../AdGuardHome.yaml",
                "/opt/adguardhome/conf/./AdGuardHome.yaml",
                "/opt/adguardhome/conf-other/AdGuardHome.yaml")) {
            assertThat(checkRefusals(
                            "utility",
                            work.resolve("outside" + outside.hashCode()),
                            new Edit(UTILITY, "seedAt: /opt/adguardhome/conf/AdGuardHome.yaml", "seedAt: " + outside)))
                    .as(outside)
                    .containsExactly("E_SEED_OUTSIDE_VOLUME " + seeded);
        }
        // A file below a path a level above declares, or deeper below one, is where a seed may land.
        assertThat(checkRefusals(
                        "utility",
                        work.resolve("deeper"),
                        new Edit(
                                UTILITY,
                                "seedAt: /opt/adguardhome/conf/AdGuardHome.yaml",
                                "seedAt: /opt/adguardhome/conf/more/AdGuardHome.yaml")))
                .isEmpty();
        // The seeder is held beside the Process: a seeder no node can hold beside it leaves it nowhere to go.
        assertThat(renderRefusals(
                        "utility",
                        work.resolve("heavy"),
                        new Edit(PLATFORM_DOCUMENT, "  memory: 16Mi\n  cpu: 10m\n", "  memory: 40Gi\n  cpu: 10m\n")))
                .containsExactly("E_PLACEMENT_UNSATISFIABLE utility.project.yml /applications/0/processes/0/placement");
    }

    @Test
    void aSidecarMountsOnlyAnAssetItsProcessHoldsAndAnotherIsRefused(@TempDir Path work) throws IOException {
        assertThat(rendered("mail", "apps/mail/stalwart/workload.yaml"))
                .contains("mountPath: /etc/stalwart-provisioner/manifest.json\n")
                .contains("readOnly: true\n");
        assertThat(checkRefusals(
                        "mail",
                        work.resolve("unknown"),
                        new Edit(
                                "mail/mail.project.yml",
                                "            assets:\n              - { from: config/manifest.json,",
                                "            assets:\n              - { from: config/other.json,")))
                .containsExactly(
                        "E_UNKNOWN_SIDECAR_ASSET mail.project.yml /applications/0/processes/0/sidecars/0/assets/0");
        // An Asset a level above shares down to the Process is the Process's, and one a lower level
        // replaced at its path is not.
        Edit shared = new Edit(
                "mail/mail.project.yml",
                "        assets:\n          - from: config/manifest.json\n            mountAt: /etc/stalwart-provisioner/manifest.json\n",
                "");
        Edit above = new Edit(
                "mail/mail.project.yml",
                "    processes:\n",
                "    assets:\n      - { from: config/manifest.json, mountAt: /etc/stalwart-provisioner/manifest.json }\n    processes:\n");
        assertThat(checkRefusals("mail", work.resolve("shared"), shared, above)).isEmpty();
        // A lower level that holds the path replaces what the level above shares at it.
        Edit replacing = new Edit(
                "mail/mail.project.yml",
                "          - from: config/manifest.json\n            mountAt: /etc/stalwart-provisioner/manifest.json\n",
                "          - from: config/other.json\n            mountAt: /etc/stalwart-provisioner/manifest.json\n");
        List<Path> files = edited("mail", work.resolve("replaced"), replacing, above);
        Files.writeString(work.resolve("replaced/mail/config/other.json"), "{}\n");
        assertThat(Pipeline.check(files).stream().map(ModelWitnessesTest::described))
                .containsExactly(
                        "E_UNKNOWN_SIDECAR_ASSET mail.project.yml /applications/0/processes/0/sidecars/0/assets/0");
    }

    @Test
    void aClientTakesTheFieldsItsSignInModeTakesAndRequiresWhatItNeedsAndTheLogoutPathIsANativeClientsAlone(
            @TempDir Path work) throws IOException {
        Edit logout = new Edit(
                "identity/identity.project.yml",
                "      redirectPaths: [/callback, /silent-renew]\n",
                "      redirectPaths: [/callback, /silent-renew]\n      backChannelLogoutPath: /logout/backchannel\n");
        Path native_ = renderedWith("identity", work.resolve("native"), logout);
        String client = Files.readString(native_.resolve("apps/identity/portal/client.yaml"));
        assertThat(client)
                .contains(
                        "    - https://home.jorisjonkers.dev/silent-renew\n"
                                + "  backChannelLogoutUri: https://home.jorisjonkers.dev/logout/backchannel\n  credential: pkce\n");
        assertThat(rendered("identity", "apps/identity/portal/client.yaml")).doesNotContain("backChannelLogoutUri");

        String gated = "identity.project.yml /applications/2/client/";
        assertThat(checkRefusals(
                        "identity",
                        work.resolve("gated"),
                        new Edit(
                                "identity/identity.project.yml",
                                "      iconPath: /favicon.ico\n",
                                "      iconPath: /favicon.ico\n      backChannelLogoutPath: /logout\n      credential: pkce\n"
                                        + "      redirectPaths: [/callback]\n      protectedPath: /api\n")))
                .containsExactlyInAnyOrder(
                        "E_CLIENT_FIELD_FOR_MODE " + gated + "redirectPaths",
                        "E_CLIENT_FIELD_FOR_MODE " + gated + "protectedPath",
                        "E_CLIENT_FIELD_FOR_MODE " + gated + "backChannelLogoutPath",
                        "E_CLIENT_FIELD_FOR_MODE " + gated + "credential");
        assertThat(checkRefusals(
                        "identity",
                        work.resolve("missing"),
                        new Edit("identity/identity.project.yml", "      label: Who am I\n", "")))
                .containsExactly("E_CLIENT_FIELD_FOR_MODE " + gated.substring(0, gated.length() - 1));
        assertThat(checkRefusals(
                        "identity",
                        work.resolve("nativeless"),
                        new Edit("identity/identity.project.yml", "      credential: pkce\n", "")))
                .containsExactly("E_CLIENT_FIELD_FOR_MODE identity.project.yml /applications/1/client");
        assertThat(
                        checkRefusals(
                                "identity",
                                work.resolve("token"),
                                new Edit(
                                        "identity/identity.project.yml",
                                        "      signIn: gated\n      label: Who am I\n      iconPath: /favicon.ico\n",
                                        "      signIn: token\n      label: Who am I\n      description: d\n      iconPath: /favicon.ico\n      launchPath: /\n")))
                .contains(
                        "E_CLIENT_FIELD_FOR_MODE " + gated + "label",
                        "E_CLIENT_FIELD_FOR_MODE " + gated + "description",
                        "E_CLIENT_FIELD_FOR_MODE " + gated + "iconPath",
                        "E_CLIENT_FIELD_FOR_MODE " + gated + "launchPath");
    }

    @Test
    void theL4SpeakerStartsOnMetalLbZeroFifteenThreeReadingSecretsInItsOwnNamespaceAlone() {
        String speaker = rendered("node", "apps/node/l4-speaker/workload.yaml");
        assertThat(speaker)
                .contains("- name: METALLB_POD_NAME\n              valueFrom:\n                fieldRef:\n"
                        + "                  fieldPath: metadata.name\n");

        String rbac = rendered("node", "apps/node/l4-speaker/rbac.yaml");
        assertThat(object(rbac, "ClusterRole", "node:l4-speaker"))
                .contains("      - configurationstates\n      - configurationstates/status\n")
                .doesNotContain("secrets");
        assertThat(object(rbac, "ClusterRole", "node:l4-controller"))
                .contains("      - services\n      - namespaces\n      - nodes\n")
                .contains("      - configurationstates\n")
                .doesNotContain("secrets");
        String speakerRole = object(rbac, "Role", "l4-speaker");
        assertThat(speakerRole)
                .contains("  namespace: node-system\n")
                .contains("      - secrets\n      - configmaps\n")
                .contains("      - servicebgpstatuses\n");
        assertThat(object(rbac, "Role", "l4-controller"))
                .contains("      - secrets\n      - configmaps\n")
                .doesNotContain("servicebgpstatuses");
        assertThat(object(rbac, "RoleBinding", "l4-speaker"))
                .contains("  kind: Role\n  name: l4-speaker\n")
                .contains("    name: l4-speaker\n    namespace: node-system");
    }

    @Test
    void theGpuDeviceHandsOutEachCardByItsIndex() {
        assertThat(rendered("node", "apps/node/gpu-device/workload.yaml"))
                .contains("- name: DEVICE_ID_STRATEGY\n              value: index\n");
    }

    @Test
    void theL4SpeakerRunsMemberlistKeyedByTheNodeProjectsOwnGeneratedKeyAndWithoutAPolicyJobNone(@TempDir Path work)
            throws IOException {
        assertThat(rendered("node", "apps/node/l4-speaker/workload.yaml"))
                .contains("- name: METALLB_ML_BIND_ADDR\n              valueFrom:\n                fieldRef:\n"
                        + "                  fieldPath: status.podIP\n")
                .contains("- name: METALLB_ML_LABELS\n              value: app.kubernetes.io/name=l4-speaker\n")
                .contains("- name: METALLB_ML_BIND_PORT\n              value: \"7946\"\n")
                .contains("- name: METALLB_ML_SECRET_KEY_PATH\n              value: /etc/ml_secret_key\n")
                .contains("            - name: memberlist\n              mountPath: /etc/ml_secret_key\n")
                .contains("secretName: l4-speaker-memberlist\n");
        String synced =
                object(rendered("node", "apps/node/l4-speaker/vso.yaml"), "VaultStaticSecret", "l4-speaker-memberlist");
        assertThat(synced)
                .contains("  vaultAuthRef: l4-speaker\n")
                .contains("  path: node-system/l4-speaker\n")
                .contains("    - kind: DaemonSet\n      name: l4-speaker\n");
        String policies = "apps/node/vault-policy/policies/";
        assertThat(capabilities(
                        rendered("node", policies + "node-system-l4-speaker.policy.json"),
                        "secret/data/node-system/l4-speaker"))
                .containsExactly("read");
        assertThat(rendered("node", policies + "node-system.generated.json"))
                .contains("\"path\": \"secret/data/node-system/l4-speaker\"")
                .contains("\"key\": \"secretkey\"");
        assertThat(rendered("node", "apps/node/kustomization.yaml"))
                .contains("  - vault-policy\n  - vaultconnection.yaml\n");

        Path unkeyed = renderedWith(
                "node",
                work,
                new Edit(
                        PLATFORM_DOCUMENT,
                        "policyJob:\n  image: vault-policy\n  role: policy-admin\n  memory: 64Mi\n  cpu: 10m\n"
                                + "  deadline: 120s\n",
                        ""));
        assertThat(Files.readString(unkeyed.resolve("apps/node/l4-speaker/workload.yaml")))
                .contains("METALLB_POD_NAME")
                .doesNotContain("METALLB_ML_")
                .doesNotContain("memberlist");
        assertThat(unkeyed.resolve("apps/node/l4-speaker/vso.yaml")).doesNotExist();
        assertThat(unkeyed.resolve("apps/node/vault-policy")).doesNotExist();
        assertThat(unkeyed.resolve("apps/node/vaultconnection.yaml")).doesNotExist();
    }

    @Test
    void aMongoResolvesItsOwnServiceNameToItselfAndAProcessOfAnyOtherEngineToNothing() {
        assertThat(rendered("data", "apps/data/platform-mongo/workload.yaml"))
                .contains("      hostAliases:\n        - ip: 127.0.0.1\n          hostnames:\n"
                        + "            - mongo.data-system.svc.cluster.local\n");
        assertThat(rendered("data", "apps/data/platform-postgres/workload.yaml"))
                .doesNotContain("hostAliases");
        assertThat(rendered("auth", "apps/auth/auth/workload.yaml")).doesNotContain("hostAliases");
    }

    @Test
    void anHourlyPolicyOrCatalogRunGivesUpWithinTheHourAndTheOneShotJobRetriesUntilItSucceeds() {
        for (String[] hourly : new String[][] {
            {"auth", "apps/auth/vault-policy/cronjob.yaml"},
            {"knowledge-platform", "estate/vso-secrets/postgres-catalog.yaml"}
        }) {
            assertThat(object(
                            rendered(hourly[0], hourly[1]),
                            "CronJob",
                            hourly[1].contains("catalog") ? "postgres-catalog" : "vault-policy"))
                    .as(hourly[1])
                    .contains("      backoffLimit: 6\n      activeDeadlineSeconds: 3000\n");
        }
        // The one-shot Job's pod keeps the attempt deadline every pod of it has; the Job itself none.
        assertThat(rendered("auth", "apps/auth/vault-policy/job.yaml"))
                .contains("spec:\n  backoffLimit: 2147483647\n  template:\n");
    }

    @Test
    void theMonitoringStacksPrometheusAndAlertmanagerRenderAsTheOperatorsObjectsAndAProcessItCannotRunIsRefused(
            @TempDir Path work) throws IOException {
        String prometheus = rendered("observability", "apps/observability/prometheus/workload.yaml");
        assertThat(prometheus)
                .contains("kind: Prometheus\n")
                .contains("  portName: http\n")
                .contains("    - name: prometheus\n")
                .contains("  serviceMonitorSelector:\n    matchLabels:\n      release: metrics-stack\n")
                .contains("  ruleSelector:\n    matchLabels:\n      app.kubernetes.io/managed-by: deploy-kit\n")
                .contains("      - namespace: observability-system\n        name: alertmanager\n        port: http\n")
                .doesNotContain("app.kubernetes.io/instance: prometheus\n      app.kubernetes.io/part-of: prometheus\n"
                        + "      app.kubernetes.io/managed-by");
        assertThat(rendered("observability", "apps/observability/alertmanager/workload.yaml"))
                .contains("kind: Alertmanager\n")
                .contains("  alertmanagerConfigSelector:\n    matchLabels:\n")
                .contains("  alertmanagerConfigMatcherStrategy:\n    type: None\n");

        Path flagged = renderedWith(
                "observability",
                work,
                new Edit(
                        "observability/observability.project.yml",
                        "        writablePaths: [/prometheus]\n",
                        "        writablePaths: [/prometheus]\n        args: [--storage.tsdb.retention.time=7d,"
                                + " --storage.tsdb.retention.time=15d, --enable-feature=exemplar-storage,"
                                + " --web.enable-remote-write-receiver, --log.level=debug, --query.max-concurrency]\n"),
                new Edit(
                        "observability/observability.project.yml",
                        "        writablePaths: [/alertmanager]\n",
                        "        writablePaths: [/alertmanager]\n        secrets:\n"
                                + "          - path: secret/data/platform/alertmanager/extra\n"
                                + "            keys: [token]\n            access: read\n            delivery: env\n"
                                + "            rotation: {tolerates: restart}\n"));
        assertThat(Files.readString(flagged.resolve("apps/observability/prometheus/workload.yaml")))
                .contains("  additionalArgs:\n    - name: log.level\n      value: debug\n"
                        + "    - name: query.max-concurrency\n")
                .contains("  retention: 15d\n")
                .contains("  enableRemoteWriteReceiver: true\n")
                .contains("  enableFeatures:\n    - exemplar-storage\n")
                .doesNotContain("7d");
        assertThat(Files.readString(flagged.resolve("apps/observability/alertmanager/vso.yaml")))
                .contains("  rolloutRestartTargets:\n    - kind: StatefulSet\n      name: alertmanager-alertmanager\n");

        assertThat(refusal("operated-process"))
                .containsExactlyInAnyOrder(
                        "E_OPERATED_PROCESS /applications/0/processes/0/args/0",
                        "E_OPERATED_PROCESS /applications/0/processes/0/cutover",
                        "E_OPERATED_PROCESS /applications/1/processes/0/provides");
    }

    @Test
    void everyProcessThatAnswersATierHoldsTheApiAccessItsProxyReadsRoutesWithAndNoApiAccessBlockIsRefused()
            throws IOException {
        String rbac = rendered("edge", "apps/edge/traefik-public/rbac.yaml");
        assertThat(object(rbac, "ClusterRole", "edge-system-traefik-public"))
                .contains("      - services\n      - secrets\n      - nodes\n      - configmaps\n      - namespaces\n")
                .contains("      - traefik.io\n")
                .contains("      - ingressroutes\n")
                .contains("      - tlsstores\n");
        assertThat(rendered("edge", "apps/edge/traefik-lan/workload.yaml"))
                .contains("automountServiceAccountToken: true\n");
        assertThat(rendered("edge", "apps/edge/traefik-lan/networkpolicy.yaml")).contains("cidr: 10.43.0.1/32\n");
        assertThat(refusal("no-api-access-policy"))
                .containsExactly("E_NO_API_ACCESS_POLICY /applications/0/processes/0");
    }

    @Test
    void aTlsTierThatIssuesNoCertificateServesTheOneItReadsFromTheSecretStoreAndElsewhereItIsRefused(@TempDir Path work)
            throws IOException {
        String from = "secret/data/platform/tls/wildcard";
        Edit tls = new Edit(
                PLATFORM_DOCUMENT,
                "listener: plain\n    certificates: none\n",
                "listener: tls\n    certificates: none\n    certificateFrom: " + from + "\n");
        Path held = renderedWith(
                "edge",
                work.resolve("held"),
                tls,
                new Edit(
                        "edge/edge.project.yml",
                        "          web: 8000\n          admin: 8080\n",
                        "          web: 8000\n          websecure: 8443\n          admin: 8080\n"));
        assertThat(Files.readString(held.resolve("apps/edge/traefik-lan/tlsstore.yaml")))
                .contains("kind: TLSStore\nmetadata:\n  name: default\n  namespace: edge-system\n")
                .contains("    app.kubernetes.io/part-of: traefik-lan\n")
                .contains("  defaultCertificate:\n    secretName: traefik-lan-platform-tls-wildcard\n");
        assertThat(Files.readString(held.resolve("apps/edge/traefik-lan/kustomization.yaml")))
                .contains("  - tlsstore.yaml\n");
        String synced = object(
                Files.readString(held.resolve("apps/edge/traefik-lan/vso.yaml")),
                "VaultStaticSecret",
                "traefik-lan-platform-tls-wildcard");
        assertThat(synced)
                .contains("  vaultAuthRef: traefik-lan\n")
                .contains("  path: platform/tls/wildcard\n")
                .doesNotContain("rolloutRestartTargets");
        assertThat(Files.readString(held.resolve("apps/edge/traefik-lan/workload.yaml")))
                .doesNotContain("traefik-lan-platform-tls-wildcard");
        assertThat(held.resolve("apps/edge/traefik-public/tlsstore.yaml")).doesNotExist();

        assertThat(refusal("certificate-from-unserved"))
                .containsExactly("E_CERTIFICATE_FROM_UNSERVED /tiers/0/certificateFrom");
        assertThat(refusal("certificate-from-repeated"))
                .containsExactly("E_CERTIFICATE_FROM_REPEATED /tiers/1/certificateFrom");
        Path platform = work.resolve("storeless/platform.intent.yml");
        Files.createDirectories(platform.getParent());
        Files.writeString(
                platform,
                Examples.read(PLATFORM_DOCUMENT)
                        .replace(
                                "listener: plain\n    certificates: none\n",
                                "listener: tls\n    certificates: none\n    certificateFrom: " + from + "\n")
                        .replace("secretStore: secrets/vault\n", ""));
        assertThat(Pipeline.check(List.of(platform)).stream().map(ModelWitnessesTest::described))
                .contains("E_NO_SECRET_STORE platform.intent.yml /tiers/1/certificateFrom");
    }

    @Test
    void theMonitoringStacksGrafanaRendersItsInstanceReadsOneGeneratedAdminAndDerivesItsDataSources(@TempDir Path work)
            throws IOException {
        assertThat(rendered("observability", "apps/observability/grafana/grafana.yaml"))
                .contains("kind: Grafana\n")
                .contains("    dashboards: grafana\n")
                .contains("    url: http://grafana.observability-system:3000\n")
                .contains("    adminUser:\n      name: grafana-observability-system-grafana-admin\n      key: user\n")
                .contains("    adminPassword:\n      name: grafana-observability-system-grafana-admin\n"
                        + "      key: password\n");
        assertThat(rendered("observability", "apps/observability/grafana/workload.yaml"))
                .contains("- name: GF_SECURITY_ADMIN_PASSWORD\n")
                .contains("- name: GF_SECURITY_ADMIN_USER\n");
        assertThat(rendered(
                        "observability",
                        "apps/observability/vault-policy/policies/observability-system.generated.json"))
                .contains("\"path\": \"secret/data/observability-system/grafana-admin\"");

        Path sourced = renderedWith(
                "observability",
                work.resolve("sourced"),
                new Edit(
                        "observability/observability.project.yml",
                        "        writablePaths: [/var/lib/grafana]\n",
                        "        writablePaths: [/var/lib/grafana]\n        dependsOn:\n"
                                + "          - {application: prometheus, surface: http}\n"
                                + "          - {application: tempo, surface: http}\n"));
        String configMap = Files.readString(sourced.resolve("apps/observability/grafana/configmap.yaml"));
        assertThat(configMap)
                .contains("datasources.yaml")
                .contains("\"uid\": \"prometheus\"")
                .contains("\"uid\": \"tempo\"")
                .contains("\"isDefault\": true")
                .contains("\"datasourceUid\": \"tempo\"")
                .doesNotContain("\"uid\": \"loki\"");
        assertThat(Files.readString(sourced.resolve("apps/observability/grafana/workload.yaml")))
                .contains("mountPath: /etc/grafana/provisioning/datasources/datasources.yaml\n");

        assertThat(checkRefusals(
                        "observability",
                        work.resolve("unknown"),
                        new Edit(
                                PLATFORM_DOCUMENT,
                                "    loki: observability/loki\n",
                                "    loki: observability/nowhere\n")))
                .contains("E_UNKNOWN_MONITORING_APPLICATION platform.intent.yml /monitoring/stores/loki");
        assertThat(checkRefusals(
                        "observability",
                        work.resolve("rules"),
                        new Edit(
                                "observability/observability.project.yml",
                                "  - id: loki\n",
                                "  - id: loki\n    alertRules:\n      - {from: rules/platform.yaml}\n")))
                .contains("E_ALERT_RULES_OUTSIDE_MONITORING observability.project.yml /applications/6/alertRules");
    }

    @Test
    void theMetricsStackScrapesK3sWhereTheBootstrapSetRecordsItAndAComponentItDoesNotRecordIsNotScraped(
            @TempDir Path work) throws IOException {
        String monitors = rendered("observability", "apps/observability/prometheus/k3s-monitors.yaml");
        assertThat(object(monitors, "Secret", "prometheus-token"))
                .contains("    kubernetes.io/service-account.name: prometheus\n");
        assertThat(object(monitors, "ClusterRole", "observability-system-prometheus-k3s"))
                .contains("      - nodes/metrics\n")
                .contains("  - nonResourceURLs:\n      - /metrics\n");
        assertThat(object(monitors, "ScrapeConfig", "kubelet-cadvisor"))
                .contains("  metricsPath: /metrics/cadvisor\n")
                .contains("      replacement: $1:10250\n")
                .contains("    release: metrics-stack\n");
        assertThat(object(monitors, "ServiceMonitor", "apiserver"))
                .contains("      - default\n")
                .contains("    - port: https\n");
        assertThat(object(monitors, "PodMonitor", "coredns"))
                .contains("      - kube-system\n")
                .contains("    - portNumber: 9153\n");
        assertThat(rendered("observability", "apps/observability/prometheus/workload.yaml"))
                .contains(
                        "  scrapeConfigSelector:\n    matchLabels:\n      app.kubernetes.io/managed-by: deploy-kit\n");

        Path dnsless = renderedWith(
                "observability",
                work.resolve("dnsless"),
                new Edit(PLATFORM_DOCUMENT, "      coreDns: {port: 9153}\n", ""));
        assertThat(Files.readString(dnsless.resolve("apps/observability/prometheus/k3s-monitors.yaml")))
                .contains("kind: ServiceMonitor\n")
                .doesNotContain("kind: PodMonitor\n");
        Path unrecorded = renderedWith(
                "observability",
                work.resolve("unrecorded"),
                new Edit(
                        PLATFORM_DOCUMENT,
                        "  k3s:\n    metrics:\n      kubelet: {port: 10250}\n"
                                + "      apiServer: {service: default/kubernetes, port: https}\n"
                                + "      coreDns: {port: 9153}\n",
                        ""));
        assertThat(unrecorded.resolve("apps/observability/prometheus/k3s-monitors.yaml"))
                .doesNotExist();
    }
}
