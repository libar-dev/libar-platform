---
id: spec:obligations.fan-out-and-chains
kind: rule
altitude: story
readiness: defined
relations:
  refines: spec:obligations.obligation-module
  dependsOn:
    - spec:obligations.record-contract
    - spec:command.command-pipeline
    - spec:command.actor-and-scope
  constrainedBy:
    - spec:facts.f13-transactions-have-limits
    - spec:facts.f08-scheduling-commits-with-mutation
    - spec:laws.law04-server-scoped-idempotency-key
    - spec:facts.f03-nested-run-mutation-partial-rollback
---
# Fan-out and reaction chains

Layer 3 · Detail: full where D13 rules; numbers provisional until the first experiment · Traces: D13, D6, D9, D10, D11, D12, D18, Law 4, F8, F13, E-6, E-31, E-51, E-54.

A command with a small static set of reactions creates their obligations in its own transaction, and that fan-out is part of the command's budget. The static set is the `createObligation` calls its executor body makes after the business change, not a field of the command declaration, because the declaration belongs to the transactional profile and imports nothing from this family. A larger or dynamic set is a separate durable task that snapshots its routing when it is created. A reaction that issues a command does so through the command pipeline with causation and a server namespace, and the chain has a bound against cycles. The large fan-out dispatcher is a Layer 6 capability whose trigger is static fan-out no longer fitting the transaction budget.

## Intent

- outcome: Fan-out is bounded and visible in the command's budget, dynamic routing is snapshotted, derived commands carry causation and a server namespace, and reaction chains cannot cycle (D13, D18)

### Open questions

- [non-blocking] Extension E-54: the doc bounds neither static fan-out, nor the dynamic fan-out batch, nor the chain depth, and it says where a static subscription's obligations are created without saying where the subscription is declared; this design allows 16 obligations per publishing transaction, 500 derived obligations per fan-out attempt with one child fan-out obligation per further page, and a causation depth of 8, and it reads the static subscription as the `createObligation` calls in the command's executor body, reviewed at build time and counted at creation, rather than a reactions field on the command declaration, because D12 lists no such field and the declaration is Layer 1 machinery that imports nothing from this family; the namespace a derived command carries, `worker`, is E-6's ruling on `spec:command.actor-and-scope`, and the path by which its causation reaches the pipeline, the internal entry's `causedBy` argument, is E-31's on `spec:command.command-pipeline`; the owner confirms the numbers and the reading (D12, D13, F13, Thesis, E-6, E-31, E-54)

## Rule

- [extension] A command's static reactions are the `createObligation` calls its executor body makes after the business change, each naming a handler key from the static handler registry, so the fan-out set is readable in the body at build time and never read from a runtime registry; the command declaration carries no reactions field, because it belongs to the transactional profile and imports nothing from this family (E-54, D12, D13, Thesis)
- A small static subscription creates its obligations in the publishing transaction, and that fan-out counts toward the command's budget of writes and schedules (D13, F8, F13)
- Larger or dynamic fan-out is a separate durable task: one obligation whose payload snapshots the routing at creation, so a subscriber added later never receives an older publication and one removed later still receives it (D13)
- A fan-out task creates the derived obligations in its body in bounded pages and creates one child fan-out obligation per remaining page, so no single transaction exceeds the schedule and write ceilings (D13, F13)
- A reaction that issues a command runs it through the command pipeline as a derived command; no handler inside a transaction issues commands (D10, D13)
- A derived command meets the pipeline's maintenance gate like any command; a `writePaused` or `capacity` refusal propagates to the wrapper, which defers the same attempt without counting it, so a write pause or a restore delays the reaction chain and never exhausts it (D9, D13, E-51)
- [extension] A derived command carries its causation as the `causedBy` argument of the internal entry, of kind `event` naming the obligation's source event, so every event it records names the publication event as its cause, and it carries the `worker` caller namespace that the reaction wrapper's trusted call assigns and a client cannot claim, the namespace E-6 rules for derived commands; the obligation and attempt behind it are found through its receipt, whose request key is the obligation's effect key (E-54, E-6, E-31, D13, D11, Law 4)
- A derived command carries a receipt keyed by the obligation's effect key, so a retried attempt after a lost result finds the receipt instead of running the intent twice (D6, Law 4)
- A derived command runs under the obligation's stored authority, not under the original user's session (D11, D13)
- Every obligation created by a reaction carries a causation depth one greater than the reaction's own; creating one past the bound is refused, and the refusing reaction's obligation goes to needs attention with reason `chainBound` (D13)
- A large fan-out dispatcher is installed only on its trigger: static fan-out no longer fits the transaction budget (D18)
- [extension] The static fan-out bound is 16 obligations per publishing transaction, counted by `createObligation` per mutation and refused with a plain error at the seventeenth, and reviewed against the executor body's calls (D13, F13, E-54)
- [extension] A fan-out attempt creates at most 500 derived obligations, each with its schedule, under the 1000 schedules per mutation and the write ceilings (D13, F13, E-54)
- [extension] The chain bound is a causation depth of 8 (D13, E-54)

## Design

- limitStaticFanOut: [extension] 16 obligations created in one publishing transaction, a provisional default, so a command's writes stay at the business change plus 16 inserts and 16 schedules; `createObligation` keeps a per-mutation count keyed on the mutation context and throws a plain error, a developer error, at the seventeenth call (D13, F13, E-54)
- staticReactionSite: [extension] the executor body of the publishing command calls `createObligation` once per static reaction after its context calls, inside the same top-level mutation, with `sourceEvent` naming one event the call returned in its `streams` entries and `causationDepth` 0; no declaration field, registry or subscription table names the reaction, so the transactional profile's declaration type stays free of this family (E-54, D12, D13, F8, Thesis)
- limitFanOutPage: [extension] 500 derived obligations per fan-out attempt, a provisional default; a snapshot with more recipients creates one child fan-out obligation per further page of 500, each with its own page cursor in its payload (D13, F13, E-54)
- limitChainDepth: [extension] 8, a provisional default; `causationDepth` of a root command's obligations is 0 (D13, E-54)
- typeCausation: `type Causation = { obligationId: Id<"obligations">; attemptNumber: number; depth: number }` is what a reaction body holds while it runs, from its `HandlerArgs`; it reaches the derived obligations the body creates as `causedByObligation` and `causationDepth` on the record, and it reaches the derived command's events only as the envelope's `causedBy` of kind `event` naming the publication event, so the envelope's union of `spec:context.event-envelope` gains no variant and the attempt is diagnosable from the receipt and the obligation, never from the envelope (D13, D2, E-26, E-31)
- derivedCommandCall: `await ctx.runMutation(internal.<module>.<name>Internal, { tenantId, namespace: "worker", actor: authority.actor, requestKey: effectKey, causedBy: { kind: "event", tenantId, contextId: sourceEvent.contextId, eventId: sourceEvent.eventId }, input })` from inside the reaction body, one call per derived command, where `authority` and `sourceEvent` are the obligation's, the internal entry is the one `internalCommand` of `spec:command.command-declaration` exports, and the pipeline's step 7 copies `causedBy` onto the `OperationRef`; a body that issues a derived command is therefore the one nested mutation D7 allows running another, because the body is already the wrapper's sub-transaction (E-54, E-6, E-31, D7, D13, F3)
- attemptDiagnosis: the derived command's receipt is keyed by tenant, `worker`, command type and the effect key, so `by_effect_key` on `obligations` answers which obligation issued it and that row's `attemptNumber` and `completionEvidence` name the attempt; in the other direction the obligation's `events` evidence names the events the derived command recorded, whose `operationId` finds its receipt through `by_operation`; no attempt field is added to the envelope or the receipt (D19, D6, D13, E-54)
- typeFanOutPayload: `type FanOutPayload = { kind: "inline"; value: { publication: { contextId: string; eventId: string }; recipients: { handlerKey: string; handlerVersion: number; effectKeySuffix: string }[]; page: number } }` (D13)
- derivedRequestKey: the request key of a derived command is the obligation's effect key, and the server builds the receipt key from tenant, the `worker` namespace of E-6, command type and that request key, so a retried attempt after a lost result replays the receipt (D6, Law 4, E-6)
- fanOutCommitRule: the derived obligations of one page and the child fan-out obligation for the next page commit in the fan-out attempt's nested body, so a failed page leaves no partial page (D13, F3)
