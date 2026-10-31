#!/bin/sh
# Checks that the unpacked hand-in loads in Eclipse the way its README says, on macOS (aarch64).
#
#   eclipse-check.sh HAND_IN WORK [--fix-m2e]
#
# HAND_IN is the archive unpacked, after its ./build.sh has run. WORK is a scratch directory: the
# check installs Eclipse Modeling Tools 2026-06 there (downloaded once, then provisioned with
# Acceleo 4, QVT-Operational and m2e with its PDE connector by the p2 director), copies HAND_IN to
# WORK/hand-in so the import and the launches never touch it, and starts the workbench on a fresh
# workspace with the plug-in in eclipse-check/, which imports, builds, opens the editors, validates
# the models, runs the launches and writes WORK/report.txt and WORK/screenshots/. --fix-m2e first
# changes the copy's m2e lifecycle mapping for the Xtext generator from execute to ignore.
#
# JAVA_HOME must be a JDK 21: it compiles the plug-in and backs the JavaSE-21 environment the
# launches use. MAVEN_REPO, if set, is the local Maven repository the workbench's Maven uses, so
# no settings of the user's own are read. CHECK_VMARGS adds system properties for the plug-in.
set -e
[ $# -ge 2 ] || { echo "usage: $0 HAND_IN WORK [--fix-m2e]" >&2; exit 2; }
here="$(cd "$(dirname "$0")" && pwd)"
hand_in="$(cd "$1" && pwd)"
mkdir -p "$2"
work="$(cd "$2" && pwd)"
: "${JAVA_HOME:?JAVA_HOME must name a JDK 21}"

release=https://download.eclipse.org/releases/2026-06/202606101000/
package=https://download.eclipse.org/technology/epp/downloads/release/2026-06/R/eclipse-modeling-2026-06-R-macosx-cocoa-aarch64.tar.gz
app="$work/eclipse/Eclipse.app"
eclipse="$app/Contents/MacOS/eclipse"
if [ ! -x "$eclipse" ]; then
  mkdir -p "$work/eclipse"
  curl -fsSL -o "$work/eclipse.tar.gz" "$package"
  want=$(curl -fsSL "$package.sha512" | cut -d' ' -f1)
  got=$(shasum -a 512 "$work/eclipse.tar.gz" | cut -d' ' -f1)
  [ "$want" = "$got" ] || { echo "checksum mismatch for $package" >&2; exit 1; }
  tar xzf "$work/eclipse.tar.gz" -C "$work/eclipse"
  rm "$work/eclipse.tar.gz"
  "$eclipse" -nosplash -application org.eclipse.equinox.p2.director -repository "$release" -installIU \
    org.eclipse.acceleo.aql.feature.feature.group,org.eclipse.acceleo.query.feature.group,org.eclipse.m2m.qvt.oml.sdk.feature.group,org.eclipse.m2e.feature.feature.group,org.eclipse.m2e.pde.feature.feature.group,org.eclipse.m2e.logback.feature.feature.group
fi

# The check plug-in, compiled against the installation and dropped in as a directory bundle.
plugins="$app/Contents/Eclipse/plugins"
bundle="$app/Contents/Eclipse/dropins/handin-check/plugins/dev.jorisjonkers.deploykit.handin.check_1.0.0"
rm -rf "$bundle"
mkdir -p "$bundle"
"$JAVA_HOME/bin/javac" --release 21 -nowarn -d "$bundle" -cp "$plugins/*" \
  "$here/eclipse-check/src/dev/jorisjonkers/deploykit/handin/check/Check.java"
cp -R "$here/eclipse-check/META-INF" "$here/eclipse-check/plugin.xml" "$bundle/"

rm -rf "$work/hand-in" "$work/workspace" "$work/report.txt" "$work/screenshots"
cp -R "$hand_in" "$work/hand-in"
if [ "$3" = "--fix-m2e" ]; then
  perl -0pi -e 's{<execute><runOnIncremental>false</runOnIncremental></execute>}{<ignore/>}' "$work/hand-in/implementation/emf/pom.xml"
  grep -q '<ignore/>' "$work/hand-in/implementation/emf/pom.xml"
fi
cat > "$work/maven-settings.xml" <<EOF
<settings><localRepository>${MAVEN_REPO:-$work/m2repo}</localRepository></settings>
EOF
cat > "$work/customization.ini" <<'EOF'
org.eclipse.ui/showIntro=false
org.eclipse.tips.ide/activate_at_startup=false
org.eclipse.m2e.core/eclipse.m2.updateIndexes=false
org.eclipse.m2e.core/eclipse.m2.defaultCheckSourcesAndJavadoc=false
EOF

"$eclipse" -nosplash -data "$work/workspace" -pluginCustomization "$work/customization.ini" -vmargs \
  -Dhandin.check.root="$work/hand-in" -Dhandin.check.report="$work/report.txt" \
  -Dhandin.check.jdk="$JAVA_HOME" -Dhandin.check.mavenSettings="$work/maven-settings.xml" $CHECK_VMARGS \
  > "$work/eclipse.log" 2>&1 || true
cat "$work/report.txt"
grep -q '^RESULT: PASS' "$work/report.txt"
