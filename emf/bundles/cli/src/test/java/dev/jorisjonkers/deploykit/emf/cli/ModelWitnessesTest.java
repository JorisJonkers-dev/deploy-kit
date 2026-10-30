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
                .contains("- name: tcp-80\n              containerPort: 8000\n              hostPort: 80\n")
                .contains("- name: tcp-443\n              containerPort: 8443\n              hostPort: 443\n")
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
}
