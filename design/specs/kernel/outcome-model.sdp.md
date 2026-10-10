---
id: spec:kernel.outcome-model
kind: rule
altitude: feature
readiness: defined
relations:
  refines: spec:platform.transactional-domain-platform
  decidedBy:
    - spec:decisions.d04-four-outcomes
    - spec:decisions.d07-rejections-thrown-not-stored
  constrainedBy:
    - spec:laws.law06-technical-failure-never-a-rejection
    - spec:facts.f14-convex-error-survives-nested-and-component-boundary
    - spec:facts.f13-transactions-have-limits
---
# The outcome model

Layer 0 · Detail: full · Traces: D4, D7, Law 6, F14, Probe 2, Sc L1-1, Sc L1-9, Sc L1-12, E-21.

Every command ends in exactly one of four outcomes, and each outcome has a fixed commit behavior. This Spec carries the four as rules and defines the `Outcome` union once, in the kernel, as the single type the persistence adapter returns and the command boundary of Package C maps to the wire. Two outcomes travel as values and two travel as throws: applied and business failure are returned, because they commit; rejection and technical failure are thrown, because nothing of theirs may commit. A transient refusal is not a fifth outcome but a retryable error the parent's admission step raises before any context runs.

The kernel defines the shapes and does not define wire codes. The closed error-code list and the `ConvexError` data shape at the public boundary belong to `spec:command.outcome-boundary` (E-5), which maps from the types below and adds nothing to them.

## Intent

- actor: The kernel and the persistence adapter, which produce outcomes; the command boundary, which maps them; every caller, which reads them (D4)
- problem: A boolean cannot tell a declined reservation that belongs in history from a refused request that must not commit, nor a transient capacity refusal from a business rejection; error handling then makes a business choice by accident (D4, Law 6)
- outcome: One `Outcome` union, defined here and nowhere else, gives every command exactly one of applied, business failure, rejection or technical failure, each with its commit behavior fixed (D4)
- value: Whether a refused request becomes a fact is visible in the command's name, never hidden in error handling; the boundary maps one union and every caller learns one shape (D4)
- risk: The standing cost is one closed union and one reserved-code convention that every context, the adapter and the boundary must honor (D4)
- assumption: A rejection thrown inside a context component arrives at the parent with its `data` intact; this is F14, which Probe 2 showed on the pinned backend (F14, Probe 2)

### Open questions

- [non-blocking] Extension E-21: the doc names the four outcomes and their commit behavior but not their TypeScript shape; this Spec fixes `Outcome<R>`, `Rejection`, `CommittedOutcome<R>`, `AffectedRef`, the rule that a committed outcome carries at least one event, and the three rejection codes the adapter reserves, `staleVersion`, `operationTooLarge` and `entityExists`, the last being the adapter's answer to a create planned at expected version 0 whose stream already exists, which is the uniqueness check D6 names for a client-generated entity ID; the owner confirms the shapes or renames the reserved codes before code names them (D4, D6, E-21)

## Rule

- Applied means events were recorded and state changed; it commits (D4)
- Business failure means something meaningful happened and belongs in history, such as `ReservationDeclined`; it commits like a success (D4)
- Rejection means the request is understood and refused; nothing commits (D4)
- Technical failure is an unexpected throw; everything rolls back and nothing is stored as a business outcome (D4, Law 6)
- A transient refusal for rate or capacity is a retryable error, never a stored rejection (D4, Law 6)
- A technical or transient failure is never stored as a business rejection (Law 6)
- Keeping a refused request as a fact is a business policy chosen per command; an order that waits for stock is a different command from one that rejects when stock is short, and error handling never makes that choice by accident (D4)
- A rejected command throws a structured `ConvexError`; the whole mutation rolls back, the caller receives the rejection and nothing is stored (D7)
- [extension] An applied or business-failure outcome carries at least one event, so applied always means the stream version advanced; a decision that has nothing to record is a rejection with a code the context documents (E-21, D4)
- [extension] The `Outcome` union is defined in this Spec; the adapter returns its committed half, the boundary maps it, and no other Spec defines a second one (E-21, D4)

## Design

The union below is the kernel's. Applied and business failure are the value a context operation returns to the parent, and the parent returns it, with the operation ID, to the caller. A rejection is a `Rejection` value wrapped in a `ConvexError` and thrown, so it crosses the component boundary as an error and rolls back the sub-transaction it came from. A technical failure is any other throw. The types import nothing from Convex at runtime; `Value` in `Rejection.details` is a type-only import that the compiler erases. The validators import `convex/values` and live in the context boundary's shared library, outside the kernel package, so the kernel's dependency check stays absolute.

- typeStreamVersion: `type StreamVersion = { tenantId: string; contextId: string; streamType: string; streamId: string; version: number }` (D2, D8)
- typeRejection: `type Rejection = { code: string; message: string; details?: Record<string, Value> }` where `Value` is `import type { Value } from "convex/values"`, the kernel's one compile-time Convex dependency, kept so that a rejection's details are Convex values by construction and the `ConvexError` that carries them never fails to serialize (D4, D7, F14, E-21)
- typeOutcome: `type Outcome<R> = { kind: "applied"; result: R; versions: StreamVersion[] } | { kind: "businessFailure"; result: R; versions: StreamVersion[] } | { kind: "rejection"; rejection: Rejection }` (D4, E-21)
- typeCommittedOutcome: `type CommittedOutcome<R> = Extract<Outcome<R>, { kind: "applied" | "businessFailure" }>` is what a context operation returns, because a rejection is thrown and never travels as a return value (D4, D7, E-21)
- technicalFailure: any thrown value that is not a `ConvexError` carrying a `Rejection`; no code constructs one on purpose, so it is not a union member (D4, Law 6)
- transientRefusal: a retryable error the parent's admission step throws before any context runs; its wire shape belongs to the boundary, and the kernel never raises one (D4, D6, Law 6)
- rejectionCodeStaleVersion: `"staleVersion"` is reserved for the persistence adapter's version conflict, thrown when a caller names an expected stream version that differs from the current one the indexed read shows (Sc L1-10, E-21)
- rejectionCodeOperationTooLarge: `"operationTooLarge"` is reserved for the adapter's refusal of an operation whose list exceeds the operation's declared bound (D10, F13, E-21)
- rejectionCodeEntityExists: `"entityExists"` is reserved for the adapter's refusal of a create: a planned command that names expected version 0 and finds the stream already present is answered with this code before `decide` runs, with `details.existing` naming the stream and `details.current` its version, so a UI double submit of a create resolves to one entity and the decider always decides a create against `initial()` (D6, Sc L1-4, E-21)
- rejectionCodeContextOwned: every other code is the context's own, declared beside its decider in lower camel case and documented with the command that raises it, such as `invalidTransition` or `insufficientStock` (D4, Sc L1-1, Sc L1-11)
- typeAffectedRef: `type AffectedRef = { contextId: string; streamType: string; streamId: string }` is the application identity of an affected stream, a `StreamVersion` without its tenant and version; a response's and a receipt's affected list is derived from the versions the operation returned, and no other Spec redefines the type (D2, D6, E-21)
- validatorAffectedRef: `const affectedRefValidator = v.object({ contextId: v.string(), streamType: v.string(), streamId: v.string() })` (D2, E-21)
- validatorStreamVersion: `const streamVersionValidator = v.object({ tenantId: v.string(), contextId: v.string(), streamType: v.string(), streamId: v.string(), version: v.number() })` (D8)
- validatorRejection: `const rejectionValidator = v.object({ code: v.string(), message: v.string(), details: v.optional(v.record(v.string(), v.any())) })` (D7, E-21)
- validatorCommittedOutcome: `const committedOutcomeValidator = v.object({ kind: v.union(v.literal("applied"), v.literal("businessFailure")), result: v.any(), versions: v.array(streamVersionValidator) })` (D4)
- throwShape: `throw new ConvexError(rejection)` with the `Rejection` value as the error's `data`, which must be a Convex value and is (D7, F14)
- assumptionAcrossBoundary: the `data` of a thrown `ConvexError` arriving intact through a component boundary is F14; the application-errors page states only that the exception bubbles through `runQuery`, `runMutation` and `runAction`, and Probe 2 showed the data intact on the pinned backend (F14, Probe 2)

## Verification — reviewed

- A reviewer confirms that no other Spec in the corpus defines a second outcome union and that `spec:command.outcome-boundary` maps from this one.
- A reviewer confirms that the `convex-test` tier covers every outcome kind and the three reserved codes.
