---
id: spec:kernel.domain-kernel
kind: behavior
altitude: feature
readiness: defined
relations:
  refines: spec:platform.transactional-domain-platform
  dependsOn: spec:kernel.outcome-model
  decidedBy:
    - spec:decisions.d03-events-only-source-of-next-state
    - spec:decisions.d04-four-outcomes
  constrainedBy:
    - spec:laws.law03-events-only-source-of-state
    - spec:laws.law10-replay-never-runs-commands-or-effects
    - spec:laws.law02-state-and-events-commit-together
---
# The domain kernel

Layer 0 · Detail: full · Traces: D3, D4, D5, Law 3, Law 10, Sc L0-1, Sc L0-2, E-1, E-20.

The kernel is the pure TypeScript module of a bounded context: its commands, events, `decide`, `evolve`, initial state, invariants and small state machines. It owns the domain decision and nothing else. It reads no database, network, scheduler, environment or ambient auth; time and outside facts enter as inputs; the next state is `fold(evolve, state, newEvents)` and nothing else. The kernel is usable before any Convex code exists, which is why its two scenarios run in the domain tier with no backend at all.

Its boundary is the decider contract. Above it sits the context component of Layer 1, whose persistence adapter loads current state, calls `decide`, folds the new events, appends them and saves the result inside one component sub-transaction. Below it sits nothing. The kernel imports no Convex module; the context boundary supplies validators for command input and event payloads, and the adapter supplies the decision context.

## Intent

- actor: The domain author who writes a context's decider, and the persistence adapter that calls it (D3)
- problem: Today's platform has two authorities for state, a `stateUpdate` the handler saves and an `evolve` beside it, and nothing keeps them in step; a decider that reads the clock or a table cannot be evaluated twice with the same answer, and a rebuild from the creation event has no defined start (D3, Sc L0-1, Sc L0-2)
- outcome: A decider is a pure function of state, command and decision context that returns events and a result or a rejection; the next state is the fold of `evolve` over the new events; rebuilding a stream from its events gives the saved business state and the same stream version, and that equality is a test (D3, Law 3, Sc L0-2)
- value: State and history agree by construction, domain tests need no backend, and a decision can be reasoned about, replayed and refuted without infrastructure (D3)
- risk: Every change to `evolve` must still turn old events into the state saved today; the tool that pays for a change of meaning is the baseline event, whose cost D5 carries (D3, D5)
- risk: The contract fixes a shape that every context must fit; a domain that needs a decision across several streams at once does not fit it and waits for its trigger (D3, D18)
- assumption: The four outcomes and the reserved rejection codes are the ones the outcome model defines; the kernel adds no fifth (D4)

### Open questions

- [non-blocking] Extension E-20: the doc gives `decide(state, command, context)`, `fold(evolve, state, newEvents)` and the purity rule, and nothing about the concrete generic parameters, the fields of the decision context, the shape of a domain event, or the state-machine and invariant helpers; the decider contract fixes them and the owner confirms them before code names them (D3, E-20)
- [non-blocking] Extension E-1: the doc leaves open whether the interface gains `initial()` or `evolve` accepts an empty state; the initial-state decision rules for `initial()` provisionally (D3, E-1)

## Behavior

- rule: `decide(state, command, context)` returns events and a result, or a rejection; it never returns a separate state patch (D3)
- rule: The next state is `fold(evolve, state, newEvents)`; the persistence adapter computes it and saves it, and the decider never computes it (D3, Law 3)
- rule: Commands load current state and apply only the new events; they never replay history (D3)
- rule: Rebuilding a stream from its events gives the saved business state and the saved stream version, and that equality is a test (D3, Sc L0-2)
- rule: Pure domain code reads no database, network, scheduler, environment or ambient auth (D3, Sc L0-1)
- rule: Time and outside facts enter as inputs through the decision context (D3)
- rule: Facts that matter historically, such as accepted price, currency or policy version, are captured in events and never re-fetched during replay (D3, Law 10)
- rule: Replay and rebuild never run original commands or repeat external effects; `evolve` is the only code that runs during a rebuild (Law 10)
- rule: Evaluating a decision twice with identical inputs gives identical output, leaves the inputs unchanged and performs no I/O (Sc L0-1)
- rule: A rebuild starts from `initial()` or, where the stream has one, from the state its latest baseline event holds, and folds the events after that point (D3, D5, E-1)
- rule: A decision ends in one of the four outcomes; the kernel returns applied and business failure with their events, returns a rejection as a value the adapter throws, and leaves technical failure to be whatever else throws (D4)
- rule: An invalid state transition is a rejection with a documented code; no state or event changes (D4, Sc L1-1)
- rule: Layer 0 is usable before Layer 1 exists; its tests are pure and its fixture app is separate from the example app (Thesis, Acceptance scenarios)
- rule: [extension] The kernel module has no runtime import from `convex/server` or `convex/values`; its one compile-time Convex dependency is `import type { Value } from "convex/values"` for `Rejection.details`, which the compiler erases, and validators for command input and event payloads live at the context boundary while the adapter supplies the decision context (E-20, E-21, D3)
- rule: [extension] A small state machine is a transition table and a pure lookup that returns the next status or nothing; `decide` turns nothing into a rejection (E-20, Sc L1-1)
- rule: [extension] An invariant is a named predicate over state; the adapter checks the declared invariants after the fold and treats a violation as a technical failure, because a decider that emits events breaking its own invariant is a defect, not a business outcome (E-20, D4)
- flow: The adapter loads current state or takes `initial()` for a stream that does not exist yet (D3, E-1)
- flow: The adapter builds the decision context from the transaction's time, the server-established actor and the facts the parent captured (D3, D11)
- flow: `decide(state, command, context)` returns events and a result, or a rejection (D3)
- flow: On a rejection the adapter throws it and nothing is written (D4, D7)
- flow: On events the adapter computes `fold(evolve, state, events)`, checks the invariants, appends the events with the expected version and saves the folded state (D3, Law 2)
- flow: A rebuild folds `evolve` from `initial()` or the latest baseline over the stored events and compares with the saved state and version (D3, D5, Sc L0-2)

## Design

The kernel is one TypeScript package per context, or one module inside the context's component, with no runtime dependency beyond the language. Its exports are the types of the decider contract, the context's deciders, its event and command types, and the helpers `fold`, `rebuild`, `transition` and `checkInvariants`. Everything below it is data; everything above it is the context component.

- transactionBoundary: none; the kernel runs inside whichever transaction calls it and opens none of its own (D3)
- convexSurface: none; the kernel registers no Convex function and imports no Convex module at runtime (D3, E-20)
- convexTypeImport: the kernel package lists `convex` under `devDependencies` only and compiles with `verbatimModuleSyntax`, so `import type { Value } from "convex/values"` is the only form the compiler accepts for the type and the emitted module carries no `convex` import; a value import of `convex/values` or `convex/server` is a type error and a dependency-check failure (E-20, E-21, D3)
- moduleShape: one module per context exporting its deciders and types, plus the shared kernel library that exports the contract types and `fold`, `rebuild`, `transition` and `checkInvariants` (D3, E-20)
- actorView: the decision context's actor is the kernel's structural `DecisionActor`, which the command family's `Actor` satisfies; the kernel therefore depends on no Layer 1 Spec and stays usable before Layer 1 exists (E-20, Thesis)
- purityCheck: a domain test evaluates `decide` twice on frozen inputs and asserts deep equality of the outputs and of the inputs before and after, with an I/O spy that observes zero calls (Sc L0-1)
- rebuildCheck: a domain test runs a command sequence incrementally through `decide` and `fold`, then folds `evolve` from `initial()` over the collected events and asserts deep equality of state and equality of the event count with the stream version (Sc L0-2)
- eventShape: a domain event carries `eventType`, `eventSchemaVersion`, `payload` and an optional `occurredAt`; the envelope fields of D2 are added by the adapter, never by the decider (D2, E-20)
- outcomeSource: the `Outcome` union and the reserved rejection codes are defined in `spec:kernel.outcome-model` and reused here (D4, E-21)
- multiStreamDecisions: a decision that must hold against several streams at once is out of the kernel's scope until the explicit-scope trigger of D18 fires; until then an operation decides per stream and the parent or the context's plan sequences the streams (D18, D10)

## Example space

```gwt-vocabulary
Given a decider whose stream starts from its initial state
And a sequence of {commands:number} valid commands, each with its decision context
And every input is frozen before the kernel runs
When the kernel is exercised as {exercise:"evaluate one decision twice"|"run the commands incrementally then rebuild from the events"}
Then the outputs of the two evaluations are {outputs:"identical"|"different"}
And the inputs afterwards are {inputs:"unchanged"|"mutated"}
And the number of I/O calls observed is {io:number}
And the rebuilt business state {rebuilt:"equals"|"differs from"} the incrementally computed state
And the rebuilt stream version is {version:number}
```

## Verification — reviewed

- A reviewer confirms that the kernel package has no runtime import from `convex/server`, `convex/values` or any I/O library, by a dependency check in CI that reads the emitted modules and the package's `dependencies`, and that its only compile-time Convex import is the type-only `Value`.
- A reviewer confirms that every decider in the example application declares `initial`, `decide` and `evolve` and no state patch, and that the rebuild equality test exists for every stream type.
