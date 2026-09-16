#!/usr/bin/env bash
# Prints one Markdown line for the CI job summary: tests, line coverage and
# mutation score of the model-driven build, read from the reports `mvnw verify`
# leaves behind. Missing reports print as "n/a" rather than failing, because the
# summary runs after a failed build too.
set -euo pipefail
cd "$(dirname "$0")/.."

tests=$(cat ./*/*/target/surefire-reports/TEST-*.xml 2>/dev/null \
  | grep -o '<testsuite [^>]*' | grep -o ' tests="[0-9]*"' | grep -o '[0-9]*' \
  | awk '{s+=$1} END {print (NR ? s : "n/a")}')

coverage=$(cat ./*/*/target/site/jacoco/jacoco.csv 2>/dev/null | awk -F, '
  NR > 1 && $1 != "GROUP" {missed += $8; covered += $9}
  END {if (missed + covered) printf "%.1f%%", 100 * covered / (missed + covered); else print "n/a"}')

mutation=$(cat ./*/*/target/pit-reports/mutations.xml 2>/dev/null | awk '
  {total += gsub(/<mutation /, "&"); killed += gsub(/status=.KILLED./, "&") + gsub(/status=.TIMED_OUT./, "&")}
  END {if (total) printf "%.1f%% (%d of %d)", 100 * killed / total, killed, total; else print "n/a"}')

echo "**Model-driven build:** ${tests} tests, line coverage ${coverage}, mutation score ${mutation}"
