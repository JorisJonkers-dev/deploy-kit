---
tier: decision
status: proposed
claim: open
owner: joris
date: 2026-10-29
normative: spec/v1/10-project-intent.md#describing-an-application-and-a-process
rests-on: ["0004"]
---

# An Application and a Process describe themselves in one sentence, which renders nothing

An Application and each of its Processes may say what they do in one plain
sentence of at most 160 characters. The sentence is carried in the project
file, so its Intent Fragment carries it unchanged, and nothing the render
writes reads it. Asked for in
[Let an Application and a Process describe themselves](https://github.com/JorisJonkers-dev/deploy-kit/issues/432).

## Rests on

Contention decides authority ([0004](0004-contention-decides-authority.md)):
what a Process does is known to the one who writes it, and nobody else declares
it.

**False if:** a description comes to change what a render writes, or a reader
needs more than one sentence to tell two Processes apart. **Settled by:** a
render test, where the rendered objects with every description removed equal
those with them, byte for byte.

## Why

**A name is not an explanation.** The estate dashboard shows each Project's
Applications and Processes from its fragment
([JorisJonkers-dev/estate-dashboard#31](https://github.com/JorisJonkers-dev/estate-dashboard/issues/31)).
`collector` and `reporter` tell a reader what a Process is called, not what it
does, and the answer otherwise lives in the code.

**The project file is where it belongs.** Intent is authored one file per
project ([0009](0009-intent-is-authored-one-file-per-project.md)), and that file
is what a reader of a Project already opens.

**It renders nothing, so it cannot drift into the cluster.** A label or an
annotation carrying the sentence would make every edit a new object and a new
release, for text no controller reads. The fragment already reaches every
reader that wants it.

**One sentence, held by a bound.** A field with no bound becomes the place for a
README. 160 characters holds one plain sentence about a Process and not a
paragraph, so the dashboard can show it in one line beside the name. The
Client's own `description` keeps the bound its kind sets, because a different
reader shows it.

**Never shared.** Like `id` and `name` it belongs to one element, so it is not a
Shared Intent family, and no Process inherits its Application's sentence.

## Alternatives

| option | cost if taken | why rejected |
|---|---|---|
| A pod annotation carrying the sentence | one field on every workload | every wording change rolls the pods, for text no controller reads |
| A description file beside the project file | one more file per Project | a second place to look, and the fragment carries the project file already |
| No bound on its length | none | the field becomes a README, and the dashboard cannot show it in a line |
| A description on the Project as well | one more header field | the issue asks for Applications and Processes, and a Project is named for what it holds |

## Reversibility

Cheap. The field is optional and renders nothing, so dropping it changes only the
files that declare it.

## Consequences

- An Application and a Process gain an optional `description`.
- One longer than 160 characters, or empty, is refused by the schema at the value.
- The render, the Resolved Deployment and every rendered tree are unchanged by it.
