package dev.jorisjonkers.deploykit.emf.cli;

import static org.assertj.core.api.Assertions.assertThat;

import dev.jorisjonkers.deploykit.emf.metamodel.resolveddeployment.Cutover;
import dev.jorisjonkers.deploykit.emf.metamodel.resolveddeployment.EnvEntry;
import dev.jorisjonkers.deploykit.emf.metamodel.resolveddeployment.GateMember;
import dev.jorisjonkers.deploykit.emf.metamodel.resolveddeployment.InputDigest;
import dev.jorisjonkers.deploykit.emf.metamodel.resolveddeployment.PinnedInput;
import dev.jorisjonkers.deploykit.emf.metamodel.resolveddeployment.Provenance;
import dev.jorisjonkers.deploykit.emf.metamodel.resolveddeployment.ReconcileUnit;
import dev.jorisjonkers.deploykit.emf.metamodel.resolveddeployment.ReleaseGate;
import dev.jorisjonkers.deploykit.emf.metamodel.resolveddeployment.ResolvedApplication;
import dev.jorisjonkers.deploykit.emf.metamodel.resolveddeployment.ResolvedDeployment;
import dev.jorisjonkers.deploykit.emf.metamodel.resolveddeployment.ResolvedDeploymentFactory;
import dev.jorisjonkers.deploykit.emf.metamodel.resolveddeployment.ResolvedPlacement;
import dev.jorisjonkers.deploykit.emf.metamodel.resolveddeployment.ResolvedProbe;
import dev.jorisjonkers.deploykit.emf.metamodel.resolveddeployment.ResolvedProcess;
import dev.jorisjonkers.deploykit.emf.metamodel.resolveddeployment.ResolvedVolume;
import java.io.IOException;
import java.math.BigDecimal;
import java.math.BigInteger;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.function.Consumer;
import java.util.stream.Stream;
import org.eclipse.emf.common.util.EList;
import org.eclipse.emf.common.util.Enumerator;
import org.eclipse.emf.common.util.TreeIterator;
import org.eclipse.emf.common.util.URI;
import org.eclipse.emf.ecore.EAttribute;
import org.eclipse.emf.ecore.EEnum;
import org.eclipse.emf.ecore.EObject;
import org.eclipse.emf.ecore.EReference;
import org.eclipse.emf.ecore.EStructuralFeature;
import org.eclipse.emf.ecore.resource.Resource;
import org.eclipse.emf.ecore.util.EcoreUtil;
import org.junit.jupiter.api.Test;

/**
 * The tests' model comparison (ModelDiff), held to what it decides and how it says it: each kind of
 * difference is reported once, by its keyed path, and no real difference ever compares equal.
 */
class ModelDiffTest {

    private static final ResolvedDeploymentFactory MODEL = ResolvedDeploymentFactory.eINSTANCE;

    private static final String FILE = "m.resolveddeployment";

    @Test
    void twoModelsThatHoldTheSameAreEqual() {
        assertThat(differences(deployment(), deployment())).isEmpty();
        assertThat(ModelDiff.differences(FILE, List.of(), List.of())).isEmpty();
    }

    @Test
    void aChangedAttributeIsOneLineAtItsKeyedPath() {
        assertThat(differences(
                        deployment(), edited(d -> process(d, "notes", "api").setMemory("512Mi"))))
                .containsExactly(
                        FILE + "#1 .applications[id=\"notes\"].processes[name=\"api\"].memory: expected \"256Mi\", got"
                                + " \"512Mi\"");
    }

    @Test
    void anUnsettableFeatureSetToItsDefaultDiffersFromOneUnset() {
        ResolvedDeployment set = edited(d -> process(d, "notes", "api").setCutover(Cutover.CONTINUOUS));

        assertThat(differences(set, deployment()))
                .containsExactly(FILE + "#1 .applications[id=\"notes\"].processes[name=\"api\"].cutover: expected set "
                        + Cutover.CONTINUOUS + ", got unset " + Cutover.CONTINUOUS);
    }

    @Test
    void anAddedChildIsOneLineNamingIt() {
        ResolvedDeployment added =
                edited(d -> process(d, "notes", "api").getEnvironment().add(1, env("DEBUG", "1")));

        assertThat(differences(deployment(), added))
                .containsExactly(FILE + "#1 .applications[id=\"notes\"].processes[name=\"api\"].environment"
                        + "[name=\"DEBUG\"]: extra (got a EnvEntry)");
    }

    @Test
    void aRemovedSubtreeIsOneLineSayingHowMuchItHeld() {
        ResolvedDeployment removed = edited(d -> EcoreUtil.delete(process(d, "notes", "worker"), true));

        assertThat(differences(deployment(), removed))
                .containsExactly(FILE + "#1 .applications[id=\"notes\"].processes[name=\"worker\"]: missing (expected"
                        + " a ResolvedProcess holding 2 objects)");
    }

    @Test
    void aReorderedListIsOneMoveNotAShiftOfEveryItemAfterIt() {
        ResolvedDeployment moved =
                edited(d -> process(d, "notes", "api").getEnvironment().move(2, 0));

        assertThat(differences(deployment(), moved))
                .containsExactly(FILE + "#1 .applications[id=\"notes\"].processes[name=\"api\"].environment"
                        + "[name=\"A\"]: moved from index 0 to 2");
    }

    @Test
    void aChangedReferenceNamesBothTargetsByKeyNotByIndex() {
        ResolvedDeployment retargeted = edited(d -> d.getApplications()
                .get(0)
                .setReconcileUnit(d.getReconcileUnits().get(1)));

        assertThat(differences(deployment(), retargeted))
                .containsExactly(FILE + "#1 .applications[id=\"notes\"].reconcileUnit: expected ReconcileUnit ->"
                        + " .reconcileUnits[name=\"apps\"], got ReconcileUnit -> .reconcileUnits[name=\"data\"]");
    }

    @Test
    void aManyValuedAttributeOrReferenceReportsEachValue() {
        ResolvedDeployment edited = edited(d -> {
            EList<String> nodes = process(d, "notes", "api").getPlacement().getEligibleNodes();
            nodes.add("node-c");
            nodes.remove("node-a");
            d.getReconcileUnits().get(0).getAfter().clear();
        });

        assertThat(differences(deployment(), edited))
                .containsExactly(
                        FILE + "#1 .applications[id=\"notes\"].processes[name=\"api\"].placement.eligibleNodes: extra"
                                + " \"node-c\"",
                        FILE + "#1 .applications[id=\"notes\"].processes[name=\"api\"].placement.eligibleNodes:"
                                + " missing \"node-a\"",
                        FILE + "#1 .reconcileUnits[name=\"apps\"].after: missing ReconcileUnit -> .reconcileUnits"
                                + "[name=\"data\"]");
        assertThat(differences(
                        deployment(),
                        edited(d -> process(d, "notes", "api")
                                .getPlacement()
                                .getEligibleNodes()
                                .move(1, 0))))
                .containsExactly(
                        FILE + "#1 .applications[id=\"notes\"].processes[name=\"api\"].placement.eligibleNodes:"
                                + " \"node-a\" moved from index 0 to 1");
    }

    /** Two input digests share the name production; the pinned input they digest tells them apart. */
    @Test
    void aKeyOneFieldCannotMakeUniqueIsMadeOfTwo() {
        ResolvedDeployment changed =
                edited(d -> d.getProvenance().getInputDigests().get(1).setDigest("sha256:22"));

        assertThat(differences(deployment(), changed))
                .containsExactly(FILE + "#1 .provenance.inputDigests[input=" + PinnedInput.CLUSTER_STATE
                        + ",name=\"production\"].digest: expected \"sha256:2\", got \"sha256:22\"");
    }

    @Test
    void anItemWithNoKeyIsNamedByAReferenceToAKeyedObject() {
        ResolvedDeployment edited = edited(d -> d.getApplications()
                .get(0)
                .getReleaseGate()
                .getMembers()
                .get(0)
                .getChecks()
                .clear());

        assertThat(differences(deployment(), edited))
                .singleElement()
                .asString()
                .startsWith(FILE + "#1 .applications[id=\"notes\"].releaseGate.members[process=.applications"
                        + "[id=\"notes\"].processes[name=\"api\"]].checks: missing ");
    }

    @Test
    void anItemWithNoKeyAtAllIsPairedBySimilarityAndSaysSo() {
        ResolvedDeployment resized =
                edited(d -> process(d, "notes", "api").getVolumes().get(1).setSize("20Gi"));

        assertThat(differences(deployment(), resized))
                .containsExactly(FILE + "#1 .applications[id=\"notes\"].processes[name=\"api\"].volumes[1].size:"
                        + " expected \"2Gi\", got \"20Gi\"" + ModelDiff.SIMILARITY);
    }

    @Test
    void twoItemsSharingAKeyAreBothPairedBySimilarity() {
        ResolvedDeployment twice = edited(d -> {
            EList<EnvEntry> environment = process(d, "notes", "api").getEnvironment();
            environment.add(env("A", "other"));
        });
        ResolvedDeployment changed = EcoreUtil.copy(twice);
        process(changed, "notes", "api").getEnvironment().get(3).setValue("changed");

        assertThat(differences(twice, changed))
                .containsExactly(FILE + "#1 .applications[id=\"notes\"].processes[name=\"api\"].environment[3].value:"
                        + " expected \"other\", got \"changed\"" + ModelDiff.SIMILARITY);
    }

    @Test
    void anObjectOfAnotherClassUnderTheSameKeyIsRemovedAndAdded() {
        ResolvedDeployment tcp =
                edited(d -> process(d, "notes", "api").getReadiness().setTarget(MODEL.createTcpTarget()));

        assertThat(differences(deployment(), tcp))
                .containsExactlyInAnyOrder(
                        FILE + "#1 .applications[id=\"notes\"].processes[name=\"api\"].readiness.target: missing"
                                + " (expected a HttpTarget)",
                        FILE + "#1 .applications[id=\"notes\"].processes[name=\"api\"].readiness.target: extra (got a"
                                + " TcpTarget)");
    }

    @Test
    void aRootAddedRemovedOrMovedIsReportedByItsIndex() {
        ResolvedDeployment other = MODEL.createResolvedDeployment();
        other.setApiVersion("other");

        assertThat(ModelDiff.differences(FILE, List.of(deployment()), List.of(deployment(), other)))
                .containsExactly(FILE + "#2: extra root (got a ResolvedDeployment)");
        assertThat(ModelDiff.differences(FILE, List.of(deployment(), other), List.of(deployment())))
                .containsExactly(FILE + "#2: missing root (expected a ResolvedDeployment)");
    }

    @Test
    void aReferenceIntoAnotherRootNamesThatRoot() {
        ResolvedDeployment first = deployment();
        ResolvedDeployment second = deployment();
        second.getApplications().get(0).setId("other");
        Resource expected = resource(EcoreUtil.copyAll(List.of(first, second)));
        Resource actual = resource(EcoreUtil.copyAll(List.of(first, second)));
        ((ResolvedDeployment) actual.getContents().get(0))
                .getApplications()
                .get(0)
                .setReconcileUnit(((ResolvedDeployment) actual.getContents().get(1))
                        .getReconcileUnits()
                        .get(0));

        assertThat(ModelDiff.differences(FILE, expected, actual))
                .singleElement()
                .asString()
                .isEqualTo(FILE + "#1 .applications[id=\"notes\"].reconcileUnit: expected ReconcileUnit -> #1"
                        + " .reconcileUnits[name=\"apps\"], got ReconcileUnit -> #2 .reconcileUnits[name=\"apps\"]");
    }

    /** The same pair, freshly built and compared five times, reports the same lines in the same order. */
    @Test
    void theReportIsTheSameEveryRun() throws IOException {
        Path golden = Stages.expected("resolve", "knowledge-platform").resolve("knowledge-platform.resolveddeployment");
        URI uri = URI.createFileURI(golden.toAbsolutePath().toString());
        byte[] bytes = Files.readAllBytes(golden);
        List<List<String>> runs = new ArrayList<>();
        for (int i = 0; i < 5; i++) {
            Resource actual = Comparison.load(uri, bytes);
            ResolvedDeployment root = (ResolvedDeployment) actual.getContents().get(0);
            root.getApplications().move(0, 1);
            EcoreUtil.delete(root.getApplications().get(0).getProcesses().get(0), true);
            root.getProvenance().getInputDigests().get(0).setDigest("x");
            runs.add(ModelDiff.differences("k", Comparison.load(uri, bytes), actual));
        }
        assertThat(runs.get(0)).isNotEmpty();
        assertThat(runs).allSatisfy(run -> assertThat(run).isEqualTo(runs.get(0)));
    }

    /**
     * No real difference compares equal: over every model the stage goldens hold, each attribute of
     * each class changed and unset, each list emptied of an item and reordered, and each reference
     * moved to another target or unset, each one at a time, is reported.
     */
    @Test
    void noRealDifferenceEverComparesEqual() throws IOException {
        List<Path> goldens;
        try (Stream<Path> tree = Files.walk(Stages.root())) {
            goldens = tree.filter(path ->
                            path.toString().endsWith(".xmi") || path.toString().endsWith(Stages.RESOLVED_MODEL))
                    .sorted(Comparator.comparingLong(ModelDiffTest::size).thenComparing(Path::toString))
                    .toList();
        }
        Stages.resources();
        Set<String> tried = new HashSet<>();
        List<String> passed = new ArrayList<>();
        for (Path golden : goldens) {
            URI uri = URI.createFileURI(golden.toAbsolutePath().toString());
            byte[] bytes = Files.readAllBytes(golden);
            Resource expected = Comparison.load(uri, bytes);
            Resource actual = Comparison.load(uri, bytes);
            for (TreeIterator<EObject> objects = expected.getAllContents(); objects.hasNext(); ) {
                EObject object = objects.next();
                for (EStructuralFeature feature : object.eClass().getEAllStructuralFeatures()) {
                    if (feature.isDerived() || feature.isTransient()) {
                        continue;
                    }
                    for (Mutation mutation : Mutation.values()) {
                        String kind = object.eClass().getName() + "." + feature.getName() + " " + mutation;
                        if (tried.contains(kind)) {
                            continue;
                        }
                        // A mutation that does not apply leaves the copy as it was, so only an
                        // applied one costs a fresh load.
                        if (mutation.apply(twin(expected, actual, object), feature)) {
                            tried.add(kind);
                            if (ModelDiff.differences(golden.getFileName().toString(), expected, actual)
                                    .isEmpty()) {
                                passed.add(kind + " in " + golden.getFileName());
                            }
                            actual = Comparison.load(uri, bytes);
                        }
                    }
                }
            }
        }
        assertThat(passed).as("differences that compared equal").isEmpty();
        assertThat(tried).as("the kinds of difference tried").hasSizeGreaterThan(1500);
    }

    /** One way to change one feature of one object; {@link #apply} says whether it applied. */
    private enum Mutation {
        CHANGE,
        UNSET,
        REMOVE,
        REORDER,
        RETARGET;

        boolean apply(EObject object, EStructuralFeature feature) {
            boolean set = object.eIsSet(feature);
            return switch (this) {
                case CHANGE ->
                    set && !feature.isMany() && feature instanceof EAttribute attribute && change(object, attribute);
                case UNSET -> set && !feature.isMany() && unset(object, feature);
                case REMOVE -> set && feature.isMany() && remove(object, feature);
                case REORDER -> set && feature.isMany() && reorder(object, feature);
                case RETARGET ->
                    set
                            && !feature.isMany()
                            && feature instanceof EReference reference
                            && !reference.isContainment()
                            && retarget(object, reference);
            };
        }

        private static boolean change(EObject object, EAttribute attribute) {
            Object value = object.eGet(attribute);
            Object changed =
                    switch (value) {
                        case String text -> text + "~";
                        case Integer number -> number + 1;
                        case Long number -> number + 1;
                        case Boolean flag -> !flag;
                        case BigDecimal number -> number.add(BigDecimal.ONE);
                        case BigInteger number -> number.add(BigInteger.ONE);
                        case Enumerator literal
                        when attribute.getEType() instanceof EEnum type ->
                            type.getELiterals().size() < 2
                                    ? null
                                    : type.getELiterals()
                                            .get(
                                                    (literal.getValue()
                                                                    == type.getELiterals()
                                                                            .get(0)
                                                                            .getValue())
                                                            ? 1
                                                            : 0)
                                            .getInstance();
                        default -> null;
                    };
            if (changed == null) {
                return false;
            }
            object.eSet(attribute, changed);
            return true;
        }

        private static boolean unset(EObject object, EStructuralFeature feature) {
            object.eUnset(feature);
            return true;
        }

        private static boolean remove(EObject object, EStructuralFeature feature) {
            ((List<?>) object.eGet(feature)).remove(0);
            return true;
        }

        private static boolean reorder(EObject object, EStructuralFeature feature) {
            EList<?> values = (EList<?>) object.eGet(feature);
            if (values.size() < 2 || values.get(0).equals(values.get(values.size() - 1))) {
                return false;
            }
            values.move(values.size() - 1, 0);
            return true;
        }

        private static boolean retarget(EObject object, EReference reference) {
            Object current = object.eGet(reference);
            for (TreeIterator<EObject> all = object.eResource().getAllContents(); all.hasNext(); ) {
                EObject other = all.next();
                if (other != current && reference.getEReferenceType().isInstance(other)) {
                    object.eSet(reference, other);
                    return true;
                }
            }
            return false;
        }
    }

    // ------------------------------------------------------------------------------------ model

    /**
     * One Application with two processes, two reconcile units the second follows the first in, a
     * provenance whose two digests share a name, and a release gate whose member names a process.
     */
    private static ResolvedDeployment deployment() {
        ResolvedDeployment deployment = MODEL.createResolvedDeployment();
        Provenance provenance = MODEL.createProvenance();
        provenance.getInputDigests().add(digest(PinnedInput.NODE_CONTRACT, "production", "sha256:1"));
        provenance.getInputDigests().add(digest(PinnedInput.CLUSTER_STATE, "production", "sha256:2"));
        deployment.setProvenance(provenance);
        ReconcileUnit apps = MODEL.createReconcileUnit();
        apps.setName("apps");
        ReconcileUnit data = MODEL.createReconcileUnit();
        data.setName("data");
        apps.getAfter().add(data);
        deployment.getReconcileUnits().add(apps);
        deployment.getReconcileUnits().add(data);

        ResolvedApplication application = MODEL.createResolvedApplication();
        application.setId("notes");
        application.setReconcileUnit(apps);
        ResolvedProcess api = MODEL.createResolvedProcess();
        api.setName("api");
        api.setMemory("256Mi");
        api.getEnvironment().add(env("A", "1"));
        api.getEnvironment().add(env("B", "2"));
        api.getEnvironment().add(env("C", "3"));
        api.getVolumes().add(volume("data", "1Gi"));
        api.getVolumes().add(volume("cache", "2Gi"));
        ResolvedPlacement placement = MODEL.createResolvedPlacement();
        placement.getEligibleNodes().add("node-a");
        placement.getEligibleNodes().add("node-b");
        api.setPlacement(placement);
        ResolvedProbe readiness = MODEL.createResolvedProbe();
        readiness.setTarget(MODEL.createHttpTarget());
        api.setReadiness(readiness);
        ResolvedProcess worker = MODEL.createResolvedProcess();
        worker.setName("worker");
        worker.getEnvironment().add(env("QUEUE", "jobs"));
        worker.getEnvironment().add(env("THREADS", "4"));
        application.getProcesses().add(api);
        application.getProcesses().add(worker);
        ReleaseGate gate = MODEL.createReleaseGate();
        GateMember member = MODEL.createGateMember();
        member.setProcess(api);
        member.getChecks().add(dev.jorisjonkers.deploykit.emf.metamodel.resolveddeployment.AnalysisCheck.ERROR_RATE);
        gate.getMembers().add(member);
        application.setReleaseGate(gate);
        deployment.getApplications().add(application);
        return deployment;
    }

    private static ResolvedDeployment edited(Consumer<ResolvedDeployment> edit) {
        ResolvedDeployment deployment = deployment();
        edit.accept(deployment);
        return deployment;
    }

    private static List<String> differences(ResolvedDeployment expected, ResolvedDeployment actual) {
        return ModelDiff.differences(FILE, resource(List.of(expected)), resource(List.of(actual)));
    }

    private static Resource resource(java.util.Collection<? extends EObject> roots) {
        Resource resource = Stages.resources().createResource(URI.createURI("file:/m.resolveddeployment"));
        resource.getContents().addAll(roots);
        return resource;
    }

    private static ResolvedProcess process(ResolvedDeployment deployment, String application, String process) {
        return deployment.getApplications().stream()
                .filter(candidate -> candidate.getId().equals(application))
                .flatMap(candidate -> candidate.getProcesses().stream())
                .filter(candidate -> candidate.getName().equals(process))
                .findFirst()
                .orElseThrow();
    }

    private static EnvEntry env(String name, String value) {
        EnvEntry entry = MODEL.createEnvEntry();
        entry.setName(name);
        entry.setValue(value);
        return entry;
    }

    private static ResolvedVolume volume(String claim, String size) {
        ResolvedVolume volume = MODEL.createResolvedVolume();
        volume.setClaim(claim);
        volume.setSize(size);
        return volume;
    }

    private static InputDigest digest(PinnedInput input, String name, String digest) {
        InputDigest entry = MODEL.createInputDigest();
        entry.setInput(input);
        entry.setName(name);
        entry.setDigest(digest);
        return entry;
    }

    /** The object of {@code actual} at {@code object}'s position in {@code expected}: two loads of one file. */
    private static EObject twin(Resource expected, Resource actual, EObject object) {
        EObject root = EcoreUtil.getRootContainer(object);
        EObject twinRoot = actual.getContents().get(expected.getContents().indexOf(root));
        return root == object
                ? twinRoot
                : EcoreUtil.getEObject(twinRoot, EcoreUtil.getRelativeURIFragmentPath(root, object));
    }

    private static long size(Path path) {
        try {
            return Files.size(path);
        } catch (IOException e) {
            throw new java.io.UncheckedIOException(e);
        }
    }
}
