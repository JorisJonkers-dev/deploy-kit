# The project assignment

What the course asks for, task by task, as the Canvas assignment pages state it.
This is the source the report directories are written against:
[`README.md`](README.md) says which directory mirrors which task and when it is
due; this file says what the task itself requires and what has to be handed in.

The course sets three project types — **Code generation**, **Interoperability**
and **Model discovery ("Harvesting")**. This project is of type **code
generation**, chosen and approved in Task 0, so only that type's task text is
reproduced below. The three types are listed in
lecture 0, `course-material/lectures/lecture-0-introduction.md`, under *Project types*, and the practical
sessions that carry each technology in
the same deck's practical-session schedule.

## What the type is

> MDE can be applied to automatically generate code from more abstract models.
> The classic straightforward example is the generation of Java code skeletons
> from UML class diagrams. Another example is to start with RDF
> (<http://www.w3.org/RDF/>), which is a technique to describe related data in a
> network such as the Web, and define transformations that transform RDF models
> into textual graph representations (code) that can be visualised with a tool
> like Graphviz (see <http://www.graphviz.org/>). In this type of project you
> will build a simple tool to generate code from an abstract model.

## Task 0 — Problem selection

Due 11 September, 23:59. One PDF per group, file upload, 1 point, **not graded**:
it is an approval gate, and the group may not start the project until the teacher
approves it.

> In this task you have to select the code generation problem that you will solve
> in your project. The deliverable of this task is a succinct description (max. 2
> A4 pages) of the problem that you want to solve. The description should mention
> the kind of code that you want to generate from which abstract models. This
> description should be approved by the teacher of the course before you can
> start your project.

The proposal must also state which of the three project types it is, and detail
the objectives of the project, "also mentioning the languages/metamodels
involved".

Mirror: [`task-0-proposal/`](task-0-proposal/) — approved.

## Task 1 — Metamodelling

Due 25 September, 23:59. 10 points. One file upload, **a `.zip`**.

The task, from the project description:

> Define a metamodel for your abstract model. Make sure your metamodel can
> properly represent the intended models.
>
> Define a metamodel for the code of your choice.

The submission page (Canvas, "Project task 1: Metamodelling"):

> In this assignment you have to deliver a report and the artefacts (code and
> models) for Task 1 of the project. The results should be delivered in one
> compressed (.zip) file, where the artefacts are packaged in one or more
> Eclipse/EMF modelling projects.

So the zip holds **the report and the artefacts together**, and the artefacts
(metamodels, constraints, models) are **Eclipse/EMF projects** a marker can
import.

### Correction criteria

> For the marking of task 1 mainly the report will be evaluated, while the
> project artefacts (e.g., file containing metamodels and models) will be
> inspected to take away any doubts about the project. At least the following
> information should be given in the report, with its relative importance
> indicated between parentheses:
>
> - **Purpose of project (10%).** This information concerns the goals of the
>   project, including assumptions, scope, constraints and conditions. This
>   information should clarify and refine the information given in task 0.
> - **Alternatives and justification of chosen solution (20%).** This
>   information concerns the identification of choices and the justification of
>   the chosen modelling solution (e.g., metaclasses of the metamodel) in general
>   terms, not in detail.
> - **Solution design (40%).** This information concerns the more specific
>   design decisions and how they have been implemented. The discussion should be
>   as much as possible self-contained so that the reader does not have to
>   inspect the project to understand what has been done (only for very specific
>   details). Use figures, diagrams and tables in so far as they can help clarify
>   how the solution has been structured.
> - **Tests and evaluation (30%).** This information concerns the testing
>   strategy (how the solution has been tested) and the evidences that the
>   solution is appropriate for the purpose of the project. For this task this
>   should be done by giving some models (instances of the metamodel) that
>   demonstrate that the metamodels 'work'. Limitations of your solution should
>   also be discussed here.
>
> Only the presence of the information above in the report of course is not
> enough for a maximal mark. The report will be also evaluated for its
> readability, the suitability and consistency of the solution, coverage (depth)
> and the reflection on the results (choices and limitations).

In short: the report is marked; the Eclipse projects are only inspected to
settle doubts. The report must stand on its own, carry the four parts above in
roughly those proportions, and discuss limitations and reflect on the choices.

Mirror: [`task-1-metamodelling/`](task-1-metamodelling/). The Ecore files are
under [`emf/bundles/metamodel/model/`](../../emf/bundles/metamodel/model/); the
hand-in zip is built by
[`task-1-metamodelling/handin/build.py`](task-1-metamodelling/handin/build.py).

## Task 2 — Transformations

Due 16 October, 23:59. 10 points. One file upload, **a `.zip`**.

The task, from the project description:

> The purpose of this task is to define a transformation from the abstract models
> to instances of your code metamodel. In this task you define and implement a
> model transformation for this purpose using ATL or QVT OM.

The submission page (Canvas, "Project task 2: Model transformations"):

> In this assignment you have to deliver a report and the artefacts (code and
> models) for Task 2 of the project. The results should be delivered in one
> compressed (.zip) file, where the artefacts are packaged in one or more
> Eclipse/EMF modelling projects. The report should not exceed 15 pages (minimum
> font size 10 pt), so in the report you should concentrate on the essence of
> what you have done.

### Correction criteria

> For the marking of task 2 mainly the report will be evaluated, although the
> code will be inspected to take away any doubts about the project. At least the
> following information should be given in the report, with its relative
> importance indicated between parentheses:
>
> - **Purpose of project (10%).** This information concerns the goals of the
>   project, including assumptions, scope, constraints and conditions. This
>   information should clarify and refine the information given in tasks 0 and 1,
>   indicating the role of the model transformation(s) you have developed.
> - **Alternatives and justification of chosen solution (20%).** This
>   information concerns the identification of choices and the justification of
>   the chosen solutions (transformation language, transformation structure,
>   etc.) in general terms, not in detail.
> - **Solution design (40%).** This information concerns the more specific
>   decisions and how they have taken when designing your model
>   transformation(s). The discussion should be as much as possible
>   self-contained so that the reader does not have to inspect the project to
>   understand what has been done (only for very specific details). Use figures,
>   diagrams and tables in so far as they can help clarify how the
>   transformation(s) has/have been structured.
> - **Tests and evaluation (30%).** This information concerns the testing
>   strategy (how the transformation(s) has/have been tested) and the evidences
>   that your transformation(s) is/are appropriate for the purpose of the project.
>   For this task this should be done by applying the transformation(s) to some
>   source models and showing that the transformation(s) generate appropriate
>   target models. Limitations of your transformation(s) should also be discussed
>   here.
>
> Only the presence of the information above in the report of course is not
> enough for a maximal mark. The report will be also evaluated for its
> readability, the suitability and consistency of the solution, coverage (depth)
> and the reflection on the results (choices and limitations).
>
> It is possible that when developing the transformations you had to change the
> metamodels you defined in task 1. These changes to the metamodels of task 1
> should be described in an appendix to the task 2 report. This appendix does not
> count for the 15 pages limit, but it should not exceed 10 pages (minimum font
> size 10 pt).

In short: at most 15 pages of report (10 pt minimum), plus at most 10 pages of
appendix describing any change to the Task 1 metamodels; the transformation and
its source and target models ship as Eclipse/EMF projects in the same zip.

Mirror: `task-2-transformations/` — not started. This project uses **QVT
Operational**, not ATL.

## Task 3 — Code generation

Due 30 October.

> In this task, you will implement the model-2-text transformations to generate
> the code from the models in Task 2. You should perform the following
> activities:
>
> - Write a model-2-text transformation in Acceleo.
> - Execute the transformation to generate the code that represents a couple of
>   the models from Task 2.
> - Load the generated code in a tool that can handle the code to show that your
>   transformation works.

Deliverables:

> - Report describing the model-2-text transformation logic, the design
>   alternatives and the decisions.
> - The transformation specification, source models and the generated code, with
>   evidences that the transformation works.

Mirror: `task-3-code-generation/` — not started. "Load the generated code in a
tool that can handle the code" is, for this project, applying the generated
manifests to a Kubernetes cluster, or validating them against the API server.

## Presentation and grading

Each student presents at least once, for individual grading, and both students
answer questions afterwards. Task 0 carries no mark; Tasks 1, 2 and 3 are
submitted and graded. The grading formula is in
lecture 0, under *Formula for the final grade*, and the LLM policy under
*Use of LLMs*, both in `course-material/lectures/lecture-0-introduction.md`.

## Project ideas the course offers

Given as examples of what a code-generation project can look like; none of them
is this project, which generates deployment manifests instead.

- **Microservices from UML, following Domain-Driven Design.** DDD organises a
  complex domain as a network of **Bounded Contexts**, classifies objects into
  Entities, Value Objects and Service Objects (the Evans classification), and
  identifies **Aggregates**; a Ubiquitous Language embeds the domain's
  terminology in the software itself. The Bounded Context is what usually
  delimits a microservice. See Fowler,
  [Domain-Driven Design](https://martinfowler.com/bliki/DomainDrivenDesign.html).
- **A domain-specific language translated to an executable language**, for
  analysis or simulation: for example a language for the flow of goods in a
  supply chain, translated to a process model and then to Java or Python. A past
  project translated abstract models of user interfaces to a Swing
  implementation through an intermediate transformation.
- **Embedded systems.** Code generation is one of the main applications of
  model-driven development for embedded systems, where it makes development less
  error-prone and less dependent on an experienced embedded developer. See
  Böhm, Broy, Klein, Pohl, Rumpe and Schröck (eds.),
  [*Model-Based Engineering of Collaborative Embedded Systems: Extensions of the SPES Methodology*](https://link.springer.com/book/10.1007/978-3-030-62136-0),
  Springer, 2021.

The course material this assignment draws on is indexed in
`course-material/INDEX.md`, in the private submodule this repository does not
publish; see [`README.md`](README.md).
