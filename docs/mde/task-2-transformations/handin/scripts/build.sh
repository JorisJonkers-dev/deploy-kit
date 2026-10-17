#!/bin/sh
# Builds the implementation, runs every test, and copies each example's models to output/.
set -e
cd "$(dirname "$0")"
(cd implementation/emf && ./mvnw -B clean verify)
rm -rf output
for example in minimal auth data delivery edge knowledge-platform observability secrets; do
  mkdir -p "output/$example"
  from="implementation/emf/bundles/cli/target/parity/$example"
  cp "$from"/*.xmi "$from"/*.resolveddeployment "$from"/dependencies.json "output/$example/"
done
echo "Models written to output/<example>/"
