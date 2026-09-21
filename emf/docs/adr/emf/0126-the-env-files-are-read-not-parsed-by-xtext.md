---
tier: decision
status: proposed
claim: settled
date: 2026-09-21
normative: docs/architecture.md#concrete-syntax
rests-on: ["0106"]
---

# The env files are read by a hand-written reader, not by a second Xtext grammar

[0111](0111-xtext-parses-the-authored-yaml-into-the-metamodel.md) settles how
the authored YAML reaches the metamodel. The other authored artefact, the
dotenv env files
([chapter 10](../../../../spec/v1/10-project-intent.md#the-dotenv-subset-that-is-read)),
reaches it through a reader written by hand in each implementation instead, and
produces the same `EnvFile`, `EnvEntry`, `EnvLiteral` and `Placeholder`
instances the rest of the model is made of.

## Rests on

The model is expressible in the EMF toolchain
([0106](0106-the-model-is-expressible-in-the-emf-toolchain.md)), and this
decision narrows where one tool of it is used rather than reaching outside the
set: nothing here is parsed by something the course does not name, because a
reader is not a parser generator, it is the code the Java side would write
around any parser anyway.

## Why

**An ANTLR lexer cannot separate a dotenv key from its value.** A value runs to
the end of its line and may contain `=`: a connection string and a base64
secret both do. So the greedy value terminal matches `NAME=value` whole, from
the first column, and wins the longest match against the name terminal. Xtext
exposes no lexer mode and no syntactic predicate to break the tie.

**The technique that fixes it makes the grammar a fiction.** This repository
already answers an unlexable syntax with a token source: `BlockTokenSource`
turns YAML indentation into the synthetic `BEGIN` and `END` tokens the project
grammar reads, and that works because what the token source computes
(indentation) is not what the grammar decides (structure). For dotenv the split
at `=` *is* the structure, and telling a literal from a placeholder is the only
other decision in the language. A token source doing both leaves a grammar with
two rules and nothing to decide, which is a parser with a grammar-shaped
comment on it.

**One reader, two implementations, one oracle.** The reader is about forty
lines on each side and both are held to the same committed `intent.json`, which
is the same evidence every other stage offers. Parse parity is unaffected: both
implementations read the same bytes, which is what
[0111](0111-xtext-parses-the-authored-yaml-into-the-metamodel.md) asked for.

## Alternatives

| option | cost if taken | why rejected |
|---|---|---|
| A third Xtext language with a token source that splits at `=` and classifies the value | the token source decides the whole language, and the grammar it feeds says only "entries are entries"; two generated lexers, a runtime module and a standalone setup exist to host it | the grammar would document nothing and enforce nothing, at the price of the largest scaffolding in the bundle |
| Restrict a literal to carry no `=` | a connection string, a base64 secret and a query string stop being expressible, and the model gains a rule about ANTLR rather than about deployment | the model may not be shaped by the parser generator's lexer |
| Author env as YAML so the existing grammar reads it | every env file in the estate is rewritten, and dotenv stops being what a process reads; `0011` chose dotenv because that is the format the thing being configured already consumes | the authored format is the model's, not the toolchain's |
| Leave env unparsed, and let layer 2 read the files | the placeholder and the grant it byte-matches sit in different worlds, so the unauthorised-reference check has no model to run over | the check is the reason the files are in the model at all |

## Reversibility

Undo cost today: the reader is one file per implementation with one entry
point, so replacing it with a generated parser is deleting it and binding the
new one where it was called, plus the scaffolding that parser needs: a day.
Becomes irreversible once: nothing, because the reader's output is model
instances and every consumer downstream sees only those.

## Consequences

- One authored artefact of two is parsed by a grammar and the other by a reader, so "what parses the authored files" has two answers, paid by a reader of the architecture, who is told both in one section.
- The dotenv subset is enforced by the reader rather than by a grammar, so the subset lives in prose and in two implementations instead of in one file, paid by the chapter, which states it exhaustively, and by the parity oracle, which is what holds the two readers to it.
- An examiner's Eclipse editor validates the project and Platform documents and not the env files, paid by the course, which asked for a grammar and gets one for the language that has one.
