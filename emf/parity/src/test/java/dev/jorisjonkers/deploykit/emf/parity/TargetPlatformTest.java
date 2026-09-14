package dev.jorisjonkers.deploykit.emf.parity;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import javax.xml.parsers.DocumentBuilderFactory;
import org.junit.jupiter.api.Test;
import org.w3c.dom.Element;
import org.w3c.dom.NodeList;

/**
 * The target platform resolves from one dated build of a simultaneous release, and names every unit at an exact
 * version, so a clean runner cache resolves the same bundles as the last green build (docs/adr/emf/0108).
 */
class TargetPlatformTest {

    static final String EVERY_UNIT_IS_PINNED = "every unit names an exact version from one dated repository";

    private static final String DATED_RELEASE = "https://download\\.eclipse\\.org/releases/\\d{4}-\\d{2}/\\d{12}/";
    private static final String EXACT_VERSION = "\\d+\\.\\d+\\.\\d+(\\.[\\w-]+)?";

    @Test
    void everyUnitIsPinned() throws Exception {
        assertThat(problems(repository().resolve("emf/emf.target")))
                .as(EVERY_UNIT_IS_PINNED)
                .isEmpty();
    }

    @Test
    void anUnpinnedUnitOrAnUndatedRepositoryIsAProblem() throws Exception {
        Path target = Files.createTempFile("emf", ".target");
        Files.writeString(target, """
                <target><locations><location type="InstallableUnit">
                  <repository location="https://download.eclipse.org/releases/latest/"/>
                  <unit id="a" version="1.2.3.v2026"/>
                  <unit id="b" version="0.0.0"/>
                  <unit id="c" version="[1.0.0,2.0.0)"/>
                </location></locations></target>
                """);

        assertThat(problems(target))
                .containsExactly(
                        "repository https://download.eclipse.org/releases/latest/ is not a dated release build",
                        "unit b is not pinned: 0.0.0",
                        "unit c is not pinned: [1.0.0,2.0.0)");
    }

    private static List<String> problems(Path target) throws Exception {
        Element root = DocumentBuilderFactory.newInstance()
                .newDocumentBuilder()
                .parse(target.toFile())
                .getDocumentElement();
        List<String> problems = new ArrayList<>();
        NodeList repositories = root.getElementsByTagName("repository");
        for (int i = 0; i < repositories.getLength(); i++) {
            String location = ((Element) repositories.item(i)).getAttribute("location");
            if (!location.matches(DATED_RELEASE)) {
                problems.add("repository " + location + " is not a dated release build");
            }
        }
        NodeList units = root.getElementsByTagName("unit");
        for (int i = 0; i < units.getLength(); i++) {
            Element unit = (Element) units.item(i);
            String version = unit.getAttribute("version");
            if (!version.matches(EXACT_VERSION) || version.equals("0.0.0")) {
                problems.add("unit " + unit.getAttribute("id") + " is not pinned: " + version);
            }
        }
        return problems;
    }

    private static Path repository() {
        Path dir = Path.of("").toAbsolutePath();
        while (!Files.isRegularFile(dir.resolve("emf/pom.xml"))) {
            dir = dir.getParent();
        }
        return dir;
    }
}
