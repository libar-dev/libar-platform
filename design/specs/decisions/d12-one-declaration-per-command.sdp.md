---
id: spec:decisions.d12-one-declaration-per-command
kind: decision
altitude: feature
readiness: defined
relations:
  refines: spec:platform.transactional-domain-platform
---
# One declaration per command, generated bindings later

Provenance: carried from v0.1. Feature · Traces: D12, Sc L2-4.

Each command has one declaration: name, input and output schema, executor, permission policy and the read models it maintains. Convex functions stay static exports that code generation can see. The start is shared schema values, inferred types and a small composition helper; the repetitive bindings are generated only after two real modules show the pattern, deterministically and checked in CI. No DI container, decorator framework, reflection registry or module lifecycle. One canonical schema per command.

## Intent

- problem: Renaming a typed handler or breaking its argument contract must fail a build, type or registration check before any traffic; wiring facts maintained in several places drift apart silently (Sc L2-4)
- outcome: Each command has one declaration that names its input and output schema, executor, permission policy and the read models it maintains, and Convex functions stay static exports that code generation can see (D12)
- value: The module system removes independently maintained wiring facts instead of hiding them behind a wrapper (D12, Decision method rule 7)
- risk: Generation waits for two real modules; until then the composition helper and shared schema values carry the repetition by hand (D12)

## Decision

- context: The concern is wiring facts that must agree, name, schemas, executor, policy and read models; Convex gives static function exports that its code generation reads and validators that yield inferred types (D12)
- alternative: Do nothing beyond Convex: a hand-written mutation per command with shared schema values, inferred types and a small composition helper; this is the option chosen as the start (D12, Decision method rule 2)
- alternative: A DI container, decorator framework, reflection registry or module lifecycle; rejected (D12)
- alternative: Generating bindings from the first module; rejected until two real modules show the pattern (D12)
- alternative: A schema converter between two canonical schemas; rejected, because a converter that silently drops refinements is not acceptable (D12)
- decision: Each command has one declaration: name, input and output schema, executor, permission policy and the read models it maintains; Convex functions stay static exports that code generation can see; start with shared schema values, inferred types and a small composition helper; generate the repetitive bindings only after two real modules show the pattern, deterministically and checked in CI (D12)
- rationale: The test of the module system is whether it removes independently maintained wiring facts; hiding them behind a wrapper does not count (D12, Decision method rule 7)
- consequence: No DI container, decorator framework, reflection registry or module lifecycle; a class may group a module's declarations and holds no correctness-critical global state (D12)
- consequence: One canonical schema per command; a schema converter that silently drops refinements is not acceptable (D12)
- consequence: A renamed handler or a broken argument contract fails a build, type or registration check before any traffic (D12, Sc L2-4)
- consequence: The standing cost is one declaration per command and, later, a deterministic generator checked in CI; in this design the declaration binds to two registered mutations per command, a public entry and an internal entry, which D7 counts as a doubled function count and which `spec:command.command-declaration` records under E-7 with the single-export dispatcher alternative it refuted (D12, D7, E-7)
