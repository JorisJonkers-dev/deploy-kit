#!/bin/sh
# Builds the implementation and runs its tests, then runs the model-to-text transformation on each
# example's model and compares the generated files with the expected ones. ./build.sh --mutation
# also runs the mutation tests, which take much longer.
set -e
cd "$(dirname "$0")"
pit=-DskipPitest=true
[ "$1" = "--mutation" ] && pit=
(cd implementation/emf && ./mvnw -B clean verify $pit dependency:copy-dependencies -DoutputDirectory="$PWD/target/lib")
java="${JAVA_HOME:+$JAVA_HOME/bin/}java"
rm -rf output
for example in minimal:notes data:data edge:edge; do
  name=${example%%:*}
  from="task-3-code-generation/examples/$name"
  "$java" -cp "implementation/emf/target/lib/*" task-3-code-generation/scripts/Render.java \
    "$from/${example#*:}.resolveddeployment" "output/$name" "$from/expected"
done
echo "Generated files written to output/<example>/"
