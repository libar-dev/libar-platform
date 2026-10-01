---
id: spec:kernel.decider-contract
kind: contract
altitude: story
readiness: defined
relations:
  refines: spec:kernel.domain-kernel
  dependsOn: spec:kernel.initial-state
  decidedBy: spec:decisions.d03-events-only-source-of-next-state
  constrainedBy:
    - spec:laws.law03-events-only-source-of-state
---
# The decider contract

Layer 0 · Detail: full · Traces: D2, D3, D4, D5, D6, D11, E-1, E-6, E-20, E-21.

This contract pins the shape of a context's pure domain code: `Decider<S, C, E, R>` with `initial`, `decide` and `evolve`; `DecisionContext`, which carries time, the server-established actor and the facts the parent captured; `DecideResult<E, R>`, which is events and a result or a rejection; `fold`; and the state-machine and invariant helper shapes. The persistence adapter is the only caller of `decide` and `evolve` in production; tests call them directly.

The generic parameters are the state `S`, the command `C`, the domain event `E` and the result `R`. The result is the DTO the context operation returns to the parent, so the operation's `returns` validator pins it at the boundary (D12). The decision context's actor is the kernel's own structural `DecisionActor`, to which the command family's `Actor` (E-6) is assignable; the kernel imports nothing from the command family and nothing from Convex, so Layer 0 stays usable before Layer 1 exists.

## Intent

- outcome: Pin the decider, its decision context, its result, the fold and the helper shapes so that every context's domain code has one interface and the adapter has one caller contract (D3)
- value: One authority for state, testable without a backend, and a shape code generation can see (D3, D12)
- risk: The contract is generic over four types; a context whose commands span several stream types declares one decider per stream type and an operation that sequences them, which is the batch-shaped API's business (D10)

### Open questions

- [non-blocking] Extension E-20: the concrete generic parameters, the fields of `DecisionContext`, the `DomainEvent` shape, the at-least-one-event rule and the helper shapes are this design's; the owner confirms them before code names them (D3, E-20)

## Contract

- A decider declares its stream type once; one decider serves one stream type (D2, E-20)
- `initial()` returns the state of a stream that has no events yet; a rebuild from the creation event starts there (D3, E-1)
- `decide(state, command, context)` is a pure function that returns events and a result, or a rejection, and never a state patch (D3)
- `evolve(state, event)` is a pure function from one state and one event to the next state (D3)
- `fold(evolve, state, events)` applies `evolve` left to right and is the only way the next state is computed (D3, Law 3)
- The decision context carries the transaction's time, the server-established actor and the outside facts the parent captured; the decider reads time and facts from it and from nowhere else (D3, D11)
- [extension] Captured facts are supplied by the parent's executor on the context call, beside the business input and not inside it, so a receipt's fingerprint excludes them and a retry that captures a fresher fact is not a conflict; the doc defines the fingerprint over business input and contract version only, and this reading is registered under E-36 (E-36, D3, D6)
- A domain event carries its type, its schema version, its payload and optionally when it occurred in the domain; the adapter adds the envelope (D2)
- The events a decider returns are validated at the context boundary against the context's event payload validators before they are appended (D2, D12)
- A rejection carries a code the context documents, a message and optional details; the adapter throws it and nothing is written (D4, D7)
- The decider says whether committed events are an applied outcome or a business failure; both commit (D4)
- [extension] An applied or business-failure result carries at least one event; a decider with nothing to record returns a rejection (E-21, D4)
- [extension] A decider may declare invariants; the adapter checks them after the fold and treats a violation as a technical failure (E-20, D4)
- [extension] A small state machine is a transition table over statuses and triggers with a pure lookup; an absent entry is an invalid transition the decider rejects (E-20, Sc L1-1)
- [extension] `decide` and `evolve` do not mutate their arguments, and evaluating either twice on the same inputs yields deeply equal outputs (E-20, Sc L0-1)

## Design

One declaration per bullet. `Value` is the Convex value type in `Rejection.details` only; the kernel package brings it in as `import type { Value } from "convex/values"`, which the compiler erases, so the kernel needs no Convex runtime for it and its emitted modules import nothing from Convex.

- typeDomainEvent: `type DomainEvent<T extends string = string, P = unknown> = { eventType: T; eventSchemaVersion: number; payload: P; occurredAt?: number }` (D2, E-20)
- typeDecisionActor: `type DecisionActor = { kind: string; id: string; onBehalfOf?: { kind: string; id: string }; delegationRef?: string }` is the kernel's structural view of the actor; the `Actor` of `spec:command.actor-and-scope` is assignable to it and is what the adapter passes, the kernel names no actor kinds of its own, and no kernel module imports the command family (D3, D11, E-6, E-20)
- typeDecisionContext: `type DecisionContext = { now: number; actor: DecisionActor; facts: Readonly<Record<string, unknown>> }` where `now` is milliseconds since the epoch as `Date.now()` gives it and `facts` is the record the parent's executor passed on the context call, `{}` when it passed none (D3, D11, E-20)
- typeDecideResult: `type DecideResult<E extends DomainEvent, R> = { kind: "applied"; events: readonly E[]; result: R } | { kind: "businessFailure"; events: readonly E[]; result: R } | { kind: "rejection"; rejection: Rejection }` (D3, D4, E-20)
- typeDecider: `type Decider<S, C, E extends DomainEvent, R> = { streamType: string; initial: () => S; decide: (state: S, command: C, context: DecisionContext) => DecideResult<E, R>; evolve: (state: S, event: E) => S; invariants?: readonly Invariant<S>[] }` (D3, E-1, E-20)
- fnFold: `fold<S, E>(evolve: (state: S, event: E) => S, state: S, events: readonly E[]): S` (D3)
- fnRebuild: `rebuild<S, C, E extends DomainEvent, R>(decider: Decider<S, C, E, R>, events: readonly E[], start?: S): S` returns `fold(decider.evolve, start ?? decider.initial(), events)`, where `start` is the state the latest baseline event holds and `events` are the events after it (D3, D5)
- typeInvariant: `type Invariant<S> = { name: string; holds: (state: S) => boolean }` (E-20)
- fnCheckInvariants: `checkInvariants<S>(invariants: readonly Invariant<S>[], state: S): string[]` returns the names of the invariants that do not hold (E-20)
- typeTransitions: `type Transitions<Status extends string, Trigger extends string> = Readonly<Record<Status, Readonly<Partial<Record<Trigger, Status>>>>>` (E-20)
- fnTransition: `transition<Status extends string, Trigger extends string>(table: Transitions<Status, Trigger>, from: Status, trigger: Trigger): Status | undefined` returns `undefined` for an invalid transition, which `decide` turns into a rejection with the context's `invalidTransition` code (E-20, Sc L1-1)
- typeRejection: reused from `spec:kernel.outcome-model`, never redefined (D4, E-21)
- moduleBoundary: the kernel imports nothing from the command family, `DecisionActor` being its own structural type, and nothing from `convex/server` or `convex/values` at runtime, the type-only `Value` import being erased by the compiler; the adapter and the context boundary own every validator (D3, E-20, E-21, Thesis)
- purity: `decide` and `evolve` are deterministic functions of their arguments; they read no database, network, scheduler, environment or ambient auth and do not mutate their arguments (D3, Sc L0-1)

## Verification — reviewed

- A reviewer confirms that every decider in the example application satisfies `Decider<S, C, E, R>` by the type checker and that no decider imports a Convex module.
- A reviewer confirms that the adapter is the only production caller of `decide` and `evolve`.
