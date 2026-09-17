# Index of the MDE course material

Where to find each topic across the lecture decks and the background reading, down to the section and the PDF page. **Read this first**, then open only the section it points at — several of these documents run to 200–400 pages.

- Every PDF has a Markdown conversion beside it, `<name>.md`, produced with docling. Figures are in `<name>-images/`, numbered in reading order; slide-template decoration has been removed.
- Links below go straight to a heading in the `.md`. **Page** is the PDF page (1-based) the section starts on, for when you need the original layout, a formula or a figure the conversion flattened.
- Conversion is faithful, not perfect: some older PDFs carry split accents in their text layer (`B´ ezivin`), and tables from two-column layouts can lose alignment. When exact wording matters, check the page in the PDF.
- Citations for every background document are in [`background/README.md`](background/README.md); slide decks in [`lectures/README.md`](lectures/README.md).

## Topic map

| Topic | Where |
|---|---|
| Course organisation, project types, grading, LLM policy | [project types](lectures/lecture-0-introduction.md#project-types) · [code-generation projects](lectures/lecture-0-introduction.md#type-3-code-generation) · [assessment](lectures/lecture-0-introduction.md#assessment-grading) · [final-grade formula](lectures/lecture-0-introduction.md#formula-for-the-final-grade) · [use of LLMs](lectures/lecture-0-introduction.md#use-of-llms) |
| What a model is | [lecture 1](lectures/lecture-1-models-and-metamodels.md#what-is-a-model) · [working definition](lectures/lecture-1-models-and-metamodels.md#working-definition-of-model) · [Kühne §2](background/lecture-1/matters-of-metamodeling.md#2-what-is-a-model) · [Mellor et al.](background/lecture-0/model-driven-development-guest-editors-introduction.md#what-is-a-model) · [Bézivin 2005 §3.1](background/lecture-1/on-the-unification-power-of-models.md#31-on-the-meaning-of-models) · [MDA Guide](background/lecture-0/mda-guide-rev-2.0.md#model) · [Hughes, philosophy of science](background/lecture-1/models-and-representation.md#models-and-representation) |
| What a metamodel is; instanceOf; metalevels | [lecture 1](lectures/lecture-1-models-and-metamodels.md#definition-of-metamodel) · [instanceOf](lectures/lecture-1-models-and-metamodels.md#models-metamodels-instanceof-relation) · [metalevels](lectures/lecture-1-models-and-metamodels.md#metalevels) · [Kühne §4](background/lecture-1/matters-of-metamodeling.md#4-what-is-a-metamodel) · [token vs type models](background/lecture-1/matters-of-metamodeling.md#3-kinds-of-model-roles) · [Bézivin & Gerbé layers](background/lecture-0/towards-a-precise-definition-of-the-omg-mda-framework.md#32-meta-modeling-layers) · [double instantiation](background/lecture-0/towards-a-precise-definition-of-the-omg-mda-framework.md#51-the-double-instantiation-problem) |
| Linguistic versus ontological metamodelling | [Atkinson & Kühne](background/lecture-1/model-driven-development-a-metamodeling-foundation.md#linguistic-metamodeling) · [ontological](background/lecture-1/model-driven-development-a-metamodeling-foundation.md#ontological-metamodeling) · [traditional four-layer critique](background/lecture-1/model-driven-development-a-metamodeling-foundation.md#traditional-mdd-infrastructure) |
| OMG four-layer architecture, MOF, EMOF, CMOF | [lecture 0](lectures/lecture-0-introduction.md#omg-four-layered-metamodelling-architecture) · [OMG metalevels](lectures/lecture-1-models-and-metamodels.md#omg-metalevels) · [MOF](lectures/lecture-1-models-and-metamodels.md#meta-object-facility-mof) · [EMOF](lectures/lecture-1-models-and-metamodels.md#emof-core-classes) · [CMOF](lectures/lecture-1-models-and-metamodels.md#cmof-core-constructs) |
| EMF and Ecore | [EMF and Ecore](lectures/lecture-1-models-and-metamodels.md#eclipse-modelling-framework-emf-and-ecore) · [Ecore classes](lectures/lecture-1-models-and-metamodels.md#ecore-main-classes) · [PurchaseOrder example](lectures/lecture-1-models-and-metamodels.md#simple-example-purchaseorder) · [Eclipse OCL on metamodels](background/lecture-2/eclipse-ocl-6.6-documentation.md#64-ocl-relationship-to-metamodels) |
| MDA: PIM, PSM, platform | [MDA Guide concepts](background/lecture-0/mda-guide-rev-2.0.md#3basic-concepts-of-mda) · [platform](background/lecture-0/mda-guide-rev-2.0.md#platform) · [PIM and PSM](background/lecture-0/mda-guide-rev-2.0.md#platform-specific-and-independent-models) · [lecture 0 MDA](lectures/lecture-0-introduction.md#model-driven-architecture) · [platform-independent modelling](lectures/lecture-0-introduction.md#platform-independent-modelling) |
| Model transformation (M2M and M2T) | [lecture 0](lectures/lecture-0-introduction.md#what-is-a-model-transformation) · [how to transform](lectures/lecture-0-introduction.md#how-to-transform) · [MDA transformation pattern](background/lecture-0/mda-guide-rev-2.0.md#example-transformation-pattern) · [MDA transformation and execution](background/lecture-0/mda-guide-rev-2.0.md#4-mda-model-transformation-and-execution) · [Bézivin & Gerbé](background/lecture-0/towards-a-precise-definition-of-the-omg-mda-framework.md#55-what-is-a-transformation) · [mapping functions](background/lecture-0/model-driven-development-guest-editors-introduction.md#mapping-functions) |
| Code generation | [lecture 0](lectures/lecture-0-introduction.md#code-generation) · [where MDE is useful](lectures/lecture-0-introduction.md#in-which-projects-is-mde-useful) · [Eclipse OCL code-generation tutorial](background/lecture-2/eclipse-ocl-6.6-documentation.md#44-code-generation-tutorial) |
| Metamodels versus grammars; designing a DSL | [modelware vs grammarware](background/lecture-1/a-tutorial-on-metamodelling-for-grammar-researchers.md#4-modelware-versus-grammarware) · [mapping metamodels to grammars](background/lecture-1/a-tutorial-on-metamodelling-for-grammar-researchers.md#44-mapping-metamodels-to-grammars) · [metamodelling process](background/lecture-1/a-tutorial-on-metamodelling-for-grammar-researchers.md#31-metamodelling-process) · [worked DSL examples](background/lecture-1/a-tutorial-on-metamodelling-for-grammar-researchers.md#5-examples) · [are metamodels language definitions?](background/lecture-1/matters-of-metamodeling.md#5-are-metamodels-language-definitions) · [lecture 3: DSLs in MDE](lectures/lecture-3-domain-specific-languages-and-xtext.md#domain-specific-languages-in-mde) · [defining a DSML](lectures/lecture-3-domain-specific-languages-and-xtext.md#defining-dsmls-dsls-in-mde) · [Mernik et al., design patterns](background/lecture-3/when-and-how-to-develop-domain-specific-languages.md#24-design) |
| OCL: invariants, pre/post-conditions, types | [lecture 2 invariants](lectures/lecture-2-object-constraint-language.md#invariants) · [pre/post](lectures/lecture-2-object-constraint-language.md#pre--and-post-conditions) · [OCL types](lectures/lecture-2-object-constraint-language.md#ocl-types) · [spec §7 language](background/lecture-2/object-constraint-language-2.4-specification.md#7-ocl-language-description) · [spec: invariant placement](background/lecture-2/object-constraint-language-2.4-specification.md#126-invariant) · [spec: precondition](background/lecture-2/object-constraint-language-2.4-specification.md#127-precondition) |
| OCL collections, iterators, standard library | [lecture 2 collections](lectures/lecture-2-object-constraint-language.md#operations-on-collections) · [iterators](lectures/lecture-2-object-constraint-language.md#iterators-on-collections) · [spec §7.6](background/lecture-2/object-constraint-language-2.4-specification.md#76-collection-operations) · [spec standard library](background/lecture-2/object-constraint-language-2.4-specification.md#11-ocl-standard-library) · [predefined iterators](background/lecture-2/object-constraint-language-2.4-specification.md#118-predefined-iterator-expressions) · [Eclipse library reference](background/lecture-2/eclipse-ocl-6.6-documentation.md#chapter-3-the-ocl-standard-library) |
| OCL in Eclipse: OCLinEcore, validation, console | [lecture 2](lectures/lecture-2-object-constraint-language.md#ocl-support-in-eclipse) · [OCLinEcore editor](lectures/lecture-2-object-constraint-language.md#oclinecore-editor) · [validation](lectures/lecture-2-object-constraint-language.md#validation) · [console](lectures/lecture-2-object-constraint-language.md#interactive-ocl-console) · [OCLinEcore language](background/lecture-2/eclipse-ocl-6.6-documentation.md#23-the-oclinecore-language) · [OCLinEcore tutorial](background/lecture-2/eclipse-ocl-6.6-documentation.md#41-oclinecore-tutorial) · [validation tutorial](background/lecture-2/eclipse-ocl-6.6-documentation.md#46-validation-tutorial) |
| OCL formal definition: abstract syntax and semantics | [abstract syntax](background/lecture-2/object-constraint-language-2.4-specification.md#8-abstract-syntax) · [concrete syntax](background/lecture-2/object-constraint-language-2.4-specification.md#9-concrete-syntax) · [semantics](background/lecture-2/object-constraint-language-2.4-specification.md#10-semantics-described-using-uml) · [Essential OCL for metamodelling](background/lecture-2/object-constraint-language-2.4-specification.md#13-the-basic-ocl-and-essential-ocl) |
| State of MDE research, tooling limits, adoption | [grand challenges: technical](background/lecture-0/grand-challenges-in-model-driven-engineering.md#3-technical-challenges) · [tool and implementation challenges](background/lecture-0/grand-challenges-in-model-driven-engineering.md#33-tool-and-implementation-challenges) · [social and community](background/lecture-0/grand-challenges-in-model-driven-engineering.md#4-social-and-community-challenges) · [Bézivin open issues](background/lecture-1/on-the-unification-power-of-models.md#52-some-open-research-issues-in-mde) · [Kent 2002, Model Driven Engineering](background/lecture-0/integrated-formal-methods-ifm-2002-proceedings.md#model-driven-engineering) · [visual modelling adoption](background/lecture-0/present-and-ulterior-software-engineering.md#how-to-make-visual-modeling-more-attractive-to-software-developers) |
| When to build a DSL, and how: decision, analysis, design, implementation | [decision patterns](background/lecture-3/when-and-how-to-develop-domain-specific-languages.md#22-decision) · [analysis](background/lecture-3/when-and-how-to-develop-domain-specific-languages.md#23-analysis) · [design](background/lecture-3/when-and-how-to-develop-domain-specific-languages.md#24-design) · [implementation](background/lecture-3/when-and-how-to-develop-domain-specific-languages.md#25-implementation) · [development support](background/lecture-3/when-and-how-to-develop-domain-specific-languages.md#3-dsl-development-support) · [lecture 3: what a DSL is](lectures/lecture-3-domain-specific-languages-and-xtext.md#domain-specific-languages-dsls) · [DSL versus GPL](lectures/lecture-3-domain-specific-languages-and-xtext.md#weird-comparison) |
| A DSL as a coordinated set of models: abstract syntax, concrete syntax, semantics | [lecture 3](lectures/lecture-3-domain-specific-languages-and-xtext.md#dsl-as-a-set-of-models) · [coordinated set](lectures/lecture-3-domain-specific-languages-and-xtext.md#dsl-as-a-coordinated-set-of-models) · [concrete syntax](lectures/lecture-3-domain-specific-languages-and-xtext.md#concrete-syntax) · [semantics definition](lectures/lecture-3-domain-specific-languages-and-xtext.md#semantics-definition) · [Kurtev et al., DSLs and models](background/lecture-3/model-based-dsl-frameworks.md#25-dsls-and-models) · [technical spaces](background/lecture-3/model-based-dsl-frameworks.md#26-technical-spaces) |
| Textual concrete syntax: Xtext, EMFText, TCS | [Xtext](lectures/lecture-3-domain-specific-languages-and-xtext.md#xtext) · [default workflow](lectures/lecture-3-domain-specific-languages-and-xtext.md#xtext-workflow-default) · [workflow from an Ecore metamodel](lectures/lecture-3-domain-specific-languages-and-xtext.md#xtext-workflow-with-ecore-model) · [default grammar](lectures/lecture-3-domain-specific-languages-and-xtext.md#default-grammar) · [modifying the grammar](lectures/lecture-3-domain-specific-languages-and-xtext.md#modify-the-grammar) · [concrete syntax as a model](lectures/lecture-3-domain-specific-languages-and-xtext.md#concrete-syntax-as-a-model) · [EMFText](lectures/lecture-3-domain-specific-languages-and-xtext.md#concrete-syntax-as-model-in-emftext) · [TCS](background/lecture-3/tcs-a-dsl-for-the-specification-of-textual-concrete-syntaxes-in-model-engineering.md#3-tcs-bridging-metamodels-and-grammars) · [TCS in AMMA](background/lecture-3/model-based-dsl-frameworks.md#43-tcs-language-for-defining-concrete-syntaxes) · [classification of textual-syntax mapping approaches](background/lecture-3/model-driven-architecture-foundations-and-applications-ecmda-fa-2008-proceedings.md#classification-of-concrete-textual-syntax-mapping-approaches) · [metamodel syntactic sheets](background/lecture-3/model-driven-architecture-foundations-and-applications-ecmda-fa-2008-proceedings.md#metamodel-syntactic-sheets-an-approach-for-defining-textual-concrete-syntaxes) · [textual modelling inside graphical modelling](background/lecture-3/model-driven-architecture-foundations-and-applications-ecmda-fa-2008-proceedings.md#textual-modelling-embedded-into-graphical-modelling) · [deriving and refining a textual syntax](background/lecture-3/model-driven-architecture-foundations-and-applications-ecmda-fa-2009-proceedings.md#derivation-and-refinement-of-textual-syntax-for-models) |
| Interpreting a model versus compiling it | [executing models](lectures/lecture-3-domain-specific-languages-and-xtext.md#executing-models-in-mde) · [compiling models](lectures/lecture-3-domain-specific-languages-and-xtext.md#compiling-models-in-mde) · [several steps](lectures/lecture-3-domain-specific-languages-and-xtext.md#compiling-models-in-mde-several-steps-may-be-necessary) · [interpreter and compiler patterns](background/lecture-3/when-and-how-to-develop-domain-specific-languages.md#25-implementation) |
| The abstraction gap, and domain concepts | [lecture 3](lectures/lecture-3-domain-specific-languages-and-xtext.md#abstraction-gap) · [abstractness versus concreteness](lectures/lecture-3-domain-specific-languages-and-xtext.md#abstractness-versus-concreteness) · [modelling as the next step](lectures/lecture-3-domain-specific-languages-and-xtext.md#next-abstraction-step-modelling) · [worked domain: vehicles](lectures/lecture-3-domain-specific-languages-and-xtext.md#problem-domain-vehicles) |
| Model-to-text languages (Task 3) | [Epsilon Generation Language](background/lecture-3/model-driven-architecture-foundations-and-applications-ecmda-fa-2008-proceedings.md#the-epsilon-generation-language) · [lecture 0: code generation](lectures/lecture-0-introduction.md#code-generation) |
| Choosing a transformation language (Task 2) | [comparison of three transformation languages](background/lecture-3/model-driven-architecture-foundations-and-applications-ecmda-fa-2009-proceedings.md#comparison-of-three-model-transformation-languages) · [higher-order transformations](background/lecture-3/model-driven-architecture-foundations-and-applications-ecmda-fa-2009-proceedings.md#on-the-use-of-higher-order-model-transformations) · [ATL in AMMA](background/lecture-3/model-based-dsl-frameworks.md#44-atl-model-transformation-language) |
| Microservices (the domain of this repository's model) | [yesterday, today, tomorrow](background/lecture-0/present-and-ulterior-software-engineering.md#microservices-yesterday-today-and-tomorrow) |

## Documents

### Lecture 0 — Introduction

[`lectures/lecture-0-introduction.md`](lectures/lecture-0-introduction.md) · [PDF](lectures/lecture-0-introduction.pdf) · 53 pages

Course organisation (teachers, activities, project and its three types, grading formula, LLM policy) followed by the case for MDE: the software-change problem, MDA and its platform-independent modelling, the OMG four-layer architecture, what a model transformation is, and where MDE pays off, code generation included.

<details><summary>Sections</summary>

| Page | Section |
|---:|---|
| 3 | [TEACHERS](lectures/lecture-0-introduction.md#teachers) |
| 4 | [INTENDED LEARNING OUTCOMES](lectures/lecture-0-introduction.md#intended-learning-outcomes) |
| 5 | [COURSE PREREQUISITES](lectures/lecture-0-introduction.md#course-prerequisites) |
| 5 | [Mandatory](lectures/lecture-0-introduction.md#mandatory) |
| 5 | [Convenient](lectures/lecture-0-introduction.md#convenient) |
| 6 | [COURSE ACTIVITIES](lectures/lecture-0-introduction.md#course-activities) |
| 6 | [Lectures](lectures/lecture-0-introduction.md#lectures) |
| 6 | [Practical sessions](lectures/lecture-0-introduction.md#practical-sessions) |
| 6 | [Final exam](lectures/lecture-0-introduction.md#final-exam) |
| 8 | [BOOK](lectures/lecture-0-introduction.md#book) |
| 9 | [PROJECT](lectures/lecture-0-introduction.md#project) |
| 9 | [Goal](lectures/lecture-0-introduction.md#goal) |
| 9 | [Tasks](lectures/lecture-0-introduction.md#tasks) |
| 9 | [Presentation](lectures/lecture-0-introduction.md#presentation) |
| 10 | [PROJECT TYPES](lectures/lecture-0-introduction.md#project-types) |
| 10 | [Type 1: Interoperability](lectures/lecture-0-introduction.md#type-1-interoperability) |
| 10 | [Type 2: Model discovery ('Harvesting')](lectures/lecture-0-introduction.md#type-2-model-discovery-harvesting) |
| 10 | [Type 3: Code generation](lectures/lecture-0-introduction.md#type-3-code-generation) |
| 13 | [ASSESSMENT (GRADING)](lectures/lecture-0-introduction.md#assessment-grading) |
| 13 | [Group assessment](lectures/lecture-0-introduction.md#group-assessment) |
| 13 | [Individual assessment](lectures/lecture-0-introduction.md#individual-assessment) |
| 14 | [GRADING](lectures/lecture-0-introduction.md#grading) |
| 14 | [Exam Component ( E )](lectures/lecture-0-introduction.md#exam-component--e) |
| 14 | [Project component ( P )](lectures/lecture-0-introduction.md#project-component--p) |
| 15 | [FORMULA FOR THE FINAL GRADE](lectures/lecture-0-introduction.md#formula-for-the-final-grade) |
| 15 | [Final grade](lectures/lecture-0-introduction.md#final-grade) |
| 16 | [COMMUNICATION: CANVAS SITE](lectures/lecture-0-introduction.md#communication-canvas-site) |
| 16 | [Available information](lectures/lecture-0-introduction.md#available-information) |
| 16 | [Do you want a Teams site?](lectures/lecture-0-introduction.md#do-you-want-a-teams-site) |
| 17 | [PROACTIVE ATTITUDE](lectures/lecture-0-introduction.md#proactive-attitude) |
| 18 | [Originality](lectures/lecture-0-introduction.md#originality) |
| 18 | [Feedback](lectures/lecture-0-introduction.md#feedback) |
| 19 | [USE OF LLMS](lectures/lecture-0-introduction.md#use-of-llms) |
| 22 | [WHAT SEEMED TO BE 'THE PROBLEM' BACK IN THE 90'S?](lectures/lecture-0-introduction.md#what-seemed-to-be-the-problem-back-in-the-90s) |
| 23 | [FACTORS THAT AFFECT SOFTWARE DEVELOPMENT](lectures/lecture-0-introduction.md#factors-that-affect-software-development) |
| 24 | [System requirements changes](lectures/lecture-0-introduction.md#system-requirements-changes) |
| 24 | [Constant technology change](lectures/lecture-0-introduction.md#constant-technology-change) |
| 24 | [Personnel changes](lectures/lecture-0-introduction.md#personnel-changes) |
| 25 | [HOW CAN WE COPE WITH THESE PROBLEMS?](lectures/lecture-0-introduction.md#how-can-we-cope-with-these-problems) |
| 26 | [FROM BUSINESS REQUIREMENTS (FUNCTIONALITY) TO TECHNOLOGY](lectures/lecture-0-introduction.md#from-business-requirements-functionality-to-technology) |
| 27 | [REALITY OF MODELS BACK IN 2000](lectures/lecture-0-introduction.md#reality-of-models-back-in-2000) |
| 28 | [MODEL-DRIVEN ARCHITECTURE](lectures/lecture-0-introduction.md#model-driven-architecture) |
| 28 | [Proposed by OMG](lectures/lecture-0-introduction.md#proposed-by-omg) |
| 28 | [MDA Guide](lectures/lecture-0-introduction.md#mda-guide) |
| 30 | [MDA APPROACH](lectures/lecture-0-introduction.md#mda-approach) |
| 31 | [BUT WHAT IS A 'MODEL' ANY WAY?](lectures/lecture-0-introduction.md#but-what-is-a-model-any-way) |
| 32 | [TYPICAL MDA-BASED DEVELOPMENT](lectures/lecture-0-introduction.md#typical-mda-based-development) |
| 33 | [BUT WHAT IS THEN A 'PLATFORM'?](lectures/lecture-0-introduction.md#but-what-is-then-a-platform) |
| 33 | [Platform](lectures/lecture-0-introduction.md#platform) |
| 33 | [Technologies (resources)](lectures/lecture-0-introduction.md#technologies-resources) |
| 34 | [PLATFORM-INDEPENDENT MODELLING](lectures/lecture-0-introduction.md#platform-independent-modelling) |
| 35 | [OMG FOUR-LAYERED METAMODELLING ARCHITECTURE](lectures/lecture-0-introduction.md#omg-four-layered-metamodelling-architecture) |
| 36 | [OMG METALEVELS: EXAMPLE](lectures/lecture-0-introduction.md#omg-metalevels-example) |
| 37 | [WHAT IS A MODEL TRANSFORMATION?](lectures/lecture-0-introduction.md#what-is-a-model-transformation) |
| 38 | [HOW TO TRANSFORM?](lectures/lecture-0-introduction.md#how-to-transform) |
| 38 | [Example: UML to Java](lectures/lecture-0-introduction.md#example-uml-to-java) |
| 38 | [What kind of transformation rules?](lectures/lecture-0-introduction.md#what-kind-of-transformation-rules) |
| 38 | [How to specify transformation rules?](lectures/lecture-0-introduction.md#how-to-specify-transformation-rules) |
| 39 | [MDA TRANSFORMATION PATTERN](lectures/lecture-0-introduction.md#mda-transformation-pattern) |
| 40 | [MDA IS NOT A METHODOLOGY](lectures/lecture-0-introduction.md#mda-is-not-a-methodology) |
| 41 | [THE MD* JUNGLE FROM BRAMBILLA ET AL 2017](lectures/lecture-0-introduction.md#the-md-jungle-from-brambilla-et-al-2017) |
| 42 | [MODEL-DRIVEN ENGINEERING (MDE)](lectures/lecture-0-introduction.md#model-driven-engineering-mde) |
| 43 | [WHY SHOULD WE USE MDE?](lectures/lecture-0-introduction.md#why-should-we-use-mde) |
| 45 | [IN WHICH PROJECTS IS MDE USEFUL?](lectures/lecture-0-introduction.md#in-which-projects-is-mde-useful) |
| 45 | [Code generation / Software development](lectures/lecture-0-introduction.md#code-generation--software-development) |
| 45 | [Systems interoperability](lectures/lecture-0-introduction.md#systems-interoperability) |
| 45 | [Model discovery (Harvesting)](lectures/lecture-0-introduction.md#model-discovery-harvesting) |
| 46 | [CODE GENERATION](lectures/lecture-0-introduction.md#code-generation) |
| 50 | [MDE IN THE INDUSTRY](lectures/lecture-0-introduction.md#mde-in-the-industry) |
| 51 | [MORE MODERN MDE APPLICATIONS](lectures/lecture-0-introduction.md#more-modern-mde-applications) |
| 52 | [TAKE-HOME MESSAGES](lectures/lecture-0-introduction.md#take-home-messages) |
| 53 | [REFERENCES](lectures/lecture-0-introduction.md#references) |

</details>

### Lecture 1 — Models and metamodels

[`lectures/lecture-1-models-and-metamodels.md`](lectures/lecture-1-models-and-metamodels.md) · [PDF](lectures/lecture-1-models-and-metamodels.pdf) · 57 pages

Definitions of *model* from philosophy of science and computer science, a working definition, metamodels as models of models, the instanceOf relation and metalevels, metamodelling architectures, MOF 1.x/2.x (EMOF, CMOF), and EMF/Ecore with a PurchaseOrder example. The genealogy language is the running example.

<details><summary>Sections</summary>

| Page | Section |
|---:|---|
| 1 | [LECTURE 1: MODELS AND METAMODELS](lectures/lecture-1-models-and-metamodels.md#lecture-1-models-and-metamodels) |
| 3 | [WHAT IS A 'MODEL'?](lectures/lecture-1-models-and-metamodels.md#what-is-a-model) |
| 4 | ['AIRPLANE MODEL' IMAGES IN GOOGLE](lectures/lecture-1-models-and-metamodels.md#airplane-model-images-in-google) |
| 5 | [NOTION OF MODEL](lectures/lecture-1-models-and-metamodels.md#notion-of-model) |
| 6 | [MODELS IN PHILOSOPHY OF SCIENCE DEFINITIONS](lectures/lecture-1-models-and-metamodels.md#models-in-philosophy-of-science-definitions) |
| 7 | [MODELS IN COMPUTER SCIENCE DEFINITIONS](lectures/lecture-1-models-and-metamodels.md#models-in-computer-science-definitions) |
| 8 | [MODELS IN COMPUTER SCIENCE MORE DEFINITIONS](lectures/lecture-1-models-and-metamodels.md#models-in-computer-science-more-definitions) |
| 9 | [(GENERAL) CHARACTERISTICS OF MODELS](lectures/lecture-1-models-and-metamodels.md#general-characteristics-of-models) |
| 10 | [SYSTEM AND MODEL](lectures/lecture-1-models-and-metamodels.md#system-and-model) |
| 11 | [MODELS AS ABSTRACTIONS](lectures/lecture-1-models-and-metamodels.md#models-as-abstractions) |
| 12 | [NATURE OF THE MODELOF RELATION](lectures/lecture-1-models-and-metamodels.md#nature-of-the-modelof-relation) |
| 13 | [WORKING DEFINITION OF MODEL](lectures/lecture-1-models-and-metamodels.md#working-definition-of-model) |
| 14 | [PURPOSE OF MODELS](lectures/lecture-1-models-and-metamodels.md#purpose-of-models) |
| 14 | [[BRAMBILLA, CABOT, WIMMER 2012]](lectures/lecture-1-models-and-metamodels.md#brambilla-cabot-wimmer-2012) |
| 15 | [SOFTWARE SYSTEMS AS MODELS](lectures/lecture-1-models-and-metamodels.md#software-systems-as-models) |
| 15 | [Examples](lectures/lecture-1-models-and-metamodels.md#examples) |
| 16 | [SOFTWARE ARTIFACTS AS MODELS](lectures/lecture-1-models-and-metamodels.md#software-artifacts-as-models) |
| 17 | [MODELLING IN SOFTWARE ENGINEERING](lectures/lecture-1-models-and-metamodels.md#modelling-in-software-engineering) |
| 19 | [METAMODEL](lectures/lecture-1-models-and-metamodels.md#metamodel) |
| 20 | [METAMODEL AND METAMODELLING MORE DEFINITIONS](lectures/lecture-1-models-and-metamodels.md#metamodel-and-metamodelling-more-definitions) |
| 21 | [DEFINITION OF METAMODEL](lectures/lecture-1-models-and-metamodels.md#definition-of-metamodel) |
| 24 | [EXAMPLE: A GRAPHICAL LANGUAGE FOR GENEALOGY [GUIZZARDI]](lectures/lecture-1-models-and-metamodels.md#example-a-graphical-language-for-genealogy-guizzardi) |
| 25 | [MODEL EXAMPLES](lectures/lecture-1-models-and-metamodels.md#model-examples) |
| 26 | [GENEALOGY METAMODEL](lectures/lecture-1-models-and-metamodels.md#genealogy-metamodel) |
| 27 | [METAMODEL AS A 'MODEL OF A MODEL'](lectures/lecture-1-models-and-metamodels.md#metamodel-as-a-model-of-a-model) |
| 27 | [Alternative line of reasoning](lectures/lecture-1-models-and-metamodels.md#alternative-line-of-reasoning) |
| 28 | [MODELS, METAMODELS, INSTANCEOF RELATION](lectures/lecture-1-models-and-metamodels.md#models-metamodels-instanceof-relation) |
| 30 | [METALEVELS](lectures/lecture-1-models-and-metamodels.md#metalevels) |
| 31 | [METAMODELLING ARCHITECTURES](lectures/lecture-1-models-and-metamodels.md#metamodelling-architectures) |
| 33 | [METAMODELLING ARCHITECTURES EXAMPLES](lectures/lecture-1-models-and-metamodels.md#metamodelling-architectures-examples) |
| 34 | [OMG METALEVELS](lectures/lecture-1-models-and-metamodels.md#omg-metalevels) |
| 34 | [META-OBJECT FACILITY (MOF)](lectures/lecture-1-models-and-metamodels.md#meta-object-facility-mof) |
| 35 | [OMG METALEVELS: EXAMPLE](lectures/lecture-1-models-and-metamodels.md#omg-metalevels-example) |
| 38 | [EVOLUTION OF OMG LANGUAGES MOF HISTORY](lectures/lecture-1-models-and-metamodels.md#evolution-of-omg-languages-mof-history) |
| 39 | [MOF VERSIONS](lectures/lecture-1-models-and-metamodels.md#mof-versions) |
| 40 | [MOF 1.X MAIN CLASS DIAGRAM](lectures/lecture-1-models-and-metamodels.md#mof-1x-main-class-diagram) |
| 41 | [MOF 1.X COMPLETE MODEL](lectures/lecture-1-models-and-metamodels.md#mof-1x-complete-model) |
| 42 | [MOF 1.X KEY ABSTRACT CLASSES](lectures/lecture-1-models-and-metamodels.md#mof-1x-key-abstract-classes) |
| 42 | [NOT DIRECTLY INSTANTIATED, FOR STRUCTURING ONLY](lectures/lecture-1-models-and-metamodels.md#not-directly-instantiated-for-structuring-only) |
| 43 | [MOF 1.X MAIN CONCRETE (META)CLASSES](lectures/lecture-1-models-and-metamodels.md#mof-1x-main-concrete-metaclasses) |
| 44 | [MOF 1.X KEY ASSOCIATIONS](lectures/lecture-1-models-and-metamodels.md#mof-1x-key-associations) |
| 45 | [MOF 2.X STRUCTURE](lectures/lecture-1-models-and-metamodels.md#mof-2x-structure) |
| 46 | [MOF 2.5.1 STRUCTURE](lectures/lecture-1-models-and-metamodels.md#mof-251-structure) |
| 47 | [EMOF CORE CLASSES](lectures/lecture-1-models-and-metamodels.md#emof-core-classes) |
| 48 | [CMOF CORE CONSTRUCTS](lectures/lecture-1-models-and-metamodels.md#cmof-core-constructs) |
| 49 | [MOF IMPLEMENTATIONS](lectures/lecture-1-models-and-metamodels.md#mof-implementations) |
| 50 | [ECLIPSE MODELLING FRAMEWORK (EMF) AND ECORE](lectures/lecture-1-models-and-metamodels.md#eclipse-modelling-framework-emf-and-ecore) |
| 51 | [EMF (ECORE) MODEL DEFINITION](lectures/lecture-1-models-and-metamodels.md#emf-ecore-model-definition) |
| 53 | [ECORE MAIN CLASSES](lectures/lecture-1-models-and-metamodels.md#ecore-main-classes) |
| 54 | [SIMPLE EXAMPLE: PURCHASEORDER](lectures/lecture-1-models-and-metamodels.md#simple-example-purchaseorder) |
| 55 | [PURCHASEORDER ECORE MODEL GRAPH REPRESENTATION](lectures/lecture-1-models-and-metamodels.md#purchaseorder-ecore-model-graph-representation) |
| 56 | [TAKE-HOME MESSAGES](lectures/lecture-1-models-and-metamodels.md#take-home-messages) |
| 57 | [REFERENCES](lectures/lecture-1-models-and-metamodels.md#references) |

</details>

### Lecture 2 — Object Constraint Language

[`lectures/lecture-2-object-constraint-language.md`](lectures/lecture-2-object-constraint-language.md) · [PDF](lectures/lecture-2-object-constraint-language.pdf) · 40 pages

Why metamodels need constraints, OCL invariants and pre/post-conditions, the OCL type hierarchy, let/if expressions, navigation, collection operations and iterators, then OCL in Eclipse: the OCLinEcore editor, validating instances, the interactive console, and a recursive constraint on the genealogy metamodel.

<details><summary>Sections</summary>

| Page | Section |
|---:|---|
| 3 | [MOTIVATION](lectures/lecture-2-object-constraint-language.md#motivation) |
| 5 | [OBJECT CONSTRAINT LANGUAGE (OCL)](lectures/lecture-2-object-constraint-language.md#object-constraint-language-ocl) |
| 6 | [OCL CONSTRAINT LIMIT THE SET OF VALID MODELS](lectures/lecture-2-object-constraint-language.md#ocl-constraint-limit-the-set-of-valid-models) |
| 7 | [OCL LANGUAGE FEATURES](lectures/lecture-2-object-constraint-language.md#ocl-language-features) |
| 8 | [OCL APPLICATIONS](lectures/lecture-2-object-constraint-language.md#ocl-applications) |
| 9 | [OCL EXPRESSION](lectures/lecture-2-object-constraint-language.md#ocl-expression) |
| 10 | [INVARIANTS](lectures/lecture-2-object-constraint-language.md#invariants) |
| 10 | [inv invariant: constraint must be true](lectures/lecture-2-object-constraint-language.md#inv-invariant-constraint-must-be-true) |
| 11 | [PRE- AND POST-CONDITIONS](lectures/lecture-2-object-constraint-language.md#pre--and-post-conditions) |
| 11 | [context](lectures/lecture-2-object-constraint-language.md#context) |
| 12 | [OTHER CONSTRAINTS](lectures/lecture-2-object-constraint-language.md#other-constraints) |
| 12 | [Employee](lectures/lecture-2-object-constraint-language.md#employee) |
| 13 | [OCL METAMODEL](lectures/lecture-2-object-constraint-language.md#ocl-metamodel) |
| 13 | [Metamodel](lectures/lecture-2-object-constraint-language.md#metamodel) |
| 14 | [OCL TYPES METAMODEL (TYPE HIERARCHY)](lectures/lecture-2-object-constraint-language.md#ocl-types-metamodel-type-hierarchy) |
| 15 | [OCL TYPES](lectures/lecture-2-object-constraint-language.md#ocl-types) |
| 15 | [· Primitive types](lectures/lecture-2-object-constraint-language.md#primitive-types) |
| 17 | [BASIC CONSTRUCTS FOR OCL EXPRESSIONS](lectures/lecture-2-object-constraint-language.md#basic-constructs-for-ocl-expressions) |
| 18 | [LET-IN AND IF-THEN-ELSE EXAMPLE](lectures/lecture-2-object-constraint-language.md#let-in-and-if-then-else-example) |
| 19 | [ACCESSING OBJECTS AND THEIR PROPERTIES](lectures/lecture-2-object-constraint-language.md#accessing-objects-and-their-properties) |
| 19 | [· Attributes](lectures/lecture-2-object-constraint-language.md#attributes) |
| 19 | [· Operations](lectures/lecture-2-object-constraint-language.md#operations) |
| 21 | [Association ends](lectures/lecture-2-object-constraint-language.md#association-ends) |
| 21 | [Example](lectures/lecture-2-object-constraint-language.md#example) |
| 22 | [OPERATIONS ON COLLECTIONS](lectures/lecture-2-object-constraint-language.md#operations-on-collections) |
| 23 | [ITERATORS ON COLLECTIONS](lectures/lecture-2-object-constraint-language.md#iterators-on-collections) |
| 27 | [PRE-DEFINED OPERATIONS](lectures/lecture-2-object-constraint-language.md#pre-defined-operations) |
| 29 | [BREAK](lectures/lecture-2-object-constraint-language.md#break) |
| 30 | [OCL SUPPORT IN ECLIPSE](lectures/lecture-2-object-constraint-language.md#ocl-support-in-eclipse) |
| 31 | [OCLINECORE TOOLS](lectures/lecture-2-object-constraint-language.md#oclinecore-tools) |
| 32 | [OCLINECORE EDITOR](lectures/lecture-2-object-constraint-language.md#oclinecore-editor) |
| 33 | [CREATING MODEL INSTANCES](lectures/lecture-2-object-constraint-language.md#creating-model-instances) |
| 34 | [VALIDATION](lectures/lecture-2-object-constraint-language.md#validation) |
| 35 | [INTERACTIVE OCL CONSOLE](lectures/lecture-2-object-constraint-language.md#interactive-ocl-console) |
| 36 | [GENEALOGY EXAMPLE (REVISITED)](lectures/lecture-2-object-constraint-language.md#genealogy-example-revisited) |
| 37 | [RECURSIVE OCL CONSTRAINT](lectures/lecture-2-object-constraint-language.md#recursive-ocl-constraint) |
| 38 | [PRACTICAL SESSION PREPARATION](lectures/lecture-2-object-constraint-language.md#practical-session-preparation) |
| 39 | [TAKE-HOME MESSAGES](lectures/lecture-2-object-constraint-language.md#take-home-messages) |
| 40 | [REFERENCES](lectures/lecture-2-object-constraint-language.md#references) |

</details>

### Lecture 3 — Domain-specific languages, and textual concrete syntax

[`lectures/lecture-3-domain-specific-languages-and-xtext.md`](lectures/lecture-3-domain-specific-languages-and-xtext.md) · [PDF](lectures/lecture-3-domain-specific-languages-and-xtext.pdf) · 42 pages

The abstraction gap between a problem domain and the computation domain, and the domain-specific language as the way to close it: what a DSL is, how it compares with a general-purpose language, and the two ways a model is given meaning — interpreted, or compiled through one or more transformation steps. Then the DSL as a coordinated set of models (abstract syntax, concrete syntax, semantics definition, each an instance of its own metamodel), concrete syntax as a model, and Xtext in practice: the default workflow, the workflow that starts from an existing Ecore metamodel, the generated default grammar, how to modify it, and a worked SQL example.

<details><summary>Sections</summary>

| Page | Section |
|---:|---|
| 2 | [IN THIS PRESENTATION:](lectures/lecture-3-domain-specific-languages-and-xtext.md#in-this-presentation) |
| 3 | [ABSTRACTION GAP](lectures/lecture-3-domain-specific-languages-and-xtext.md#abstraction-gap) |
| 6 | [ABSTRACTNESS VERSUS CONCRETENESS](lectures/lecture-3-domain-specific-languages-and-xtext.md#abstractness-versus-concreteness) |
| 8 | [NEXT ABSTRACTION STEP: MODELLING](lectures/lecture-3-domain-specific-languages-and-xtext.md#next-abstraction-step-modelling) |
| 9 | [PROBLEM DOMAIN: VEHICLES](lectures/lecture-3-domain-specific-languages-and-xtext.md#problem-domain-vehicles) |
| 10 | [DOMAIN SPECIFIC LANGUAGES (DSLS)](lectures/lecture-3-domain-specific-languages-and-xtext.md#domain-specific-languages-dsls) |
| 11 | [WEIRD COMPARISON](lectures/lecture-3-domain-specific-languages-and-xtext.md#weird-comparison) |
| 12 | [DOMAIN-SPECIFIC LANGUAGES IN MDE](lectures/lecture-3-domain-specific-languages-and-xtext.md#domain-specific-languages-in-mde) |
| 13 | [EXECUTING MODELS IN MDE](lectures/lecture-3-domain-specific-languages-and-xtext.md#executing-models-in-mde) |
| 15 | [COMPILING MODELS IN MDE](lectures/lecture-3-domain-specific-languages-and-xtext.md#compiling-models-in-mde) |
| 16 | [COMPILING MODELS IN MDE SEVERAL STEPS MAY BE NECESSARY](lectures/lecture-3-domain-specific-languages-and-xtext.md#compiling-models-in-mde-several-steps-may-be-necessary) |
| 17 | [ROLE OF DSLS IN MDE](lectures/lecture-3-domain-specific-languages-and-xtext.md#role-of-dsls-in-mde) |
| 18 | [DEFINING DSMLS (DSLS) IN MDE](lectures/lecture-3-domain-specific-languages-and-xtext.md#defining-dsmls-dsls-in-mde) |
| 19 | [DSL AS A SET OF MODELS](lectures/lecture-3-domain-specific-languages-and-xtext.md#dsl-as-a-set-of-models) |
| 20 | [CONCRETE SYNTAX](lectures/lecture-3-domain-specific-languages-and-xtext.md#concrete-syntax) |
| 22 | [SEMANTICS DEFINITION](lectures/lecture-3-domain-specific-languages-and-xtext.md#semantics-definition) |
| 24 | [TAKE HOME MESSAGES](lectures/lecture-3-domain-specific-languages-and-xtext.md#take-home-messages) |
| 25 | [REFERENCES](lectures/lecture-3-domain-specific-languages-and-xtext.md#references) |
| 27 | [WHAT DO WE KNOW SO FAR?](lectures/lecture-3-domain-specific-languages-and-xtext.md#what-do-we-know-so-far) |
| 28 | [DSL AS A COORDINATED SET OF MODELS](lectures/lecture-3-domain-specific-languages-and-xtext.md#dsl-as-a-coordinated-set-of-models) |
| 29 | [CONCRETE SYNTAX AS A MODEL](lectures/lecture-3-domain-specific-languages-and-xtext.md#concrete-syntax-as-a-model) |
| 30 | [CONCRETE SYNTAX AS MODEL (IN EMFTEXT)](lectures/lecture-3-domain-specific-languages-and-xtext.md#concrete-syntax-as-model-in-emftext) |
| 32 | [XTEXT](lectures/lecture-3-domain-specific-languages-and-xtext.md#xtext) |
| 33 | [XTEXT WORKFLOW (DEFAULT)](lectures/lecture-3-domain-specific-languages-and-xtext.md#xtext-workflow-default) |
| 33 | [USED IN THE TUTORIALS](lectures/lecture-3-domain-specific-languages-and-xtext.md#used-in-the-tutorials) |
| 34 | [XTEXT WORKFLOW WITH ECORE MODEL](lectures/lecture-3-domain-specific-languages-and-xtext.md#xtext-workflow-with-ecore-model) |
| 35 | [EXAMPLE: START WITH A METAMODEL (ONLY FRAGMENT IS SHOWN)](lectures/lecture-3-domain-specific-languages-and-xtext.md#example-start-with-a-metamodel-only-fragment-is-shown) |
| 36 | [PROCEDURE TO DEFINE CONCRETE SYNTAX OF ECORE METAMODEL](lectures/lecture-3-domain-specific-languages-and-xtext.md#procedure-to-define-concrete-syntax-of-ecore-metamodel) |
| 36 | [DEFAULT GRAMMAR](lectures/lecture-3-domain-specific-languages-and-xtext.md#default-grammar) |
| 38 | [DEFAULT GRAMMAR (CONT.)](lectures/lecture-3-domain-specific-languages-and-xtext.md#default-grammar-cont) |
| 39 | [MODIFY THE GRAMMAR](lectures/lecture-3-domain-specific-languages-and-xtext.md#modify-the-grammar) |
| 40 | [EXAMPLE .SQL FILE](lectures/lecture-3-domain-specific-languages-and-xtext.md#example-sql-file) |
| 41 | [TAKE-HOME MESSAGES](lectures/lecture-3-domain-specific-languages-and-xtext.md#take-home-messages) |

</details>

### OMG MDA Guide rev. 2.0 (2014)

[`background/lecture-0/mda-guide-rev-2.0.md`](background/lecture-0/mda-guide-rev-2.0.md) · [PDF](background/lecture-0/mda-guide-rev-2.0.pdf) · 15 pages

The OMG's own short statement of Model Driven Architecture: the value of models, basic concepts (system, model, modelling language, viewpoint, abstraction, platform, transformation), the PIM→PSM transformation pattern, lifecycle support, and the family of MDA standards. The authoritative source for MDA vocabulary.

<details><summary>Sections</summary>

| Page | Section |
|---:|---|
| 1 | [Object Management Group Model Driven Architecture (MDA) MDA Guide rev. 2.0](background/lecture-0/mda-guide-rev-2.0.md#object-management-group-model-driven-architecture-mda-mda-guide-rev-20) |
| 1 | [Executive Summary](background/lecture-0/mda-guide-rev-2.0.md#executive-summary) |
| 2 | [· The MDA approach to deriving value from models](background/lecture-0/mda-guide-rev-2.0.md#the-mda-approach-to-deriving-value-from-models) |
| 2 | [Models as communications vehicles](background/lecture-0/mda-guide-rev-2.0.md#models-as-communications-vehicles) |
| 2 | [Derivation via automated transformation](background/lecture-0/mda-guide-rev-2.0.md#derivation-via-automated-transformation) |
| 2 | [Model Analytics](background/lecture-0/mda-guide-rev-2.0.md#model-analytics) |
| 3 | [Model Simulation and Execution](background/lecture-0/mda-guide-rev-2.0.md#model-simulation-and-execution) |
| 3 | [Deriving information from models](background/lecture-0/mda-guide-rev-2.0.md#deriving-information-from-models) |
| 3 | [Structuring Unstructured Information](background/lecture-0/mda-guide-rev-2.0.md#structuring-unstructured-information) |
| 3 | [· The Structure and Semantics of Models](background/lecture-0/mda-guide-rev-2.0.md#the-structure-and-semantics-of-models) |
| 4 | [What We Model - the Domain Subject Area](background/lecture-0/mda-guide-rev-2.0.md#what-we-model---the-domain-subject-area) |
| 5 | [3.Basic Concepts of MDA](background/lecture-0/mda-guide-rev-2.0.md#3basic-concepts-of-mda) |
| 5 | [System](background/lecture-0/mda-guide-rev-2.0.md#system) |
| 5 | [Model](background/lecture-0/mda-guide-rev-2.0.md#model) |
| 6 | [Modeling Language](background/lecture-0/mda-guide-rev-2.0.md#modeling-language) |
| 6 | [Architecture](background/lecture-0/mda-guide-rev-2.0.md#architecture) |
| 7 | [View and Viewpoint](background/lecture-0/mda-guide-rev-2.0.md#view-and-viewpoint) |
| 7 | [Abstraction](background/lecture-0/mda-guide-rev-2.0.md#abstraction) |
| 8 | [Architectural Layers](background/lecture-0/mda-guide-rev-2.0.md#architectural-layers) |
| 8 | [Transformation](background/lecture-0/mda-guide-rev-2.0.md#transformation) |
| 9 | [Separation of Concerns](background/lecture-0/mda-guide-rev-2.0.md#separation-of-concerns) |
| 9 | [Platform](background/lecture-0/mda-guide-rev-2.0.md#platform) |
| 9 | [Business or domain platform types](background/lecture-0/mda-guide-rev-2.0.md#business-or-domain-platform-types) |
| 9 | [Computer Hardware and Software platform types](background/lecture-0/mda-guide-rev-2.0.md#computer-hardware-and-software-platform-types) |
| 10 | [4. MDA Model Transformation and Execution](background/lecture-0/mda-guide-rev-2.0.md#4-mda-model-transformation-and-execution) |
| 10 | [Automating the path from models to executable systems](background/lecture-0/mda-guide-rev-2.0.md#automating-the-path-from-models-to-executable-systems) |
| 11 | [Platform specific and independent models](background/lecture-0/mda-guide-rev-2.0.md#platform-specific-and-independent-models) |
| 11 | [Example Transformation Pattern](background/lecture-0/mda-guide-rev-2.0.md#example-transformation-pattern) |
| 12 | [Considerations for automating the path from models to executable systems](background/lecture-0/mda-guide-rev-2.0.md#considerations-for-automating-the-path-from-models-to-executable-systems) |
| 12 | [Layers of applying the PIM and PSM pattern](background/lecture-0/mda-guide-rev-2.0.md#layers-of-applying-the-pim-and-psm-pattern) |
| 13 | [5. System Lifecycle Support in MDA](background/lecture-0/mda-guide-rev-2.0.md#5-system-lifecycle-support-in-mda) |
| 14 | [6. Set of MDA Standards](background/lecture-0/mda-guide-rev-2.0.md#6-set-of-mda-standards) |
| 14 | [Foundational model management and transformation](background/lecture-0/mda-guide-rev-2.0.md#foundational-model-management-and-transformation) |
| 14 | [Unified Modeling Language and Horizontal Profiles](background/lecture-0/mda-guide-rev-2.0.md#unified-modeling-language-and-horizontal-profiles) |
| 15 | [Application of MDA to specific requirements](background/lecture-0/mda-guide-rev-2.0.md#application-of-mda-to-specific-requirements) |
| 15 | [Reference:](background/lecture-0/mda-guide-rev-2.0.md#reference) |

</details>

### Bézivin & Gerbé — Towards a Precise Definition of the OMG/MDA Framework (2001)

[`background/lecture-0/towards-a-precise-definition-of-the-omg-mda-framework.md`](background/lecture-0/towards-a-precise-definition-of-the-omg-mda-framework.md) · [PDF](background/lecture-0/towards-a-precise-definition-of-the-omg-mda-framework.pdf) · 8 pages

Uses Sowa's conceptual graphs to pin down systems, models and metamodels in MDA, the metamodelling layers, and central problems: double instantiation, model–metamodel relationships, what a layer is, what a transformation is.

<details><summary>Sections</summary>

| Page | Section |
|---:|---|
| 1 | [Towards a Precise Definition of the OMG/MDA Framework](background/lecture-0/towards-a-precise-definition-of-the-omg-mda-framework.md#towards-a-precise-definition-of-the-omgmda-framework) |
| 1 | [Abstract](background/lecture-0/towards-a-precise-definition-of-the-omg-mda-framework.md#abstract) |
| 1 | [1 Introduction](background/lecture-0/towards-a-precise-definition-of-the-omg-mda-framework.md#1-introduction) |
| 1 | [2 Presentation of Conceptual Graphs](background/lecture-0/towards-a-precise-definition-of-the-omg-mda-framework.md#2-presentation-of-conceptual-graphs) |
| 2 | [3 From OMA to MDA](background/lecture-0/towards-a-precise-definition-of-the-omg-mda-framework.md#3-from-oma-to-mda) |
| 2 | [3.1 Systems, models and meta-models](background/lecture-0/towards-a-precise-definition-of-the-omg-mda-framework.md#31-systems-models-and-meta-models) |
| 3 | [3.2 Meta-modeling layers](background/lecture-0/towards-a-precise-definition-of-the-omg-mda-framework.md#32-meta-modeling-layers) |
| 3 | [4 A Framework for Understanding MDA](background/lecture-0/towards-a-precise-definition-of-the-omg-mda-framework.md#4-a-framework-for-understanding-mda) |
| 4 | [5 Some Central Issues in Model Engineering](background/lecture-0/towards-a-precise-definition-of-the-omg-mda-framework.md#5-some-central-issues-in-model-engineering) |
| 4 | [5.1 The double instantiation problem](background/lecture-0/towards-a-precise-definition-of-the-omg-mda-framework.md#51-the-double-instantiation-problem) |
| 5 | [5.2 Explicit specification](background/lecture-0/towards-a-precise-definition-of-the-omg-mda-framework.md#52-explicit-specification) |
| 5 | [5.3 Relationships between a model and a metamodel](background/lecture-0/towards-a-precise-definition-of-the-omg-mda-framework.md#53-relationships-between-a-model-and-a-metamodel) |
| 6 | [5.4 What is a layer?](background/lecture-0/towards-a-precise-definition-of-the-omg-mda-framework.md#54-what-is-a-layer) |
| 6 | [5.5 What is a transformation?](background/lecture-0/towards-a-precise-definition-of-the-omg-mda-framework.md#55-what-is-a-transformation) |
| 7 | [6 Conclusion](background/lecture-0/towards-a-precise-definition-of-the-omg-mda-framework.md#6-conclusion) |
| 7 | [7 Acknowledgements](background/lecture-0/towards-a-precise-definition-of-the-omg-mda-framework.md#7-acknowledgements) |
| 8 | [References](background/lecture-0/towards-a-precise-definition-of-the-omg-mda-framework.md#references) |

</details>

### Mellor, Clark & Futagami — Model-Driven Development, guest editors' introduction (2003)

[`background/lecture-0/model-driven-development-guest-editors-introduction.md`](background/lecture-0/model-driven-development-guest-editors-introduction.md) · [PDF](background/lecture-0/model-driven-development-guest-editors-introduction.pdf) · 5 pages

Five-page IEEE Software introduction: what a model is, whether models help or hinder, the acronyms you need, models versus metamodels, mapping functions, and agile MDA.

<details><summary>Sections</summary>

| Page | Section |
|---:|---|
| 1 | [Model-Driven Development](background/lecture-0/model-driven-development-guest-editors-introduction.md#model-driven-development) |
| 2 | [What is a model?](background/lecture-0/model-driven-development-guest-editors-introduction.md#what-is-a-model) |
| 2 | [Help or hindrance?](background/lecture-0/model-driven-development-guest-editors-introduction.md#help-or-hindrance) |
| 3 | [TLAs You Need](background/lecture-0/model-driven-development-guest-editors-introduction.md#tlas-you-need) |
| 3 | [Models and metamodels](background/lecture-0/model-driven-development-guest-editors-introduction.md#models-and-metamodels) |
| 4 | [Mapping functions](background/lecture-0/model-driven-development-guest-editors-introduction.md#mapping-functions) |
| 4 | [Agile MDA](background/lecture-0/model-driven-development-guest-editors-introduction.md#agile-mda) |
| 5 | [About the Authors](background/lecture-0/model-driven-development-guest-editors-introduction.md#about-the-authors) |

</details>

### Bucchiarone et al. — Grand challenges in model-driven engineering (2020)

[`background/lecture-0/grand-challenges-in-model-driven-engineering.md`](background/lecture-0/grand-challenges-in-model-driven-engineering.md) · [PDF](background/lecture-0/grand-challenges-in-model-driven-engineering.pdf) · 9 pages

State-of-research survey from two expert workshops: past challenges, then current technical challenges (foundations, domains, tools) and social and community challenges. Useful for motivating tooling choices and the limits of classic MDE stacks.

<details><summary>Sections</summary>

| Page | Section |
|---:|---|
| 1 | [Grand challenges in model-driven engineering: an analysis of the state of the research](background/lecture-0/grand-challenges-in-model-driven-engineering.md#grand-challenges-in-model-driven-engineering-an-analysis-of-the-state-of-the-research) |
| 1 | [Abstract](background/lecture-0/grand-challenges-in-model-driven-engineering.md#abstract) |
| 1 | [1 Introduction](background/lecture-0/grand-challenges-in-model-driven-engineering.md#1-introduction) |
| 2 | [2 Analysis of past challenges](background/lecture-0/grand-challenges-in-model-driven-engineering.md#2-analysis-of-past-challenges) |
| 2 | [2.1 Pre-2007 challenges](background/lecture-0/grand-challenges-in-model-driven-engineering.md#21-pre-2007-challenges) |
| 2 | [2.2 Challenges from 2007 through present day](background/lecture-0/grand-challenges-in-model-driven-engineering.md#22-challenges-from-2007-through-present-day) |
| 3 | [3 Technical challenges](background/lecture-0/grand-challenges-in-model-driven-engineering.md#3-technical-challenges) |
| 3 | [3.1 Foundation challenges](background/lecture-0/grand-challenges-in-model-driven-engineering.md#31-foundation-challenges) |
| 4 | [3.2 Domain challenges](background/lecture-0/grand-challenges-in-model-driven-engineering.md#32-domain-challenges) |
| 4 | [3.3 Tool and implementation challenges](background/lecture-0/grand-challenges-in-model-driven-engineering.md#33-tool-and-implementation-challenges) |
| 5 | [4 Social and community challenges](background/lecture-0/grand-challenges-in-model-driven-engineering.md#4-social-and-community-challenges) |
| 5 | [4.1 Social aspects](background/lecture-0/grand-challenges-in-model-driven-engineering.md#41-social-aspects) |
| 6 | [4.2 Community aspects](background/lecture-0/grand-challenges-in-model-driven-engineering.md#42-community-aspects) |
| 7 | [5 Discussion](background/lecture-0/grand-challenges-in-model-driven-engineering.md#5-discussion) |
| 7 | [6 Conclusions](background/lecture-0/grand-challenges-in-model-driven-engineering.md#6-conclusions) |
| 7 | [References](background/lecture-0/grand-challenges-in-model-driven-engineering.md#references) |

</details>

### Integrated Formal Methods, IFM 2002 proceedings (LNCS 2335)

[`background/lecture-0/integrated-formal-methods-ifm-2002-proceedings.md`](background/lecture-0/integrated-formal-methods-ifm-2002-proceedings.md) · [PDF](background/lecture-0/integrated-formal-methods-ifm-2002-proceedings.pdf) · 410 pages

410-page conference proceedings. Most papers are formal-methods integration (B, Z, Object-Z, CSP, HOL, statecharts). For this course the relevant parts are Stuart Kent's invited *Model Driven Engineering* paper (p. 296, an early definition of MDE beyond MDA), the Rhapsody model-based development paper, and the UML semantics via graph transformation paper.

<details><summary>Sections</summary>

| Page | Section |
|---:|---|
| 11 | [Rhapsody: A Complete Life-Cycle Model-Based Development System](background/lecture-0/integrated-formal-methods-ifm-2002-proceedings.md#rhapsody) |
| 21 | [An Integrated Semantics for UML Class, Object and State Diagrams Based on Graph Transformation](background/lecture-0/integrated-formal-methods-ifm-2002-proceedings.md#an-integrated-semantics-for-uml-class-object-and-state-diagrams-based-on-graph-transformation) |
| 39 | [Stochastic Process Algebras Meet Eden](background/lecture-0/integrated-formal-methods-ifm-2002-proceedings.md#stochastic-process-algebras-meet-eden) |
| 59 | [From Implicit Specifications to Explicit Designs in Reactive System Development](background/lecture-0/integrated-formal-methods-ifm-2002-proceedings.md#from-implicit-specifications-to-explicit-designs-in-reactive-system-development) |
| 79 | [Basic-REAL: Integrated Approach for Design, Specification and Verification of Distributed Systems](background/lecture-0/integrated-formal-methods-ifm-2002-proceedings.md#basic-real-integrated-approach-for-design-specification-and-verification-of-distributed-systems) |
| 99 | [Assume-Guarantee Algorithms for Automatic Detection of Software Failures](background/lecture-0/integrated-formal-methods-ifm-2002-proceedings.md#assume-guarantee-algorithms-for-automatic-detection-of-software-failures) |
| 119 | [Contributions for Modelling UML State-Charts in B](background/lecture-0/integrated-formal-methods-ifm-2002-proceedings.md#contributions-for-modelling-uml-state-charts-in-b) |
| 138 | [Translating Statecharts to B](background/lecture-0/integrated-formal-methods-ifm-2002-proceedings.md#translating-statecharts-to-b) |
| 155 | [A Framework for Translating Models and Specifications](background/lecture-0/integrated-formal-methods-ifm-2002-proceedings.md#a-framework-for-translating-models-and-specifications) |
| 175 | [Model Checking Object-Z Using ASM](background/lecture-0/integrated-formal-methods-ifm-2002-proceedings.md#model-checking-object-z-using-asm) |
| 195 | [Formalization of Cadence SPW Fixed-Point Arithmetic in HOL](background/lecture-0/integrated-formal-methods-ifm-2002-proceedings.md#formalization-of-cadence-spw-fixed-point-arithmetic-in-hol) |
| 215 | [Formally Linking MDG and HOL Based on a Verified MDG System](background/lecture-0/integrated-formal-methods-ifm-2002-proceedings.md#formally-linking-mdg-and-hol-based-on-a-verified-mdg-system) |
| 235 | [Refinement in Object-Z and CSP](background/lecture-0/integrated-formal-methods-ifm-2002-proceedings.md#refinement-in-object-z-and-csp) |
| 255 | [Combining Specification Techniques for Processes, Data and Time](background/lecture-0/integrated-formal-methods-ifm-2002-proceedings.md#combining-specification-techniques-for-processes-data-and-time) |
| 277 | [An Integration of Real-Time Object-Z and CSP for Specifying Concurrent Real-Time Systems](background/lecture-0/integrated-formal-methods-ifm-2002-proceedings.md#an-integration-of-real-time-object-z-and-csp-for-specifying-concurrent-real-time-systems) |
| 296 | [Model Driven Engineering](background/lecture-0/integrated-formal-methods-ifm-2002-proceedings.md#model-driven-engineering) |
| 309 | [The Design of a Tool-Supported Graphical Notation for Timed CSP](background/lecture-0/integrated-formal-methods-ifm-2002-proceedings.md#the-design-of-a-tool-supported-graphical-notation-for-timed-csp) |
| 329 | [Combining Graphical and Formal Development of Open Distributed Systems](background/lecture-0/integrated-formal-methods-ifm-2002-proceedings.md#combining-graphical-and-formal-development-of-open-distributed-systems) |
| 349 | [Translations between Textual Transition Systems and Petri Nets](background/lecture-0/integrated-formal-methods-ifm-2002-proceedings.md#translations-between-textual-transition-systems-and-petri-nets) |
| 370 | [Specification and Proof of Liveness Properties under Fairness Assumptions in B Event Systems](background/lecture-0/integrated-formal-methods-ifm-2002-proceedings.md#specification-and-proof-of-liveness-properties-under-fairness-assumptions-in-b-event-systems) |
| 390 | [Minimally and Maximally Abstract Retrenchments](background/lecture-0/integrated-formal-methods-ifm-2002-proceedings.md#minimally-and-maximally-abstract-retrenchments) |

</details>

### Mazzara & Meyer (eds.) — Present and Ulterior Software Engineering (2017)

[`background/lecture-0/present-and-ulterior-software-engineering.md`](background/lecture-0/present-and-ulterior-software-engineering.md) · [PDF](background/lecture-0/present-and-ulterior-software-engineering.pdf) · 226 pages

Edited volume of essays. Relevant chapters: the evolution of UML, language interfaces, making visual modelling attractive to developers, *The Changing Face of Model-Driven Engineering* (Paige, Zolotas, Kolovos), and two chapters on microservices.

<details><summary>Sections</summary>

| Page | Section |
|---:|---|
| 8 | [Engineering by Software: System Behaviours as Components](background/lecture-0/present-and-ulterior-software-engineering.md#engineering-by-software-system-behaviours-as-components) |
| 25 | [What Is a Procedure?](background/lecture-0/present-and-ulterior-software-engineering.md#what-is-a-procedure) |
| 42 | [The Evolution and Ecosystem of the Unified Modeling Language](background/lecture-0/present-and-ulterior-software-engineering.md#the-evolution-and-ecosystem-of-the-unified-modeling-language) |
| 51 | [A Theory of Networking and Its Contributions to Software Engineering](background/lecture-0/present-and-ulterior-software-engineering.md#a-theory-of-networking-and-its-contributions-to-software-engineering) |
| 69 | [On Language Interfaces](background/lecture-0/present-and-ulterior-software-engineering.md#on-language-interfaces) |
| 80 | [Moldable Tools for Object-Oriented Development](background/lecture-0/present-and-ulterior-software-engineering.md#moldable-tools-for-object-oriented-development) |
| 105 | [The Changing Face of Model-Driven Engineering](background/lecture-0/present-and-ulterior-software-engineering.md#the-changing-face-of-model-driven-engineering) |
| 121 | [Borealis Bounded Model Checker: The Coming of Age Story](background/lecture-0/present-and-ulterior-software-engineering.md#borealis-bounded-model-checker-the-coming-of-age-story) |
| 140 | [How to Make Visual Modeling More Attractive to Software Developers](background/lecture-0/present-and-ulterior-software-engineering.md#how-to-make-visual-modeling-more-attractive-to-software-developers) |
| 154 | [Intrinsic Redundancy for Reliability and Beyond](background/lecture-0/present-and-ulterior-software-engineering.md#intrinsic-redundancy-for-reliability-and-beyond) |
| 173 | [Sound Simulation and Co-simulation for Robotics](background/lecture-0/present-and-ulterior-software-engineering.md#sound-simulation-and-co-simulation-for-robotics) |
| 195 | [Microservices: Yesterday, Today, and Tomorrow](background/lecture-0/present-and-ulterior-software-engineering.md#microservices-yesterday-today-and-tomorrow) |
| 217 | [Microservices: A Language-Based Approach](background/lecture-0/present-and-ulterior-software-engineering.md#microservices-a-language-based-approach) |

</details>

### Hughes — Models and Representation (1997)

[`background/lecture-1/models-and-representation.md`](background/lecture-1/models-and-representation.md) · [PDF](background/lecture-1/models-and-representation.pdf) · 13 pages

Philosophy-of-science essay proposing the DDI account (denotation, demonstration, interpretation) of how scientific models represent. The source of the philosophy-of-science definitions in lecture 1. The converted text has no section headings; read it whole or search it.

<details><summary>Sections</summary>

| Page | Section |
|---:|---|
| 1 | [Models and Representation](background/lecture-1/models-and-representation.md#models-and-representation) |
| 2 | [R. I. G. Hughes (essay body)](background/lecture-1/models-and-representation.md#r-i-g-hughest) |
| 13 | [REFERENCES](background/lecture-1/models-and-representation.md#references) |

</details>

### Atkinson & Kühne — Model-Driven Development: A Metamodeling Foundation (2003)

[`background/lecture-1/model-driven-development-a-metamodeling-foundation.md`](background/lecture-1/model-driven-development-a-metamodeling-foundation.md) · [PDF](background/lecture-1/model-driven-development-a-metamodeling-foundation.pdf) · 6 pages

Requirements for MDD infrastructure, the weakness of the traditional four-layer architecture, and the distinction between linguistic and ontological metamodelling.

<details><summary>Sections</summary>

| Page | Section |
|---:|---|
| 1 | [Model-Driven Development: A Metamodeling Foundation](background/lecture-1/model-driven-development-a-metamodeling-foundation.md#model-driven-development-a-metamodeling-foundation) |
| 2 | [Requirements for model-driven development](background/lecture-1/model-driven-development-a-metamodeling-foundation.md#requirements-for-model-driven-development) |
| 3 | [Toward an MDD infrastructure](background/lecture-1/model-driven-development-a-metamodeling-foundation.md#toward-an-mdd-infrastructure) |
| 3 | [Traditional MDD infrastructure](background/lecture-1/model-driven-development-a-metamodeling-foundation.md#traditional-mdd-infrastructure) |
| 4 | [Linguistic metamodeling](background/lecture-1/model-driven-development-a-metamodeling-foundation.md#linguistic-metamodeling) |
| 5 | [Ontological metamodeling](background/lecture-1/model-driven-development-a-metamodeling-foundation.md#ontological-metamodeling) |
| 6 | [References](background/lecture-1/model-driven-development-a-metamodeling-foundation.md#references) |
| 6 | [About the Authors](background/lecture-1/model-driven-development-a-metamodeling-foundation.md#about-the-authors) |

</details>

### Bézivin — On the unification power of models (2005)

[`background/lecture-1/on-the-unification-power-of-models.md`](background/lecture-1/on-the-unification-power-of-models.md) · [PDF](background/lecture-1/on-the-unification-power-of-models.pdf) · 18 pages

Argues that *everything is a model* plays the role *everything is an object* played for object technology: the meaning of models, contemplative versus operational models, kinds of models, and a research agenda for MDE.

<details><summary>Sections</summary>

| Page | Section |
|---:|---|
| 1 | [Ontheunificationpowerofmodels](background/lecture-1/on-the-unification-power-of-models.md#ontheunificationpowerofmodels) |
| 1 | [Jean B´ ezivin](background/lecture-1/on-the-unification-power-of-models.md#jean-b-ezivin) |
| 1 | [1 Introduction](background/lecture-1/on-the-unification-power-of-models.md#1-introduction) |
| 3 | [2 The lessons of object technology](background/lecture-1/on-the-unification-power-of-models.md#2-the-lessons-of-object-technology) |
| 3 | [2.1 Towards unification](background/lecture-1/on-the-unification-power-of-models.md#21-towards-unification) |
| 4 | [2.2 Incomplete achievements](background/lecture-1/on-the-unification-power-of-models.md#22-incomplete-achievements) |
| 4 | [3 MDE:concepts and goals](background/lecture-1/on-the-unification-power-of-models.md#3-mdeconcepts-and-goals) |
| 4 | [3.1 On the meaning of models](background/lecture-1/on-the-unification-power-of-models.md#31-on-the-meaning-of-models) |
| 7 | [3.2 From contemplative to operational models](background/lecture-1/on-the-unification-power-of-models.md#32-from-contemplative-to-operational-models) |
| 9 | [4 On various kinds of models](background/lecture-1/on-the-unification-power-of-models.md#4-on-various-kinds-of-models) |
| 12 | [5 Aproposed research agenda](background/lecture-1/on-the-unification-power-of-models.md#5-aproposed-research-agenda) |
| 12 | [5.1 Applying the unification principle](background/lecture-1/on-the-unification-power-of-models.md#51-applying-the-unification-principle) |
| 14 | [5.2 Some open research issues in MDE](background/lecture-1/on-the-unification-power-of-models.md#52-some-open-research-issues-in-mde) |
| 16 | [5.3 Applications, consequences and perspectives](background/lecture-1/on-the-unification-power-of-models.md#53-applications-consequences-and-perspectives) |
| 16 | [6 Conclusions](background/lecture-1/on-the-unification-power-of-models.md#6-conclusions) |
| 17 | [References](background/lecture-1/on-the-unification-power-of-models.md#references) |

</details>

### Kühne — Matters of (meta-)modeling (2006)

[`background/lecture-1/matters-of-metamodeling.md`](background/lecture-1/matters-of-metamodeling.md) · [PDF](background/lecture-1/matters-of-metamodeling.pdf) · 17 pages

Careful definitions: what a model is (and is not — a copy), token versus type model roles, classification versus generalisation, what a metamodel is, instantiation flavours, and whether metamodels are language definitions.

<details><summary>Sections</summary>

| Page | Section |
|---:|---|
| 1 | [Matters of (meta-) modeling](background/lecture-1/matters-of-metamodeling.md#matters-of-meta--modeling) |
| 1 | [1 Introduction](background/lecture-1/matters-of-metamodeling.md#1-introduction) |
| 2 | [2 What is a model?](background/lecture-1/matters-of-metamodeling.md#2-what-is-a-model) |
| 3 | [2.1 Model features](background/lecture-1/matters-of-metamodeling.md#21-model-features) |
| 4 | [2.2 Motivation for modeling](background/lecture-1/matters-of-metamodeling.md#22-motivation-for-modeling) |
| 4 | [(a) a theoretical projection of a possible or imaginary system.](background/lecture-1/matters-of-metamodeling.md#a-a-theoretical-projection-of-a-possible-or-imaginary-system) |
| 4 | [2.3 Are transformations models?](background/lecture-1/matters-of-metamodeling.md#23-are-transformations-models) |
| 4 | [2.4 A copy is not a model](background/lecture-1/matters-of-metamodeling.md#24-a-copy-is-not-a-model) |
| 4 | [(b) a small but exact copy of something](background/lecture-1/matters-of-metamodeling.md#b-a-small-but-exact-copy-of-something) |
| 5 | [3 Kinds of model roles](background/lecture-1/matters-of-metamodeling.md#3-kinds-of-model-roles) |
| 5 | [3.1 Token models](background/lecture-1/matters-of-metamodeling.md#31-token-models) |
| 6 | [3.2 Type models](background/lecture-1/matters-of-metamodeling.md#32-type-models) |
| 7 | [3.3 Why roles?](background/lecture-1/matters-of-metamodeling.md#33-why-roles) |
| 7 | [3.4 Classification versus generalization](background/lecture-1/matters-of-metamodeling.md#34-classification-versus-generalization) |
| 9 | [4 What is a metamodel?](background/lecture-1/matters-of-metamodeling.md#4-what-is-a-metamodel) |
| 10 | [level - respecting ∀ n , m :](background/lecture-1/matters-of-metamodeling.md#level---respecting--n--m) |
| 10 | [4.1 Flavors of model and element instantiation](background/lecture-1/matters-of-metamodeling.md#41-flavors-of-model-and-element-instantiation) |
| 12 | [4.2 Is the UML metamodel a metamodel?](background/lecture-1/matters-of-metamodeling.md#42-is-the-uml-metamodel-a-metamodel) |
| 13 | [5 Are metamodels language definitions?](background/lecture-1/matters-of-metamodeling.md#5-are-metamodels-language-definitions) |
| 14 | [6 Related work](background/lecture-1/matters-of-metamodeling.md#6-related-work) |
| 16 | [7 Conclusion](background/lecture-1/matters-of-metamodeling.md#7-conclusion) |
| 16 | [References](background/lecture-1/matters-of-metamodeling.md#references) |

</details>

### Paige, Kolovos & Polack — A tutorial on metamodelling for grammar researchers (2014)

[`background/lecture-1/a-tutorial-on-metamodelling-for-grammar-researchers.md`](background/lecture-1/a-tutorial-on-metamodelling-for-grammar-researchers.md) · [PDF](background/lecture-1/a-tutorial-on-metamodelling-for-grammar-researchers.pdf) · 21 pages

Metamodelling explained against grammars: example metamodels for Eiffel and ER diagrams, an OCL well-formedness rule, standard technologies, the metamodelling process, modelware versus grammarware, mapping metamodels to grammars, and three worked DSL examples. The most directly practical metamodelling text in the set.

<details><summary>Sections</summary>

| Page | Section |
|---:|---|
| 1 | [A tutorial on metamodelling for grammar researchers](background/lecture-1/a-tutorial-on-metamodelling-for-grammar-researchers.md#a-tutorial-on-metamodelling-for-grammar-researchers) |
| 1 | [1. Introduction](background/lecture-1/a-tutorial-on-metamodelling-for-grammar-researchers.md#1-introduction) |
| 2 | [2. Definitions and examples](background/lecture-1/a-tutorial-on-metamodelling-for-grammar-researchers.md#2-definitions-and-examples) |
| 3 | [2.1. Example 1: a metamodel for Eiffel (a textual language)](background/lecture-1/a-tutorial-on-metamodelling-for-grammar-researchers.md#21-example-1-a-metamodel-for-eiffel-a-textual-language) |
| 4 | [2.2. Example 2: metamodel for ER diagrams (a visual language)](background/lecture-1/a-tutorial-on-metamodelling-for-grammar-researchers.md#22-example-2-metamodel-for-er-diagrams-a-visual-language) |
| 5 | [Listing 3: OCL well-formedness rule.](background/lecture-1/a-tutorial-on-metamodelling-for-grammar-researchers.md#listing-3-ocl-well-formedness-rule) |
| 5 | [2.3. Mathematical definitions](background/lecture-1/a-tutorial-on-metamodelling-for-grammar-researchers.md#23-mathematical-definitions) |
| 5 | [2.4. Standard technologies for implementing metamodels](background/lecture-1/a-tutorial-on-metamodelling-for-grammar-researchers.md#24-standard-technologies-for-implementing-metamodels) |
| 6 | [2.5. Summary](background/lecture-1/a-tutorial-on-metamodelling-for-grammar-researchers.md#25-summary) |
| 6 | [3. Why metamodel?](background/lecture-1/a-tutorial-on-metamodelling-for-grammar-researchers.md#3-why-metamodel) |
| 7 | [3.1. Metamodelling process](background/lecture-1/a-tutorial-on-metamodelling-for-grammar-researchers.md#31-metamodelling-process) |
| 7 | [4. Modelware versus grammarware](background/lecture-1/a-tutorial-on-metamodelling-for-grammar-researchers.md#4-modelware-versus-grammarware) |
| 8 | [4.1. Terminology comparison](background/lecture-1/a-tutorial-on-metamodelling-for-grammar-researchers.md#41-terminology-comparison) |
| 8 | [4.2. Conceptual comparison](background/lecture-1/a-tutorial-on-metamodelling-for-grammar-researchers.md#42-conceptual-comparison) |
| 9 | [4.3. Strengths and weaknesses](background/lecture-1/a-tutorial-on-metamodelling-for-grammar-researchers.md#43-strengths-and-weaknesses) |
| 10 | [4.4. Mapping metamodels to grammars](background/lecture-1/a-tutorial-on-metamodelling-for-grammar-researchers.md#44-mapping-metamodels-to-grammars) |
| 11 | [5. Examples](background/lecture-1/a-tutorial-on-metamodelling-for-grammar-researchers.md#5-examples) |
| 11 | [5.1. Conference language](background/lecture-1/a-tutorial-on-metamodelling-for-grammar-researchers.md#51-conference-language) |
| 14 | [CONFERENCE "TED"](background/lecture-1/a-tutorial-on-metamodelling-for-grammar-researchers.md#conference-ted) |
| 14 | [5.2. Proposal language](background/lecture-1/a-tutorial-on-metamodelling-for-grammar-researchers.md#52-proposal-language) |
| 16 | [5.3. Complex systems example](background/lecture-1/a-tutorial-on-metamodelling-for-grammar-researchers.md#53-complex-systems-example) |
| 17 | [5.3.1. The domain model](background/lecture-1/a-tutorial-on-metamodelling-for-grammar-researchers.md#531-the-domain-model) |
| 17 | [5.3.2. Creating and using the metamodel](background/lecture-1/a-tutorial-on-metamodelling-for-grammar-researchers.md#532-creating-and-using-the-metamodel) |
| 18 | [5.3.3. Creation of a unified DSL metamodel](background/lecture-1/a-tutorial-on-metamodelling-for-grammar-researchers.md#533-creation-of-a-unified-dsl-metamodel) |
| 20 | [6. Conclusions](background/lecture-1/a-tutorial-on-metamodelling-for-grammar-researchers.md#6-conclusions) |
| 20 | [References](background/lecture-1/a-tutorial-on-metamodelling-for-grammar-researchers.md#references) |

</details>

### OMG Object Constraint Language 2.4 specification (2014)

[`background/lecture-2/object-constraint-language-2.4-specification.md`](background/lecture-2/object-constraint-language-2.4-specification.md) · [PDF](background/lecture-2/object-constraint-language-2.4-specification.pdf) · 262 pages

The normative OCL standard: language description (values, types, objects, collections, messages), abstract syntax, concrete syntax, UML-based semantics, the standard library with every operation's well-formedness rules, placements of OCL in UML models, and Basic/Essential OCL for metamodelling.

<details><summary>Sections</summary>

| Page | Section |
|---:|---|
| 17 | [1 Scope](background/lecture-2/object-constraint-language-2.4-specification.md#1-scope) |
| 17 | [2 Conformance](background/lecture-2/object-constraint-language-2.4-specification.md#2-conformance) |
| 18 | [3 Normative References](background/lecture-2/object-constraint-language-2.4-specification.md#3-normative-references) |
| 18 | [3.1 Normative References](background/lecture-2/object-constraint-language-2.4-specification.md#31-normative-references) |
| 18 | [3.2 Informative References](background/lecture-2/object-constraint-language-2.4-specification.md#32-informative-references) |
| 18 | [4 Terms and Definitions](background/lecture-2/object-constraint-language-2.4-specification.md#4-terms-and-definitions) |
| 18 | [5 Symbols](background/lecture-2/object-constraint-language-2.4-specification.md#5-symbols) |
| 18 | [6 Additional Information](background/lecture-2/object-constraint-language-2.4-specification.md#6-additional-information) |
| 18 | [6.1 Changes to Adopted OMG Specifications](background/lecture-2/object-constraint-language-2.4-specification.md#61-changes-to-adopted-omg-specifications) |
| 19 | [6.2 Structure of the Specification](background/lecture-2/object-constraint-language-2.4-specification.md#62-structure-of-the-specification) |
| 19 | [6.3 Acknowledgements](background/lecture-2/object-constraint-language-2.4-specification.md#63-acknowledgements) |
| 21 | [7 OCL Language Description](background/lecture-2/object-constraint-language-2.4-specification.md#7-ocl-language-description) |
| 21 | [7.1 Why OCL?](background/lecture-2/object-constraint-language-2.4-specification.md#71-why-ocl) |
| 22 | [7.2 Introduction](background/lecture-2/object-constraint-language-2.4-specification.md#72-introduction) |
| 23 | [7.3 Relation to the UML Metamodel](background/lecture-2/object-constraint-language-2.4-specification.md#73-relation-to-the-uml-metamodel) |
| 26 | [7.4 Basic Values and Types](background/lecture-2/object-constraint-language-2.4-specification.md#74-basic-values-and-types) |
| 33 | [7.5 Objects and Properties](background/lecture-2/object-constraint-language-2.4-specification.md#75-objects-and-properties) |
| 44 | [7.6 Collection Operations](background/lecture-2/object-constraint-language-2.4-specification.md#76-collection-operations) |
| 48 | [7.7 Messages in OCL](background/lecture-2/object-constraint-language-2.4-specification.md#77-messages-in-ocl) |
| 51 | [7.8 Resolving Properties](background/lecture-2/object-constraint-language-2.4-specification.md#78-resolving-properties) |
| 53 | [8 Abstract Syntax](background/lecture-2/object-constraint-language-2.4-specification.md#8-abstract-syntax) |
| 53 | [8.1 Introduction](background/lecture-2/object-constraint-language-2.4-specification.md#81-introduction) |
| 53 | [8.2 The Types Package](background/lecture-2/object-constraint-language-2.4-specification.md#82-the-types-package) |
| 60 | [8.3 The Expressions Package](background/lecture-2/object-constraint-language-2.4-specification.md#83-the-expressions-package) |
| 85 | [9 Concrete Syntax](background/lecture-2/object-constraint-language-2.4-specification.md#9-concrete-syntax) |
| 85 | [9.1 Structure of the Concrete Syntax](background/lecture-2/object-constraint-language-2.4-specification.md#91-structure-of-the-concrete-syntax) |
| 87 | [9.2 A Note to Tool Builders](background/lecture-2/object-constraint-language-2.4-specification.md#92-a-note-to-tool-builders) |
| 87 | [9.3 Concrete Syntax](background/lecture-2/object-constraint-language-2.4-specification.md#93-concrete-syntax) |
| 121 | [9.4 Environment Definition](background/lecture-2/object-constraint-language-2.4-specification.md#94-environment-definition) |
| 124 | [9.5 Concrete to Abstract Syntax Mapping](background/lecture-2/object-constraint-language-2.4-specification.md#95-concrete-to-abstract-syntax-mapping) |
| 124 | [9.6 Abstract Syntax to Concrete Syntax Mapping](background/lecture-2/object-constraint-language-2.4-specification.md#96-abstract-syntax-to-concrete-syntax-mapping) |
| 125 | [10 Semantics Described Using UML](background/lecture-2/object-constraint-language-2.4-specification.md#10-semantics-described-using-uml) |
| 125 | [10.1 Introduction](background/lecture-2/object-constraint-language-2.4-specification.md#101-introduction) |
| 126 | [10.2 The Values Package](background/lecture-2/object-constraint-language-2.4-specification.md#102-the-values-package) |
| 135 | [10.3 The Evaluations Package](background/lecture-2/object-constraint-language-2.4-specification.md#103-the-evaluations-package) |
| 155 | [10.4 The AS-Domain-Mapping Package](background/lecture-2/object-constraint-language-2.4-specification.md#104-the-as-domain-mapping-package) |
| 167 | [11 OCL Standard Library](background/lecture-2/object-constraint-language-2.4-specification.md#11-ocl-standard-library) |
| 167 | [11.1 Introduction](background/lecture-2/object-constraint-language-2.4-specification.md#111-introduction) |
| 168 | [11.2 The OclAny, OclVoid, OclInvalid, and OclMessage Types](background/lecture-2/object-constraint-language-2.4-specification.md#112-the-oclany-oclvoid-oclinvalid-and-oclmessage-types) |
| 169 | [11.3 Operations and Well-formedness Rules](background/lecture-2/object-constraint-language-2.4-specification.md#113-operations-and-well-formedness-rules) |
| 172 | [11.4 Primitive Types](background/lecture-2/object-constraint-language-2.4-specification.md#114-primitive-types) |
| 173 | [11.5 Operations and Well-formedness Rules](background/lecture-2/object-constraint-language-2.4-specification.md#115-operations-and-well-formedness-rules) |
| 180 | [11.6 Collection-Related Types](background/lecture-2/object-constraint-language-2.4-specification.md#116-collection-related-types) |
| 181 | [11.7 Operations and Well-formedness Rules](background/lecture-2/object-constraint-language-2.4-specification.md#117-operations-and-well-formedness-rules) |
| 193 | [11.8 Predefined Iterator Expressions](background/lecture-2/object-constraint-language-2.4-specification.md#118-predefined-iterator-expressions) |
| 193 | [11.9 Mapping Rules for Predefined Iterator Expressions](background/lecture-2/object-constraint-language-2.4-specification.md#119-mapping-rules-for-predefined-iterator-expressions) |
| 201 | [12 The Use of OCL Expressions in UML Models](background/lecture-2/object-constraint-language-2.4-specification.md#12-the-use-of-ocl-expressions-in-uml-models) |
| 201 | [12.1 Introduction](background/lecture-2/object-constraint-language-2.4-specification.md#121-introduction) |
| 201 | [12.2 The ExpressionInOcl Type](background/lecture-2/object-constraint-language-2.4-specification.md#122-the-expressioninocl-type) |
| 202 | [12.3 Well-formedness Rules](background/lecture-2/object-constraint-language-2.4-specification.md#123-well-formedness-rules) |
| 203 | [12.4 Standard Placements of OCL Expressions](background/lecture-2/object-constraint-language-2.4-specification.md#124-standard-placements-of-ocl-expressions) |
| 203 | [12.5 Definition](background/lecture-2/object-constraint-language-2.4-specification.md#125-definition) |
| 204 | [12.6 Invariant](background/lecture-2/object-constraint-language-2.4-specification.md#126-invariant) |
| 204 | [12.7 Precondition](background/lecture-2/object-constraint-language-2.4-specification.md#127-precondition) |
| 206 | [12.8 Initial Value Expression](background/lecture-2/object-constraint-language-2.4-specification.md#128-initial-value-expression) |
| 207 | [12.9 Derived Value Expression](background/lecture-2/object-constraint-language-2.4-specification.md#129-derived-value-expression) |
| 208 | [12.10 Operation Body Expression](background/lecture-2/object-constraint-language-2.4-specification.md#1210-operation-body-expression) |
| 208 | [12.11 Guard](background/lecture-2/object-constraint-language-2.4-specification.md#1211-guard) |
| 209 | [12.12 Concrete Syntax of Context Declarations](background/lecture-2/object-constraint-language-2.4-specification.md#1212-concrete-syntax-of-context-declarations) |
| 213 | [13 The Basic OCL and Essential OCL](background/lecture-2/object-constraint-language-2.4-specification.md#13-the-basic-ocl-and-essential-ocl) |
| 213 | [13.1 Introduction](background/lecture-2/object-constraint-language-2.4-specification.md#131-introduction) |
| 213 | [13.2 OCL Adaptation for Metamodeling](background/lecture-2/object-constraint-language-2.4-specification.md#132-ocl-adaptation-for-metamodeling) |
| 214 | [13.3 Diagrams](background/lecture-2/object-constraint-language-2.4-specification.md#133-diagrams) |

</details>

### Eclipse OCL 6.6 documentation (2018)

[`background/lecture-2/eclipse-ocl-6.6-documentation.md`](background/lecture-2/eclipse-ocl-6.6-documentation.md) · [PDF](background/lecture-2/eclipse-ocl-6.6-documentation.pdf) · 223 pages

The tool manual: Essential OCL, OCLinEcore, Complete OCL and the standard library as implemented, editors, validation, console and debugger, OCL with Papyrus/UML, tutorials (OCLinEcore, Complete OCL, code generation, validation), and the Java API.

<details><summary>Sections</summary>

| Page | Section |
|---:|---|
| 8 | [Chapter 1. Overview and Getting Started](background/lecture-2/eclipse-ocl-6.6-documentation.md#chapter-1-overview-and-getting-started) |
| 8 | [1.1. What is OCL?](background/lecture-2/eclipse-ocl-6.6-documentation.md#11-what-is-ocl) |
| 8 | [1.2. How Does It Work?](background/lecture-2/eclipse-ocl-6.6-documentation.md#12-how-does-it-work) |
| 9 | [1.3. Eclipse OCL is Extensible](background/lecture-2/eclipse-ocl-6.6-documentation.md#13-eclipse-ocl-is-extensible) |
| 9 | [1.4. Who Uses OCL and Eclipse OCL?](background/lecture-2/eclipse-ocl-6.6-documentation.md#14-who-uses-ocl-and-eclipse-ocl) |
| 10 | [1.5. Who is Behind Eclipse OCL?](background/lecture-2/eclipse-ocl-6.6-documentation.md#15-who-is-behind-eclipse-ocl) |
| 10 | [1.6. Getting Started](background/lecture-2/eclipse-ocl-6.6-documentation.md#16-getting-started) |
| 12 | [Chapter 2. Users Guide](background/lecture-2/eclipse-ocl-6.6-documentation.md#chapter-2-users-guide) |
| 12 | [2.1. The two Eclipse OCLs](background/lecture-2/eclipse-ocl-6.6-documentation.md#21-the-two-eclipse-ocls) |
| 16 | [2.2. The Essential OCL Language](background/lecture-2/eclipse-ocl-6.6-documentation.md#22-the-essential-ocl-language) |
| 26 | [2.3. The OCLinEcore Language](background/lecture-2/eclipse-ocl-6.6-documentation.md#23-the-oclinecore-language) |
| 38 | [2.4. The Complete OCL Language](background/lecture-2/eclipse-ocl-6.6-documentation.md#24-the-complete-ocl-language) |
| 44 | [2.5. The OCL Standard Library Language](background/lecture-2/eclipse-ocl-6.6-documentation.md#25-the-ocl-standard-library-language) |
| 48 | [2.6. Editors](background/lecture-2/eclipse-ocl-6.6-documentation.md#26-editors) |
| 50 | [2.7. OCL Nature and Builder Auto-Validation](background/lecture-2/eclipse-ocl-6.6-documentation.md#27-ocl-nature-and-builder-auto-validation) |
| 51 | [2.8. Console](background/lecture-2/eclipse-ocl-6.6-documentation.md#28-console) |
| 53 | [2.9. Validity View (new in Luna)](background/lecture-2/eclipse-ocl-6.6-documentation.md#29-validity-view-new-in-luna) |
| 58 | [2.10. Debugger (new in Luna)](background/lecture-2/eclipse-ocl-6.6-documentation.md#210-debugger-new-in-luna) |
| 61 | [2.11. OCL Integration](background/lecture-2/eclipse-ocl-6.6-documentation.md#211-ocl-integration) |
| 63 | [2.12. OCL in UML (using Papyrus)](background/lecture-2/eclipse-ocl-6.6-documentation.md#212-ocl-in-uml-using-papyrus) |
| 69 | [2.13. OCL Constraint Examples for UML (using Papyrus)](background/lecture-2/eclipse-ocl-6.6-documentation.md#213-ocl-constraint-examples-for-uml-using-papyrus) |
| 77 | [2.14. User Interface](background/lecture-2/eclipse-ocl-6.6-documentation.md#214-user-interface) |
| 82 | [Chapter 3. The OCL Standard Library](background/lecture-2/eclipse-ocl-6.6-documentation.md#chapter-3-the-ocl-standard-library) |
| 82 | [3.1.  Precedences](background/lecture-2/eclipse-ocl-6.6-documentation.md#31--precedences) |
| 82 | [3.2. Bag(T)](background/lecture-2/eclipse-ocl-6.6-documentation.md#32-bagt) |
| 83 | [3.3. Boolean](background/lecture-2/eclipse-ocl-6.6-documentation.md#33-boolean) |
| 85 | [3.4. Class](background/lecture-2/eclipse-ocl-6.6-documentation.md#34-class) |
| 85 | [3.5. Collection(T)](background/lecture-2/eclipse-ocl-6.6-documentation.md#35-collectiont) |
| 88 | [3.6. Enumeration](background/lecture-2/eclipse-ocl-6.6-documentation.md#36-enumeration) |
| 88 | [3.7. EnumerationLiteral](background/lecture-2/eclipse-ocl-6.6-documentation.md#37-enumerationliteral) |
| 88 | [3.8. Integer](background/lecture-2/eclipse-ocl-6.6-documentation.md#38-integer) |
| 89 | [3.9. Map(K, V)](background/lecture-2/eclipse-ocl-6.6-documentation.md#39-mapk-v) |
| 90 | [3.10. OclAny](background/lecture-2/eclipse-ocl-6.6-documentation.md#310-oclany) |
| 91 | [3.11. OclComparable](background/lecture-2/eclipse-ocl-6.6-documentation.md#311-oclcomparable) |
| 92 | [3.12. OclElement](background/lecture-2/eclipse-ocl-6.6-documentation.md#312-oclelement) |
| 93 | [3.13. OclEnumeration](background/lecture-2/eclipse-ocl-6.6-documentation.md#313-oclenumeration) |
| 93 | [3.14. OclInvalid](background/lecture-2/eclipse-ocl-6.6-documentation.md#314-oclinvalid) |
| 94 | [3.15. OclLambda](background/lecture-2/eclipse-ocl-6.6-documentation.md#315-ocllambda) |
| 94 | [3.16. OclMessage](background/lecture-2/eclipse-ocl-6.6-documentation.md#316-oclmessage) |
| 94 | [3.17. OclSelf](background/lecture-2/eclipse-ocl-6.6-documentation.md#317-oclself) |
| 94 | [3.18. OclState](background/lecture-2/eclipse-ocl-6.6-documentation.md#318-oclstate) |
| 94 | [3.19. OclStereotype](background/lecture-2/eclipse-ocl-6.6-documentation.md#319-oclstereotype) |
| 95 | [3.20. OclSummable](background/lecture-2/eclipse-ocl-6.6-documentation.md#320-oclsummable) |
| 95 | [3.21. OclTuple](background/lecture-2/eclipse-ocl-6.6-documentation.md#321-ocltuple) |
| 95 | [3.22. OclType](background/lecture-2/eclipse-ocl-6.6-documentation.md#322-ocltype) |
| 95 | [3.23. OclVoid](background/lecture-2/eclipse-ocl-6.6-documentation.md#323-oclvoid) |
| 96 | [3.24. OrderedCollection(T)](background/lecture-2/eclipse-ocl-6.6-documentation.md#324-orderedcollectiont) |
| 96 | [3.25. OrderedSet(T)](background/lecture-2/eclipse-ocl-6.6-documentation.md#325-orderedsett) |
| 97 | [3.26. Real](background/lecture-2/eclipse-ocl-6.6-documentation.md#326-real) |
| 99 | [3.28. Set(T)](background/lecture-2/eclipse-ocl-6.6-documentation.md#328-sett) |
| 100 | [3.29. State](background/lecture-2/eclipse-ocl-6.6-documentation.md#329-state) |
| 100 | [3.30. String](background/lecture-2/eclipse-ocl-6.6-documentation.md#330-string) |
| 102 | [3.31. Type](background/lecture-2/eclipse-ocl-6.6-documentation.md#331-type) |
| 102 | [3.32. UniqueCollection(T)](background/lecture-2/eclipse-ocl-6.6-documentation.md#332-uniquecollectiont) |
| 103 | [3.33. UnlimitedNatural](background/lecture-2/eclipse-ocl-6.6-documentation.md#333-unlimitednatural) |
| 104 | [Chapter 4. Tutorials](background/lecture-2/eclipse-ocl-6.6-documentation.md#chapter-4-tutorials) |
| 104 | [4.1. OCLinEcore tutorial](background/lecture-2/eclipse-ocl-6.6-documentation.md#41-oclinecore-tutorial) |
| 121 | [4.2. Complete OCL tutorial](background/lecture-2/eclipse-ocl-6.6-documentation.md#42-complete-ocl-tutorial) |
| 132 | [4.3. Safe navigation tutorial](background/lecture-2/eclipse-ocl-6.6-documentation.md#43-safe-navigation-tutorial) |
| 136 | [4.4. Code Generation tutorial](background/lecture-2/eclipse-ocl-6.6-documentation.md#44-code-generation-tutorial) |
| 137 | [4.5. Debugger tutorial](background/lecture-2/eclipse-ocl-6.6-documentation.md#45-debugger-tutorial) |
| 146 | [4.6. Validation tutorial](background/lecture-2/eclipse-ocl-6.6-documentation.md#46-validation-tutorial) |
| 150 | [4.7. Working with Classic OCL](background/lecture-2/eclipse-ocl-6.6-documentation.md#47-working-with-classic-ocl) |
| 156 | [4.8. Extensions (in the Unified/Pivot OCL prototype)](background/lecture-2/eclipse-ocl-6.6-documentation.md#48-extensions-in-the-unifiedpivot-ocl-prototype) |
| 158 | [4.9. Installing the Eclipse OCL Examples and Editors](background/lecture-2/eclipse-ocl-6.6-documentation.md#49-installing-the-eclipse-ocl-examples-and-editors) |
| 161 | [Chapter 5. Examples](background/lecture-2/eclipse-ocl-6.6-documentation.md#chapter-5-examples) |
| 161 | [5.1. Royal and Loyal Example Project](background/lecture-2/eclipse-ocl-6.6-documentation.md#51-royal-and-loyal-example-project) |
| 161 | [5.2. Empty Example Project](background/lecture-2/eclipse-ocl-6.6-documentation.md#52-empty-example-project) |
| 161 | [5.3. OCLinEcore Tutorial Example Project](background/lecture-2/eclipse-ocl-6.6-documentation.md#53-oclinecore-tutorial-example-project) |
| 161 | [5.4. Complete OCL Tutorial Example Project](background/lecture-2/eclipse-ocl-6.6-documentation.md#54-complete-ocl-tutorial-example-project) |
| 161 | [5.5. OCL Interpreter Example](background/lecture-2/eclipse-ocl-6.6-documentation.md#55-ocl-interpreter-example) |
| 165 | [Chapter 6. Classic Ecore/UML Programmers Guide](background/lecture-2/eclipse-ocl-6.6-documentation.md#chapter-6-classic-ecoreuml-programmers-guide) |
| 166 | [6.1. Parsing Constraints and Queries](background/lecture-2/eclipse-ocl-6.6-documentation.md#61-parsing-constraints-and-queries) |
| 170 | [6.2. Evaluating Constraints and Queries](background/lecture-2/eclipse-ocl-6.6-documentation.md#62-evaluating-constraints-and-queries) |
| 172 | [6.3. Parsing OCL Documents](background/lecture-2/eclipse-ocl-6.6-documentation.md#63-parsing-ocl-documents) |
| 174 | [6.4. OCL Relationship to Metamodels](background/lecture-2/eclipse-ocl-6.6-documentation.md#64-ocl-relationship-to-metamodels) |
| 178 | [6.5. Content Assist Support](background/lecture-2/eclipse-ocl-6.6-documentation.md#65-content-assist-support) |
| 179 | [6.6. OCL Abstract Syntax Model](background/lecture-2/eclipse-ocl-6.6-documentation.md#66-ocl-abstract-syntax-model) |
| 182 | [6.7. Customizing the Environment](background/lecture-2/eclipse-ocl-6.6-documentation.md#67-customizing-the-environment) |
| 188 | [6.8. OCL Persistence](background/lecture-2/eclipse-ocl-6.6-documentation.md#68-ocl-persistence) |
| 190 | [6.9. Creating Metamodel Bindings](background/lecture-2/eclipse-ocl-6.6-documentation.md#69-creating-metamodel-bindings) |
| 192 | [6.10. Incrementally Re-Evaluating OCL Expressions Using the Impact Analyzer](background/lecture-2/eclipse-ocl-6.6-documentation.md#610-incrementally-re-evaluating-ocl-expressions-using-the-impact-analyzer) |
| 195 | [6.11. Delegates](background/lecture-2/eclipse-ocl-6.6-documentation.md#611-delegates) |
| 198 | [6.12. Ecore/UML Standalone Configuration](background/lecture-2/eclipse-ocl-6.6-documentation.md#612-ecoreuml-standalone-configuration) |
| 200 | [Chapter 7. Unified or Pivot Programmers Guide](background/lecture-2/eclipse-ocl-6.6-documentation.md#chapter-7-unified-or-pivot-programmers-guide) |
| 201 | [7.1. Validators](background/lecture-2/eclipse-ocl-6.6-documentation.md#71-validators) |
| 201 | [7.2. The Pivot Evaluator](background/lecture-2/eclipse-ocl-6.6-documentation.md#72-the-pivot-evaluator) |
| 204 | [7.3. Pivot Standalone Configuration](background/lecture-2/eclipse-ocl-6.6-documentation.md#73-pivot-standalone-configuration) |
| 206 | [7.4. Pivot Thread Safety](background/lecture-2/eclipse-ocl-6.6-documentation.md#74-pivot-thread-safety) |
| 207 | [7.5. Parsing Constraints and Queries](background/lecture-2/eclipse-ocl-6.6-documentation.md#75-parsing-constraints-and-queries) |
| 210 | [7.6. Evaluating Constraints and Queries](background/lecture-2/eclipse-ocl-6.6-documentation.md#76-evaluating-constraints-and-queries) |
| 213 | [7.7. Parsing OCL Documents](background/lecture-2/eclipse-ocl-6.6-documentation.md#77-parsing-ocl-documents) |
| 215 | [7.8. OCL Relationship to Metamodels](background/lecture-2/eclipse-ocl-6.6-documentation.md#78-ocl-relationship-to-metamodels) |
| 217 | [7.9. Ids](background/lecture-2/eclipse-ocl-6.6-documentation.md#79-ids) |
| 219 | [Chapter 8. API Reference](background/lecture-2/eclipse-ocl-6.6-documentation.md#chapter-8-api-reference) |
| 219 | [8.1. Javadoc](background/lecture-2/eclipse-ocl-6.6-documentation.md#81-javadoc) |
| 219 | [8.2. Extension points](background/lecture-2/eclipse-ocl-6.6-documentation.md#82-extension-points) |
| 220 | [Chapter 9. Building the OCL Project](background/lecture-2/eclipse-ocl-6.6-documentation.md#chapter-9-building-the-ocl-project) |
| 220 | [9.1. GenModel GenAnnotations](background/lecture-2/eclipse-ocl-6.6-documentation.md#91-genmodel-genannotations) |

</details>

### Mernik, Heering & Sloane — When and How to Develop Domain-Specific Languages (2005)

[`background/lecture-3/when-and-how-to-develop-domain-specific-languages.md`](background/lecture-3/when-and-how-to-develop-domain-specific-languages.md) · [PDF](background/lecture-3/when-and-how-to-develop-domain-specific-languages.pdf) · 29 pages

The survey behind lecture 3's "when is a DSL worth it" argument. It collects patterns for each phase of DSL development — **decision** (the reasons a DSL gets built at all, from notation to task automation), **analysis** (informal or formal domain analysis), **design** (language exploitation versus invention, informal versus formal specification) and **implementation** (interpreter, compiler/application generator, preprocessor, embedding, extensible compiler, COTS) — and closes with the tooling that supports each and the open problems. The implementation section is the one to read before choosing between interpreting a model and compiling it.

<details><summary>Sections</summary>

| Page | Section |
|---:|---|
| 2 | [1. INTRODUCTION](background/lecture-3/when-and-how-to-develop-domain-specific-languages.md#1-introduction) |
| 2 | [1.1. General](background/lecture-3/when-and-how-to-develop-domain-specific-languages.md#11-general) |
| 3 | [1.2. Executability of DSLs](background/lecture-3/when-and-how-to-develop-domain-specific-languages.md#12-executability-of-dsls) |
| 3 | [1.3. DSLs as Enablers of Reuse](background/lecture-3/when-and-how-to-develop-domain-specific-languages.md#13-dsls-as-enablers-of-reuse) |
| 3 | [1.4. Scope of This Article](background/lecture-3/when-and-how-to-develop-domain-specific-languages.md#14-scope-of-this-article) |
| 3 | [1.5. Literature](background/lecture-3/when-and-how-to-develop-domain-specific-languages.md#15-literature) |
| 5 | [2. DSL PATTERNS](background/lecture-3/when-and-how-to-develop-domain-specific-languages.md#2-dsl-patterns) |
| 5 | [2.1. Pattern classification](background/lecture-3/when-and-how-to-develop-domain-specific-languages.md#21-pattern-classification) |
| 5 | [2.2. Decision](background/lecture-3/when-and-how-to-develop-domain-specific-languages.md#22-decision) |
| 5 | [2.3. Analysis](background/lecture-3/when-and-how-to-develop-domain-specific-languages.md#23-analysis) |
| 5 | [2.4. Design](background/lecture-3/when-and-how-to-develop-domain-specific-languages.md#24-design) |
| 5 | [2.5. Implementation](background/lecture-3/when-and-how-to-develop-domain-specific-languages.md#25-implementation) |
| 18 | [2.6. Comparison With Other Classifications](background/lecture-3/when-and-how-to-develop-domain-specific-languages.md#26-comparison-with-other-classifications) |
| 19 | [3. DSL DEVELOPMENT SUPPORT](background/lecture-3/when-and-how-to-develop-domain-specific-languages.md#3-dsl-development-support) |
| 19 | [3.1. Design and Implementation Support](background/lecture-3/when-and-how-to-develop-domain-specific-languages.md#31-design-and-implementation-support) |
| 20 | [3.2. Analysis Support](background/lecture-3/when-and-how-to-develop-domain-specific-languages.md#32-analysis-support) |
| 21 | [4. CONCLUSIONS AND OPEN PROBLEMS](background/lecture-3/when-and-how-to-develop-domain-specific-languages.md#4-conclusions-and-open-problems) |
| 24 | [ACKNOWLEDGMENTS](background/lecture-3/when-and-how-to-develop-domain-specific-languages.md#acknowledgments) |
| 24 | [REFERENCES](background/lecture-3/when-and-how-to-develop-domain-specific-languages.md#references) |

</details>

### Kurtev, Bézivin, Jouault & Valduriez — Model-based DSL frameworks (2006)

[`background/lecture-3/model-based-dsl-frameworks.md`](background/lecture-3/model-based-dsl-frameworks.md) · [PDF](background/lecture-3/model-based-dsl-frameworks.pdf) · 14 pages

Basic MDE principles stated as definitions (model organization, model utilization, technical space) and then applied to DSL engineering: six case studies, the problems they share, and AMMA as an answer — KM3 for metamodel definition, TCS for concrete syntax, ATL for transformation. This is the paper that frames a DSL as a coordinated set of models rather than as a grammar, which is the framing lecture 3 uses.

<details><summary>Sections</summary>

| Page | Section |
|---:|---|
| 1 | [Abstract](background/lecture-3/model-based-dsl-frameworks.md#abstract) |
| 1 | [1. Introduction](background/lecture-3/model-based-dsl-frameworks.md#1-introduction) |
| 1 | [2. Definitions](background/lecture-3/model-based-dsl-frameworks.md#2-definitions) |
| 2 | [2.1 Model Organization Definition](background/lecture-3/model-based-dsl-frameworks.md#21-model-organization-definition) |
| 2 | [2.2 Model Utilization Definition](background/lecture-3/model-based-dsl-frameworks.md#22-model-utilization-definition) |
| 3 | [2.3 Relations between Organization and Utilization of a Model](background/lecture-3/model-based-dsl-frameworks.md#23-relations-between-organization-and-utilization-of-a-model) |
| 3 | [2.4 Domain Specific Languages](background/lecture-3/model-based-dsl-frameworks.md#24-domain-specific-languages) |
| 4 | [2.5 DSLs and Models](background/lecture-3/model-based-dsl-frameworks.md#25-dsls-and-models) |
| 4 | [2.6 Technical Spaces](background/lecture-3/model-based-dsl-frameworks.md#26-technical-spaces) |
| 5 | [3. Case Studies and Problems](background/lecture-3/model-based-dsl-frameworks.md#3-case-studies-and-problems) |
| 5 | [3.1 Telephony Languages](background/lecture-3/model-based-dsl-frameworks.md#31-telephony-languages) |
| 5 | [3.2 Querying Program Source Code](background/lecture-3/model-based-dsl-frameworks.md#32-querying-program-source-code) |
| 5 | [3.3 PIM to PSM Transformations](background/lecture-3/model-based-dsl-frameworks.md#33-pim-to-psm-transformations) |
| 5 | [3.4 Sensor Data Stream Processing](background/lecture-3/model-based-dsl-frameworks.md#34-sensor-data-stream-processing) |
| 6 | [3.5 Bug Tracking](background/lecture-3/model-based-dsl-frameworks.md#35-bug-tracking) |
| 6 | [3.6 Contract Management](background/lecture-3/model-based-dsl-frameworks.md#36-contract-management) |
| 6 | [3.7 Problem Identification](background/lecture-3/model-based-dsl-frameworks.md#37-problem-identification) |
| 6 | [4. Solutions](background/lecture-3/model-based-dsl-frameworks.md#4-solutions) |
| 7 | [4.1 The Overall Structure of AMMA](background/lecture-3/model-based-dsl-frameworks.md#41-the-overall-structure-of-amma) |
| 8 | [4.2 KM3: Metamodel Definition Language](background/lecture-3/model-based-dsl-frameworks.md#42-km3-metamodel-definition-language) |
| 9 | [4.3 TCS: Language for Defining Concrete Syntaxes](background/lecture-3/model-based-dsl-frameworks.md#43-tcs-language-for-defining-concrete-syntaxes) |
| 9 | [4.4 ATL: Model Transformation Language](background/lecture-3/model-based-dsl-frameworks.md#44-atl-model-transformation-language) |
| 10 | [4.5 Using AMMA to Solve Problems](background/lecture-3/model-based-dsl-frameworks.md#45-using-amma-to-solve-problems) |
| 11 | [5. Related Work](background/lecture-3/model-based-dsl-frameworks.md#5-related-work) |
| 12 | [6. Conclusions](background/lecture-3/model-based-dsl-frameworks.md#6-conclusions) |
| 12 | [Acknowledgements](background/lecture-3/model-based-dsl-frameworks.md#acknowledgements) |
| 12 | [References](background/lecture-3/model-based-dsl-frameworks.md#references) |

</details>

### Jouault, Bézivin & Kurtev — TCS: a DSL for the Specification of Textual Concrete Syntaxes in Model Engineering (2006)

[`background/lecture-3/tcs-a-dsl-for-the-specification-of-textual-concrete-syntaxes-in-model-engineering.md`](background/lecture-3/tcs-a-dsl-for-the-specification-of-textual-concrete-syntaxes-in-model-engineering.md) · [PDF](background/lecture-3/tcs-a-dsl-for-the-specification-of-textual-concrete-syntaxes-in-model-engineering.pdf) · 6 pages

Concrete syntax attached to a metamodel, in both directions: one TCS specification yields both a parser (text to model) and a serialiser (model to text), instead of a grammar plus a hand-written visitor. Short, and the closest published relative of what Xtext does from an existing Ecore metamodel.

<details><summary>Sections</summary>

| Page | Section |
|---:|---|
| 1 | [Abstract](background/lecture-3/tcs-a-dsl-for-the-specification-of-textual-concrete-syntaxes-in-model-engineering.md#abstract) |
| 1 | [1. Introduction](background/lecture-3/tcs-a-dsl-for-the-specification-of-textual-concrete-syntaxes-in-model-engineering.md#1-introduction) |
| 2 | [2. Background](background/lecture-3/tcs-a-dsl-for-the-specification-of-textual-concrete-syntaxes-in-model-engineering.md#2-background) |
| 2 | [2.1 Domain Specific Languages](background/lecture-3/tcs-a-dsl-for-the-specification-of-textual-concrete-syntaxes-in-model-engineering.md#21-domain-specific-languages) |
| 2 | [2.2 The AMMA Framework](background/lecture-3/tcs-a-dsl-for-the-specification-of-textual-concrete-syntaxes-in-model-engineering.md#22-the-amma-framework) |
| 3 | [2.3 Basic KM3 Concepts](background/lecture-3/tcs-a-dsl-for-the-specification-of-textual-concrete-syntaxes-in-model-engineering.md#23-basic-km3-concepts) |
| 3 | [3. TCS: Bridging Metamodels and Grammars](background/lecture-3/tcs-a-dsl-for-the-specification-of-textual-concrete-syntaxes-in-model-engineering.md#3-tcs-bridging-metamodels-and-grammars) |
| 3 | [3.1 Overview](background/lecture-3/tcs-a-dsl-for-the-specification-of-textual-concrete-syntaxes-in-model-engineering.md#31-overview) |
| 3 | [3.2 Running Example: SPL](background/lecture-3/tcs-a-dsl-for-the-specification-of-textual-concrete-syntaxes-in-model-engineering.md#32-running-example-spl) |
| 3 | [Listing 1. Simple SPL program](background/lecture-3/tcs-a-dsl-for-the-specification-of-textual-concrete-syntaxes-in-model-engineering.md#listing-1-simple-spl-program) |
| 4 | [3.3 Basic Constructs](background/lecture-3/tcs-a-dsl-for-the-specification-of-textual-concrete-syntaxes-in-model-engineering.md#33-basic-constructs) |
| 4 | [3.4 Additional Constructs](background/lecture-3/tcs-a-dsl-for-the-specification-of-textual-concrete-syntaxes-in-model-engineering.md#34-additional-constructs) |
| 5 | [3.5 Specific Constructs for Model to Text](background/lecture-3/tcs-a-dsl-for-the-specification-of-textual-concrete-syntaxes-in-model-engineering.md#35-specific-constructs-for-model-to-text) |
| 5 | [4. Implementation Issues](background/lecture-3/tcs-a-dsl-for-the-specification-of-textual-concrete-syntaxes-in-model-engineering.md#4-implementation-issues) |
| 5 | [5. Related Work](background/lecture-3/tcs-a-dsl-for-the-specification-of-textual-concrete-syntaxes-in-model-engineering.md#5-related-work) |
| 6 | [6. Conclusion](background/lecture-3/tcs-a-dsl-for-the-specification-of-textual-concrete-syntaxes-in-model-engineering.md#6-conclusion) |
| 6 | [Acknowledgments](background/lecture-3/tcs-a-dsl-for-the-specification-of-textual-concrete-syntaxes-in-model-engineering.md#acknowledgments) |
| 6 | [References](background/lecture-3/tcs-a-dsl-for-the-specification-of-textual-concrete-syntaxes-in-model-engineering.md#references) |

</details>

### Model Driven Architecture — Foundations and Applications, ECMDA-FA 2008 proceedings (LNCS 5095)

[`background/lecture-3/model-driven-architecture-foundations-and-applications-ecmda-fa-2008-proceedings.md`](background/lecture-3/model-driven-architecture-foundations-and-applications-ecmda-fa-2008-proceedings.md) · [PDF](background/lecture-3/model-driven-architecture-foundations-and-applications-ecmda-fa-2008-proceedings.pdf) · 457 pages

457-page conference proceedings, thirty papers across model management, executable models, concrete syntaxes, aspects, validation and an industrial session. For lecture 3 the *Concrete Syntaxes* group is the point of the volume: textual modelling embedded into graphical modelling (p. 165), a classification of textual-syntax mapping approaches (p. 181, the survey that places Xtext, TCS and EMFText against each other), metamodel syntactic sheets (p. 197) and graphical rendering with SVG (p. 212). *The Epsilon Generation Language* (p. 13) is a model-to-text language, so it is also the volume's Task 3 paper.

<details><summary>Papers</summary>

| Page | Paper |
|---:|---|
| 13 | [The Epsilon Generation Language](background/lecture-3/model-driven-architecture-foundations-and-applications-ecmda-fa-2008-proceedings.md#the-epsilon-generation-language) |
| 29 | [Constructing and Visualizing Transformation Chains](background/lecture-3/model-driven-architecture-foundations-and-applications-ecmda-fa-2008-proceedings.md#constructing-and-visualizing-transformation-chains) |
| 45 | [Towards Roundtrip Engineering - A Template-Based Reverse Engineering Approach](background/lecture-3/model-driven-architecture-foundations-and-applications-ecmda-fa-2008-proceedings.md#towards-roundtrip-engineering---a-template-based-reverse-engineering-approach) |
| 60 | [Annotation Framework Validation Using Domain Models](background/lecture-3/model-driven-architecture-foundations-and-applications-ecmda-fa-2008-proceedings.md#annotation-framework-validation-using-domain-models) |
| 75 | [Prototyping Visual Interpreters and Debuggers for Domain-Specific Modelling Languages](background/lecture-3/model-driven-architecture-foundations-and-applications-ecmda-fa-2008-proceedings.md#prototyping-visual-interpreters-and-debuggers-for-domain-specific-modelling-languages) |
| 91 | [Data Flow Analysis of UML Action Semantics for Executable Models](background/lecture-3/model-driven-architecture-foundations-and-applications-ecmda-fa-2008-proceedings.md#data-flow-analysis-of-uml-action-semantics-for-executable-models) |
| 106 | [From UML Activities to TAAL - Towards Behaviour-Preserving Model Transformations](background/lecture-3/model-driven-architecture-foundations-and-applications-ecmda-fa-2008-proceedings.md#from-uml-activities-to-taal---towards-behaviour-preserving-model-transformations) |
| 122 | [A Practical MDA Approach for Autonomic Profiling and Performance Assessment](background/lecture-3/model-driven-architecture-foundations-and-applications-ecmda-fa-2008-proceedings.md#a-practical-mda-approach-for-autonomic-profiling-and-performance-assessment) |
| 133 | [Ladder Metamodeling and PLC Program Validation through Time Petri Nets ⋆](background/lecture-3/model-driven-architecture-foundations-and-applications-ecmda-fa-2008-proceedings.md#ladder-metamodeling-and-plc-program-validation-through-time-petri-nets) |
| 149 | [Array OL Descriptions of Repetitive Structures in VHDL](background/lecture-3/model-driven-architecture-foundations-and-applications-ecmda-fa-2008-proceedings.md#array-ol-descriptions-of-repetitive-structures-in-vhdl) |
| 165 | [Textual Modelling Embedded into Graphical Modelling](background/lecture-3/model-driven-architecture-foundations-and-applications-ecmda-fa-2008-proceedings.md#textual-modelling-embedded-into-graphical-modelling) |
| 181 | [Classification of Concrete Textual Syntax Mapping Approaches](background/lecture-3/model-driven-architecture-foundations-and-applications-ecmda-fa-2008-proceedings.md#classification-of-concrete-textual-syntax-mapping-approaches) |
| 197 | [Metamodel Syntactic Sheets: An Approach for Defining Textual Concrete Syntaxes](background/lecture-3/model-driven-architecture-foundations-and-applications-ecmda-fa-2008-proceedings.md#metamodel-syntactic-sheets-an-approach-for-defining-textual-concrete-syntaxes) |
| 212 | [Graphical Concrete Syntax Rendering with SVG](background/lecture-3/model-driven-architecture-foundations-and-applications-ecmda-fa-2008-proceedings.md#graphical-concrete-syntax-rendering-with-svg) |
| 227 | [Semantics Preservation of Sequence Diagram Aspects](background/lecture-3/model-driven-architecture-foundations-and-applications-ecmda-fa-2008-proceedings.md#semantics-preservation-of-sequence-diagram-aspects) |
| 243 | [Generic Reusable Concern Compositions ⋆](background/lecture-3/model-driven-architecture-foundations-and-applications-ecmda-fa-2008-proceedings.md#generic-reusable-concern-compositions) |
| 258 | [Modeling Human Aspects of Business Processes - A View-Based, Model-Driven Approach](background/lecture-3/model-driven-architecture-foundations-and-applications-ecmda-fa-2008-proceedings.md#modeling-human-aspects-of-business-processes---a-view-based-model-driven-approach) |
| 274 | [A Semantics-Based Aspect Language for Interactions with the Arbitrary Events Symbol](background/lecture-3/model-driven-architecture-foundations-and-applications-ecmda-fa-2008-proceedings.md#a-semantics-based-aspect-language-for-interactions-with-the-arbitrary-events-symbol) |
| 290 | [Model-Driven Platform-Specific Testing through Configurable Simulations](background/lecture-3/model-driven-architecture-foundations-and-applications-ecmda-fa-2008-proceedings.md#model-driven-platform-specific-testing-through-configurable-simulations) |
| 306 | [Testing Metamodels](background/lecture-3/model-driven-architecture-foundations-and-applications-ecmda-fa-2008-proceedings.md#testing-metamodels) |
| 322 | [A Metamodeling Approach for Reasoning about Requirements](background/lecture-3/model-driven-architecture-foundations-and-applications-ecmda-fa-2008-proceedings.md#a-metamodeling-approach-for-reasoning-about-requirements) |
| 338 | [Model-Driven Security in Practice: An Industrial Experience ⋆](background/lecture-3/model-driven-architecture-foundations-and-applications-ecmda-fa-2008-proceedings.md#model-driven-security-in-practice-an-industrial-experience) |
| 350 | [Supporting the UML State Machine Diagrams at Runtime](background/lecture-3/model-driven-architecture-foundations-and-applications-ecmda-fa-2008-proceedings.md#supporting-the-uml-state-machine-diagrams-at-runtime) |
| 361 | [Model-Based Generation of Interlocking Controller Software from Control Tables](background/lecture-3/model-driven-architecture-foundations-and-applications-ecmda-fa-2008-proceedings.md#model-based-generation-of-interlocking-controller-software-from-control-tables) |
| 373 | [Model-Driven Simulation of a Maritime Surveillance System](background/lecture-3/model-driven-architecture-foundations-and-applications-ecmda-fa-2008-proceedings.md#model-driven-simulation-of-a-maritime-surveillance-system) |
| 381 | [Towards Utilizing Model-Driven Engineering of Composite Applications for Business Performance Analysis](background/lecture-3/model-driven-architecture-foundations-and-applications-ecmda-fa-2008-proceedings.md#towards-utilizing-model-driven-engineering-of-composite-applications-for-business-performance-analysis) |
| 393 | [From Business Architecture to SOA Realization Using MDD](background/lecture-3/model-driven-architecture-foundations-and-applications-ecmda-fa-2008-proceedings.md#from-business-architecture-to-soa-realization-using-mdd) |
| 405 | [Realizing an MDA and SOA Marriage for the Development of Mobile Services](background/lecture-3/model-driven-architecture-foundations-and-applications-ecmda-fa-2008-proceedings.md#realizing-an-mda-and-soa-marriage-for-the-development-of-mobile-services) |
| 418 | [A Survey about the Intent to Use Visual Defect Annotations for Software Models](background/lecture-3/model-driven-architecture-foundations-and-applications-ecmda-fa-2008-proceedings.md#a-survey-about-the-intent-to-use-visual-defect-annotations-for-software-models) |
| 431 | [MDA-Based Methodologies: An Analytical Survey](background/lecture-3/model-driven-architecture-foundations-and-applications-ecmda-fa-2008-proceedings.md#mda-based-methodologies-an-analytical-survey) |
| 444 | [Where Is the Proof? - A Review of Experiences from Applying MDE in Industry](background/lecture-3/model-driven-architecture-foundations-and-applications-ecmda-fa-2008-proceedings.md#where-is-the-proof---a-review-of-experiences-from-applying-mde-in-industry) |

</details>

### Model Driven Architecture — Foundations and Applications, ECMDA-FA 2009 proceedings (LNCS 5562)

[`background/lecture-3/model-driven-architecture-foundations-and-applications-ecmda-fa-2009-proceedings.md`](background/lecture-3/model-driven-architecture-foundations-and-applications-ecmda-fa-2009-proceedings.md) · [PDF](background/lecture-3/model-driven-architecture-foundations-and-applications-ecmda-fa-2009-proceedings.pdf) · 349 pages

349-page conference proceedings, twenty-four papers, the next year's edition and the one held in Enschede. Relevant here: *Derivation and Refinement of Textual Syntax for Models* (p. 126), which is the Xtext-style question of getting a concrete syntax out of an existing metamodel and then improving it; *A Hybrid Graphical and Textual Notation and Editor for UML Actions* (p. 249); *Comparison of Three Model Transformation Languages* (p. 14), for the Task 2 choice between ATL and QVT; and *A Domain Specific Language for Extracting Models in Software Modernization* (p. 94).

<details><summary>Papers</summary>

| Page | Paper |
|---:|---|
| 13 | [Creating Embedded Platforms with MDA: Where's the Sweet Spot?](background/lecture-3/model-driven-architecture-foundations-and-applications-ecmda-fa-2009-proceedings.md#creating-embedded-platforms-with-mda-wheres-the-sweet-spot) |
| 14 | [Comparison of Three Model Transformation Languages](background/lecture-3/model-driven-architecture-foundations-and-applications-ecmda-fa-2009-proceedings.md#comparison-of-three-model-transformation-languages) |
| 30 | [On the Use of Higher-Order Model Transformations](background/lecture-3/model-driven-architecture-foundations-and-applications-ecmda-fa-2009-proceedings.md#on-the-use-of-higher-order-model-transformations) |
| 46 | [Managing Model Adaptation by Precise Detection of Metamodel Changes](background/lecture-3/model-driven-architecture-foundations-and-applications-ecmda-fa-2009-proceedings.md#managing-model-adaptation-by-precise-detection-of-metamodel-changes) |
| 62 | [A Pattern Mining Approach Using QVT](background/lecture-3/model-driven-architecture-foundations-and-applications-ecmda-fa-2009-proceedings.md#a-pattern-mining-approach-using-qvt) |
| 78 | [A Language-Theoretic View on Guidelines and Consistency Rules of UML](background/lecture-3/model-driven-architecture-foundations-and-applications-ecmda-fa-2009-proceedings.md#a-language-theoretic-view-on-guidelines-and-consistency-rules-of-uml) |
| 94 | [A Domain Specific Language for Extracting Models in Software Modernization](background/lecture-3/model-driven-architecture-foundations-and-applications-ecmda-fa-2009-proceedings.md#a-domain-specific-language-for-extracting-models-in-software-modernization) |
| 110 | [Challenges in Combining SysML and MARTE for Model-Based Design of Embedded Systems](background/lecture-3/model-driven-architecture-foundations-and-applications-ecmda-fa-2009-proceedings.md#challenges-in-combining-sysml-and-marte-for-model-based-design-of-embedded-systems) |
| 126 | [Derivation and Refinement of Textual Syntax for Models](background/lecture-3/model-driven-architecture-foundations-and-applications-ecmda-fa-2009-proceedings.md#derivation-and-refinement-of-textual-syntax-for-models) |
| 142 | [Uniform Random Generation of Huge Metamodel Instances](background/lecture-3/model-driven-architecture-foundations-and-applications-ecmda-fa-2009-proceedings.md#uniform-random-generation-of-huge-metamodel-instances) |
| 158 | [Establishing Correspondences between Models with the Epsilon Comparison Language](background/lecture-3/model-driven-architecture-foundations-and-applications-ecmda-fa-2009-proceedings.md#establishing-correspondences-between-models-with-the-epsilon-comparison-language) |
| 170 | [Dependent and Conflicting Change Operations of Process Models](background/lecture-3/model-driven-architecture-foundations-and-applications-ecmda-fa-2009-proceedings.md#dependent-and-conflicting-change-operations-of-process-models) |
| 186 | [Enabling Automated Traceability Maintenance through the Upkeep of Traceability Relations](background/lecture-3/model-driven-architecture-foundations-and-applications-ecmda-fa-2009-proceedings.md#enabling-automated-traceability-maintenance-through-the-upkeep-of-traceability-relations) |
| 202 | [Temporal Extensions of OCL Revisited](background/lecture-3/model-driven-architecture-foundations-and-applications-ecmda-fa-2009-proceedings.md#temporal-extensions-of-ocl-revisited) |
| 218 | [An MDA-Based Approach for Behaviour Modelling of Context-Aware Mobile Applications ∗](background/lecture-3/model-driven-architecture-foundations-and-applications-ecmda-fa-2009-proceedings.md#an-mda-based-approach-for-behaviour-modelling-of-context-aware-mobile-applications) |
| 233 | [A Model Driven Approach to the Analysis of Timeliness Properties](background/lecture-3/model-driven-architecture-foundations-and-applications-ecmda-fa-2009-proceedings.md#a-model-driven-approach-to-the-analysis-of-timeliness-properties) |
| 249 | [A Hybrid Graphical and Textual Notation and Editor for UML Actions](background/lecture-3/model-driven-architecture-foundations-and-applications-ecmda-fa-2009-proceedings.md#a-hybrid-graphical-and-textual-notation-and-editor-for-uml-actions) |
| 265 | [Mapping Requirement Models to Mathematical Models in Control System Development](background/lecture-3/model-driven-architecture-foundations-and-applications-ecmda-fa-2009-proceedings.md#mapping-requirement-models-to-mathematical-models-in-control-system-development) |
| 277 | [On Study Results: Round Trip Engineering of Space Systems](background/lecture-3/model-driven-architecture-foundations-and-applications-ecmda-fa-2009-proceedings.md#on-study-results-round-trip-engineering-of-space-systems) |
| 289 | [MoPCoM/MARTE Process Applied to a Cognitive Radio System Design and Analysis](background/lecture-3/model-driven-architecture-foundations-and-applications-ecmda-fa-2009-proceedings.md#mopcommarte-process-applied-to-a-cognitive-radio-system-design-and-analysis) |
| 301 | [Managing Flexibility: Modeling Binding-Times in Simulink](background/lecture-3/model-driven-architecture-foundations-and-applications-ecmda-fa-2009-proceedings.md#managing-flexibility-modeling-binding-times-in-simulink) |
| 313 | [Experiences of Developing a Network Modeling Tool Using the Eclipse Environment](background/lecture-3/model-driven-architecture-foundations-and-applications-ecmda-fa-2009-proceedings.md#experiences-of-developing-a-network-modeling-tool-using-the-eclipse-environment) |
| 325 | [MBT4Chor: A Model-Based Testing Approach for Service Choreographies](background/lecture-3/model-driven-architecture-foundations-and-applications-ecmda-fa-2009-proceedings.md#mbt4chor-a-model-based-testing-approach-for-service-choreographies) |
| 337 | [Model-Based Interoperability of Heterogeneous Information Systems: An Industrial Case Study](background/lecture-3/model-driven-architecture-foundations-and-applications-ecmda-fa-2009-proceedings.md#model-based-interoperability-of-heterogeneous-information-systems-an-industrial-case-study) |

</details>
