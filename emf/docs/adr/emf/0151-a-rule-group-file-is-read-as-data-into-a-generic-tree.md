---
tier: decision
status: accepted
claim: settled
date: 2026-11-01
normative: docs/architecture.md#concrete-syntax
rests-on: ["0070"]
---

# A rule-group file is read as data into a generic tree, not into typed alert-rule classes

An Application's alert rules arrive as a file beside its project file
([chapter 10](../../../../spec/v1/10-project-intent.md#alert-rules)), and the
monitoring stack's `PrometheusRule` carries that file's groups as the file writes
them. The model-driven implementation reads such a file with a hand-written
reader, `DataFile` in the `cli` bundle, into a generic tree of `Datum`
instances (`DatumMap`, `DatumEntry`, `DatumList` and `DatumScalar`, a scalar
typed as YAML's core schema types it) in both the pinned-inputs and the
Resolved Deployment metamodels. The typed `AlertRuleGroup` and `AlertRule`
classes it replaces are gone.

## Rests on

The model is expressible in the EMF toolchain
([0070](0070-the-model-is-expressible-in-the-emf-toolchain.md)). A reader is
not a parser generator, so reading a file by hand stays inside that set, as
the env files' reader does
([0082](0082-the-env-files-are-read-not-parsed-by-xtext.md)).

## Why

**What the rules hold is Prometheus's, not the model's.** A rule group may carry
recording rules, an evaluation interval, a limit, labels and annotations of any
shape, and fields a later Prometheus adds. The model decides where the rules go
and which `PrometheusRule` holds them, never what a rule says, just as it
decides where an Asset mounts and never what the Asset holds.

**Typed classes lost what they did not name.** `AlertRuleGroup` and `AlertRule`
named an alert's name, expression, duration, labels and annotations. The real
estate's vendored kube-prometheus rules carry recording rules and group
intervals, and the typed classes dropped them, so the rendered `PrometheusRule`
stopped equalling the oracle the first time a real Project's rules were rendered.

**Key for key needs the order and the types kept.** The oracle writes each group
with its keys in the file's order and each scalar as the type YAML gives it, so
`for: 5m` stays a string and `limit: 10` stays an integer. A generic tree that
keeps entries in order and records each scalar's kind is the smallest model
that renders the file byte for byte, and a template walks it with one recursive
rule.

**The file may be YAML or JSON.** Vendored rule sets ship as JSON and authored
ones as YAML. One reader of the YAML subset, of which JSON's syntax is a part,
reads both into the same tree.

## Alternatives

| option | cost if taken | why rejected |
|---|---|---|
| Typed classes covering the whole Prometheus rule schema | the model tracks another project's schema field by field, and lags it on every Prometheus release | the model would own a schema it does not decide |
| An Xtext grammar for rule files | a third grammar for a format the model only carries through, and its typed output has the same gaps as the classes | [0082](0082-the-env-files-are-read-not-parsed-by-xtext.md) already reserves grammars for the languages the model owns |
| Carry the file as text and paste it into the template | a JSON file cannot be pasted into YAML, and the groups must be re-indented under `spec`; both are a parse in disguise | the template would hide a reader |

## Reversibility

Undo cost today: one reader, and five classes and an enum in each of two metamodels, plus
the one recursive template that writes them, so moving back to typed classes is
a day. Becomes irreversible once: nothing, since every consumer reads the tree
through the template alone.

## Consequences

- Two kinds of authored file are now read by a hand-written reader rather than a grammar, env files and rule files, paid by the architecture's "Concrete syntax" section, which names both.
- A rule file's content is not validated by the model: a malformed rule reaches the `PrometheusRule` as written, paid by the cluster's own admission and by the oracle comparison, which holds the rendered tree byte for byte.
- An examiner's Eclipse editor shows a rule file's groups as a generic tree in the reflective model editor, not as named alert-rule objects, paid by the metamodel diagrams, which show the `Datum` classes as the carrier they are.
