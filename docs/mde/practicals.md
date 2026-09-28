# The practical sessions

What each of the course's six practical sessions asks for, as its Canvas
assignment page states it. They are exercises and are separate from the
project: each is a one-point `.zip` upload. They matter here because each one
walks through a tool the project uses. Session 5 is the QVT Operational tooling
that Task 2 is built with, and sessions 1 and 3 are the Ecore and Xtext
workflow behind [`emf/`](../../emf/).

The project's own tasks are in [`assignment.md`](assignment.md). The lecture
each session follows, and its slides, recording and reading, are indexed in
`course-material/INDEX.md` in the private submodule (see
[`README.md`](README.md)).

Every session is due at 23:59 on the date given and is handed in as one
`.zip`. Where a session asks for a "`.jpg` of the metamodel", it means the
Ecore diagram editor's *Export diagram as image*.

| Session | Subject | Follows | Due | Tools |
|---|---|---|---|---|
| [0](#session-0--acquaintance-with-emf-and-ecore) | Acquaintance with EMF and Ecore | lectures 0 and 1 | 4 September | Eclipse Modeling Tools, Ecore Tools |
| [1](#session-1--metamodelling) | Metamodelling: an SQL metamodel | lecture 1 | 7 September | Ecore, generated editor |
| [2](#session-2--ocl-and-dsls) | OCL and DSLs: hardware specifications | lecture 2 | 14 September | OCLinEcore |
| [3](#session-3--textual-concrete-syntax-xtext) | Textual concrete syntax | lecture 3 | 21 September | Xtext |
| [4](#session-4--atl-transformations) | ATL transformations: UML to Java | lecture 4 | 1 October | ATL |
| [5](#session-5--qvt-om-transformations) | QVT Operational: stereotypes to patterns | lecture 5 | 5 October | QVT Operational |

## Session 0 — Acquaintance with EMF and Ecore

Individual and mandatory, as preparation for session 1. The session teaches
the EMF steps for defining a metamodel and creating models of it, which the
page says "you will have to learn by heart in order to be productive in this
course".

- **Install.** An open-source JDK: the page suggests Eclipse Temurin JDK 25, an
  LTS release. Then the **Eclipse Modeling Tools** package, specifically,
  because any other distribution leaves the modelling tools to be installed
  from the update site afterwards, "which might be problematic". Check that
  *Ecore Diagram Editor SDK* and *EMF - Eclipse Modeling Framework SDK* are
  installed, and add missing ones through *Help → Install New Software…*, not
  through the Marketplace.
- **Follow** [Lars Vogel's EMF tutorial](http://www.vogella.com/tutorials/EclipseEMF/article.html):
  §1 and §2 to check the installation, §3 to define the web-page metamodel, §4
  for the generated model code, and §5 for the edit and editor code that
  creates models in a second Eclipse instance. §11 regenerates a `.genmodel`
  for an `.ecore` copied in from elsewhere. The other sections "can be
  ignored". Background on the tools is at the
  [Ecore Tools documentation](https://www.eclipse.org/ecoretools/doc/index.html).
- **Hand in** `webpage.ecore` and `webpage.genmodel`, a `.jpg` of the
  metamodel, and a model file created with the generated editor. A
  different metamodel of at least four related classes is also accepted.

## Session 1 — Metamodelling

Treat SQL as a DSL for databases and write its metamodel in Ecore, working
from the concrete syntax (the page points at
[w3schools](http://www.w3schools.com/SQl/default.asp)). The metamodel must
cover `SELECT` (including `*` and column and table aliases), `UNION` (of
selects, and of unions), comparisons (`=`, `<`, `>`, `<>`), `AND`, `OR`, `NOT`,
and `EXISTS`. Generate an editor and build at least the example queries as
models.

The page's modelling tips, which apply to any metamodel:

- start from a few language elements and add more iteratively;
- organise the metamodel as specialisation hierarchies and aggregation
  references;
- name elements for what they mean, not after their keyword (`WHERE` defines a
  condition, so call it *Condition*);
- give every reference end a role name, so models are navigable;
- type every attribute.

**Hand in** the `.ecore` and `.genmodel`, a `.jpg` of the metamodel, and the
example queries as models made with the generated editor.

## Session 2 — OCL and DSLs

First work through the
[OCLinEcore tutorial](https://help.eclipse.org/latest/topic/org.eclipse.ocl.doc/help/Tutorials.html?cp=60_3_0#OCLinEcoreTutorial)
up to *Generating Java code*, installing *OCL Examples and Editors SDK* if it
is missing. Then:

1. **Hardware specification.** A metamodel for computer hardware:
   motherboard types, processor, graphics card, memory, hard disks, optical
   drives, peripherals (screen, mouse, keyboard, printer) and power supply. It
   must represent a budget PC, a high-end gaming PC, a laptop and a netbook.
2. **Compatibility.** OCL constraints checking that the motherboard fits the
   processor, and that there are enough of the right ports for every
   peripheral (a PS/2 mouse fails where there are only USB ports).
3. **Power supply.** Power consumption as a property of every component, and
   an OCL check that the supply covers the aggregate.

"The domain description is intentionally vague". The page's own test for a
metamodel is whether it represents every model it was meant to support.

**Hand in** the `.ecore` and `.genmodel` files, `.jpg`s of the metamodels, and
models made with the generated editor.

## Session 3 — Textual concrete syntax (Xtext)

Install the *Xtext Complete SDK* if it is missing, and do the
[15-minute Xtext tutorial](https://eclipse.org/Xtext/documentation/102_domainmodelwalkthrough.html).
The tutorial starts from a grammar, whereas this session starts from a
metamodel. The page also suggests first rebuilding and running lecture 3's
example code.

1. **Prepare the metamodel.** Session 2's hardware metamodel, error-free, with
   its `.genmodel` and generated code. Convert the project with *Configure →
   Convert to Xtext project*.
2. **Define a textual syntax.** Run *New → Project → Xtext Project From
   Existing Ecore Models*, which writes a correct but verbose default grammar.
   Generate the language artefacts and try the language in a runtime IDE.
   Then rewrite the `.xtext` into a more compact syntax without breaking its
   consistency with the metamodel, rerunning the MWE2 workflow after every
   grammar change. The grammar language is documented in the
   [Xtext grammar reference](https://eclipse.org/Xtext/documentation/301_grammarlanguage.html).

**Hand in** the `.ecore` and `.genmodel` files, `.jpg`s of the metamodels,
**both** grammars (the default and the adjusted one), and valid models
written with the generated editors.

## Session 4 — ATL transformations

Install *ATL SDK*, create an ATL project, and add `Java.ecore`, `UML.ecore`
and `sample.uml.xmi` from the session's Canvas zip. Register both metamodels
(*Register Metamodel*) and run a trivial transformation (UML package to Java
package) from a run configuration naming the source and target models and
metamodels. The [ATL User Guide](https://wiki.eclipse.org/ATL/User_Guide) is
the language reference.

1. **UML to Java.** Classes to Java classes, keeping the (single) inheritance
   hierarchy. Packages to packages, and primitive types to Java primitives.
   Attributes to private fields, and to getter and setter pairs **with their
   implementations**. Use declarative rules, and `resolveTemp` to reach
   another rule's output through the transformation trace (described under
   *The ATL Module data type* in the
   [ATL language guide](http://wiki.eclipse.org/ATL/User_Guide_-_The_ATL_Language#Data_types)).
2. **Flatten the hierarchy.** Generate Java classes for leaf classes only,
   with every inherited attribute copied down. Use a helper on a UML class that
   collects inherited attributes, and **lazy rules** to create several fields
   and methods from one attribute. ATL's OCL dialect differs slightly from
   EMF's.

**Hand in** the Eclipse project with both transformations, exported with
*File → Export… → Archive File*.

## Session 5 — QVT OM transformations

The session that exercises the tooling this project's Task 2 is written in
(see [`assignment.md`](assignment.md#task-2--transformations)).

Install *QVT Operational SDK*, import `mde.lect5.qvto.flattening` from lecture
5's code on Canvas, and run it with an *Operational QVT Interpreter* run
configuration that names the source and target models and metamodels. The
language is documented in Eclipse's *QVT Operational Developer Guide* and in
the OMG QVT specification. The page names that specification "QVT 3.1" but
links version 1.3, the version handed out with lecture 5.

**The exercise.** A QVT Operational Mappings transformation from a simplified
UML to itself (the metamodel of lecture 5's demo) that refines a design by its
stereotypes, which are given in the `stereotype` attribute of `ModelElement`:

- `<<Observable>>` on a class: refine it so observers can be attached.
- `<<MVC>>` on a class: replace it with three classes, one each for model,
  view and controller.

The abstract `Observer` and `Observable` classes are global to the target
model and shared by every rule application. A stereotyped test model is on
Canvas. The page's suggested order:

1. create the global `Observer` and `Observable`;
2. apply the pattern rules to the marked classes;
3. copy unmarked classes and primitive types;
4. copy associations, set class properties and rebuild the inheritance
   hierarchy, **after** every class and type exists.

**Hand in** the working Eclipse project, including the target model the
transformation produced from the stereotyped test model, as an archive
export.

The page's figures (run configurations, the simplified UML metamodel and the
two rules drawn graphically) are on Canvas only.
