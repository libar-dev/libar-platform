# Spec and Pattern Relationships

This document defines how semantic pattern names relate to roadmap specs, executable carriers, and implementation files.

## Naming contract

Semantic pattern names stay bare.

- `EventStoreFoundation`
- `BoundedContextFoundation`
- `SagaOrchestration`

These names represent the business or architectural concept itself.

Carrier names are descriptive wrappers around that concept.

- `EventStoreFoundationExecutableTests`
- `BoundedContextFoundationExecutableTests`
- `SagaOrchestrationExecutableTests`

The `*ExecutableTests` suffix names the carrier artifact only. It does not rename the underlying pattern.

## Continuity mechanism

The durable bridge between a shipped carrier and the bare semantic pattern is `@architect-implements:<Pattern>`.

Example:

```gherkin
@architect-pattern:EventStoreFoundationExecutableTests
@architect-implements:EventStoreFoundation
Feature: Event Store Foundation Executable Tests
```

Interpretation:

- `@architect-pattern` names the artifact node that exists in the repo
- `@architect-implements` points to the semantic pattern the artifact preserves

This lets shipped carriers surface in the graph without forcing the semantic concept to adopt a carrier suffix.

## Bipartite relationship model

Treat the graph as two connected kinds of node.

1. Semantic pattern nodes
   - bare names
   - represent the enduring concept
2. Carrier nodes
   - executable features, implementation files, and other artifacts
   - represent where the concept is proven or implemented

The edges matter more than name duplication.

- Roadmap spec to executable carrier via `@architect-executable-specs:<path>`
- Carrier to semantic pattern via `@architect-implements:<Pattern>`
- Source files may also implement the same semantic pattern when that is the truthful continuity link

## Refactoring carve-out

Older shipped patterns may predate the current naming and metadata rules. In that case, a refactoring carve-out is allowed.

Use it when all of the following are true.

- The pattern already exists in shipped code.
- The repo needs graph continuity now.
- Renaming the semantic concept to add `ExecutableTests` would blur the domain meaning.

Under the carve-out:

- keep the semantic pattern name bare
- create an executable carrier named `<Pattern>ExecutableTests` when needed
- attach `@architect-implements:<Pattern>` to the carrier
- explain the provenance honestly in the carrier prose

## What not to do

Avoid these mistakes.

- Renaming the semantic concept to `*ExecutableTests`
- Using the carrier name as if it were the domain pattern name in decisions or roadmap specs
- Creating a carrier without `@architect-implements`
- Pointing other patterns only at carrier names when they really depend on the bare concept

## Relationship examples

### Standard two-tier flow

- Roadmap spec pattern: `DeciderPattern`
- Executable carrier pattern: `DeciderPatternExecutableTests`
- Continuity edge: `@architect-implements:DeciderPattern`

### Code-first structural carve-out

- Roadmap spec pattern: `PackageArchitecture`
- No executable carrier
- Structural truth remains in the spec and in code/package metadata

### Shipped-pattern retroactive continuity

- Existing concept: `CommandBusFoundation`
- New carrier: `CommandBusFoundationExecutableTests`
- Carrier tag: `@architect-implements:CommandBusFoundation`

The semantic name stays stable across planning, graph queries, and future references.
