# MDE coursework — LaTeX mirror

Model Driven Engineering (University of Twente), Joris Jonkers, s1829157.
Project type: **code generation**. The subject of the coursework is this
repository's deployment model, so the reports live beside it.

Each report is written in Overleaf and **mirrored here**. Overleaf is where the
editing happens; this directory is the copy that survives, and the one a
reviewer can read without an Overleaf account.

## Documents

One directory per deadline, named after the course's own task numbering.

| Directory | Deliverable | Overleaf project | State |
|---|---|---|---|
| [`task-0-proposal/`](task-0-proposal/) | Task 0 — project description, the proposal that must be approved before work starts | `6aa2ba0c3920baa59ec20901` | mirrored 2026-09-11 |
| `task-1-metamodelling/` | Task 1 — domain analysis, modelling decisions, the two metamodels and their diagrams, example models | — | not started |
| `task-2-transformations/` | Task 2 — the model-to-model transformation, its rules and limitations, evidence it runs | — | not started |
| `task-3-code-generation/` | Task 3 — the model-to-text transformation, the generated code, evidence it loads | — | not started |

Add a new report as a sibling directory with the same internal shape, and fill
in its row above when its Overleaf project exists.

## Course material

Two further directories hold what the course hands out, kept for reference while
the reports are written and not material of this repository:
[`lectures/`](lectures/) for the slide decks and
[`background/`](background/) for the reading set per lecture. Both carry a README
naming every file, because the names publishers and lecture exports ship with
say nothing at a glance.

Every PDF has a Markdown conversion beside it — `<name>.md`, figures in
`<name>-images/` — produced with docling. **[`INDEX.md`](INDEX.md) maps topics
to documents, sections and PDF pages**; read it first, then open only the
section it points at.

## Layout of a report directory

Each one mirrors its Overleaf project **file for file**, so that a fresh pull
and the committed tree differ only where someone edited without syncing. The
page style follows the group's earlier DoSA architecture report — its margins,
title page and table style — but these are short reports, so they are `article`
documents whose parts are sections rather than chapters.

```
main.tex        root document: preamble, \tableofcontents, \input list
Title/          title page and the University of Twente logo
Sections/       one file per section, numbered in reading order, appendix last
listings/       verbatim inputs for \lstinputlisting — models and generated files
*.sty, *.cfg    vendored LaTeX packages, see below
```

### The vendored `.sty` files

Ten files — `listings.sty`, `lstmisc.sty`, `lstpatch.sty`, `listings.cfg`,
`xcolor.sty`, `caption.sty`, `caption3.sty`, `ltcaption.sty`, `booktabs.sty` and
`float.sty` — sit in the project root on purpose. The Overleaf instance runs a
minimal TeX Live: `listings`, `xcolor`, `enumitem`, `titlesec`, `microtype` and
`fancyvrb` are **not installed**, and a `\usepackage` for any of them fails the
build with `File ... not found`. Vendoring is what makes the project compile.
`caption` additionally loads `caption3` and `ltcaption`, so all three travel
together.

Do not delete them, and do not add a package that is not either installed on the
server or vendored next to `main.tex`. Confirmed present on the server:
`geometry`, `fontenc`, `inputenc`, `lmodern`, `hyperref`, `verbatim`, `url`,
`graphicx`, `color`, `amsmath`, `tabularx`, `longtable`, `textcomp`, `nameref`.

`titlesec` and `enumitem` exist neither on the server nor on the machine these
reports are built from, so they could not be vendored. Their effect is
reproduced in `main.tex` with the kernel's own `\@startsection` and list
parameters.

## Syncing

Overleaf is authoritative while a report is being written. To refresh the
mirror, pull the project and copy it over the directory, then commit — never
hand-edit the mirror and expect Overleaf to follow.

The reverse direction (editing here and pushing up) is possible but is a good
way to lose someone else's concurrent Overleaf edit, so prefer editing in
Overleaf and re-pulling.

## Conventions used in these documents

Taken from the DoSA report, so that the four reports read as one series:

- `article` class, 10pt, A4, one-sided; DoSA's margins — 2cm left and right,
  2.5cm top, 3cm bottom; single spacing, no paragraph indent, 5pt between
  paragraphs.
- One file per section in `Sections/`, pulled in with `\input`. Headings stay
  small and tight: these are short reports, and a chapter slab per topic would
  cost more space than the topic uses.
- Headings are Title Case. Sections carry a `\label{sec:…}` and are
  cross-referenced as `Section~\ref{…}`; the appendix is `\appendix` plus one
  section, so its parts number `A.1`, `A.2` and so on.
- Tables are floats: `\begin{table}[ht]`, centred, `\hline` rules, caption
  **below** the table, `\label{tab:…}`.
- Front matter is numbered in roman and the body in arabic, with a table of
  contents between them.
- Code listings are called **Example**, not Listing (`\lstlistingname`).
- Every cross-reference is a live PDF link; `hyperref` colours them.
- Files reproduced from the generator's intended output carry no commentary of
  any kind, because the real ones will not.
