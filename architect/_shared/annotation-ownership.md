# Annotation Ownership

This document defines which source owns which kind of architectural truth.

## Core rule

Annotations in production TypeScript are additive. They improve graph continuity, discoverability, and local explanation. They are not automatically mandatory for every pattern.

## Ownership by source type

### Roadmap and decision specs own planning intent

Use architect feature files for:

- lifecycle state such as roadmap, active, completed, deferred
- deliverables and acceptance criteria
- planning dependencies
- decision records and governance rules

### Executable features own behavior proofs

Use `tests/features/` carriers for:

- runnable behavioral rules
- transferred invariants and rationale from design specs
- continuity for shipped patterns via `@architect-implements:<Pattern>`

### Production TypeScript owns code-local reasoning

Use JSDoc or nearby source comments for:

- why a function, type, or module exists
- assumptions tied to runtime code
- boundary contracts that are clearest at the implementation site

Avoid forcing broad planning metadata into code files when the truth is really process-owned.

## Code-originated patterns

Some patterns start in code and stay code-first.

That is acceptable when the primary truth is structural, API-shape oriented, or tightly bound to implementation seams. In those cases:

- add architect annotations when they help continuity
- keep them lean and truthful
- do not invent executable Gherkin just to satisfy symmetry

`PackageArchitecture` is the model example. It describes repository structure and package boundaries. The build graph, type-checker, and package manifests are the proof surface, not a behavioral Gherkin carrier.

## What annotations should not do

Annotations should not become a dumping ground for every design fact.

Do not use them to:

- replace a real decision record
- replace a real executable behavior carrier
- duplicate large bodies of prose that belong in doctrine or specs
- pretend a code file proves runtime behavior it does not test

## Practical guidance

Choose the narrowest honest owner.

- If the truth is about planning state, keep it in architect specs.
- If the truth is about behavior, keep it in executable features.
- If the truth is about local code meaning, keep it near the code.

The goal is durable traceability, not metadata maximalism.
