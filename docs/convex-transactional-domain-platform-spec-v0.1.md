# Convex Transactional Domain Platform
## Layered target specification v0.1

**Date:** 2026-09-29  
**Status:** Proposed target architecture; not an implementation or a production-readiness claim.  
**Audience:** Product/platform architect, implementers, reviewers, and coding agents.  
**Basis:** The preceding review of `libar-ai/convex-event-sourcing`, branch `feature/fix-wave-1`, pinned at `3ca2e65db35b3061843900a4008f60bd64ea4c21`, and current Convex primary documentation.  
**Purpose:** Provide one coherent, independently readable design against which a prototype or alternative implementation can be tested.

The requirements below are recommendations for a new design. They are not claims that the reviewed branch already implements them. The Atlas remains evidence about the earlier implementation, not the specification for this target. Some Atlas views describe a September 24 snapshot; the reviewed branch contains subsequent fixes. This document deliberately does not reproduce that issue catalogue.

**Read in order:** Sections 1–3 establish the whole picture; sections 4–10 define progressively usable layers; sections 11–14 provide the operational, verification, and adoption contracts. Sources are collected at the end rather than distributed as a navigation graph.

---

# 1. Architectural decision

Build a **transactional domain platform with event history and optional durable execution**.

Its default operation is a single Convex mutation that authorizes a command, makes a domain decision, persists current state and its historical facts, updates any essential read models, and records the command outcome. A second transaction exists only when there is a reason to wait, distribute workload, or interact with an external system.

> Ownership follows bounded contexts. Atomicity follows the business operation. Asynchrony follows a concrete need to defer work.

The target is not a general event-broker replacement, an aggregate-object framework, or a second application server inside Convex. It preserves DDD vocabulary, invariant ownership, CQRS contracts, reconstructible event history where promised, and reliable long-running work without requiring every feature to use every mechanism.

## 1.1 The three usable profiles

| Profile | What is installed | What an application can do |
| --- | --- | --- |
| Transactional application | Layers 0–2 | Execute rich domain commands, maintain history, compose isolated contexts atomically, and serve consistent reactive views |
| Durable application | Transactional profile plus Layer 3 | Reliably accept background obligations and execute local reactions or external effects with recovery |
| Workflow/agent application | Durable profile plus the relevant parts of Layers 4–5 | Run long processes, wait for humans, reconcile providers, and let constrained agents use normal commands |

Advanced read processing in Layer 6 is optional for all three profiles. Scale and independent-trust extensions in section 10 are conditional capabilities, not a final layer every application must eventually acquire.

**A lower profile MUST NOT import, mount, configure, or operate the higher profile's machinery.** Supporting an optional capability does not justify dormant tables, callbacks, or flags in the baseline.

## 1.2 One refinement beyond the preceding review

For this clean target, **each bounded context owns its event journal together with its current command state**. Both are written inside the context's mutation API. Shared journal code is a library; a deployment-wide event-store component is not mandatory.

This makes the essential invariant local: a sanctioned context mutation cannot return after updating business state without recording its required events. The parent transaction still composes several contexts and application read models atomically.

Cross-context history is a read capability assembled through context APIs. It is not a shared counter that every write must acquire. During migration, the existing central event-store component can remain behind an adapter, provided it satisfies the same contracts. Do not move retained history merely to match a folder diagram.

The cost of this choice is explicit: history export and cross-context inspection must merge context-owned data; there is no native application-wide event offset. That is acceptable for the baseline. A single total-order feed returns only when a concrete consumer needs it.

## 1.3 The default topology

```text
Client, integration, or authorized agent
                  |
          Typed command boundary
                  |
       ONE PARENT CONVEX TRANSACTION
       |          |                |
       |          |                +-- Command outcome / idempotency
       |          +-- Essential application read models
       +-- Context A API                 Context B API
           |                                 |
           +-- Pure decisions                +-- Pure decisions
           +-- Current state                 +-- Current state
           +-- Private event journal         +-- Private event journal

       Optional, still committed in this transaction:
           Durable obligation + scheduler/Workpool handoff
                              |
                       ASYNC BOUNDARY
                              |
                  Local worker or external action
                              |
                   Durable result / reconciliation
```

The application is a modular monolith with runtime-enforced component storage boundaries. It does not claim separate component hardware, separate deployment failure domains, or transactions across deployments.

---

# 2. Platform facts and application responsibilities

The following platform facts were checked against Convex documentation on the specification date. They are not guarantees invented by this design.

| Fact | Consequence for this design | Source |
| --- | --- | --- |
| Mutations are serializable transactions using OCC | Read and enforce an invariant in the mutation; do not create a second lock protocol by default | S1 |
| Component mutation calls compose transactionally; a thrown child can roll back as a subtransaction | Several contexts can commit together; a deliberate child boundary can roll back effects while a parent records a rejection | S2, S3 |
| Components isolate tables and expose functions; component `ctx.auth` is unavailable | Authenticate/authorize in the parent and explicitly pass server-established execution identity | S2, S4 |
| Queries are reactive | Expose authorized query contracts; no custom event-to-WebSocket layer is necessary for ordinary screens | S5 |
| Scheduling from a mutation commits atomically with that mutation | A durable obligation and its initial handoff can commit together | S6 |
| Scheduled mutations retry internal Convex errors, but developer errors can terminate them; scheduled actions are not automatically retried | Business recovery and external-effect safety still require an application contract | S6 |
| An action's separate mutation calls are separate transactions | An action is not a unit of work or a substitute for the command transaction | S7 |
| Backup data does not include pending scheduled functions or application code/configuration | Restore must reconstruct pending work from application records | S8 |
| Documents, transactions, and scheduling have finite limits | All bulk operations, scans, fanout, and recovery passes need explicit tested bounds | S9 |

The design supplies the missing semantics: command identity, authorization scope, history completeness, projection policy, external-effect identity, replay safety, and operator recovery. It does not reimplement transaction scheduling or claim that managed infrastructure eliminates domain modeling.

## 2.1 Non-negotiable laws

| ID | Requirement |
| --- | --- |
| CORE-01 | All business writes go through a sanctioned context/domain operation; no public generic patch endpoint exists. |
| CORE-02 | State and required domain events commit together. An unexpected persistence failure rolls back the whole command. |
| CORE-03 | A reconstructible domain has one transition authority: emitted events determine the next business state. |
| CORE-04 | Every externally retryable command has a stable, server-scoped idempotency identity. |
| CORE-05 | Authorization precedes execution and disclosure of cached outcomes. |
| CORE-06 | Technical/transient failures are not persisted as terminal business rejections. |
| CORE-07 | An asynchronous obligation is not reported as a completed business effect. |
| CORE-08 | Every installed durable capability includes recovery, inspection, retention, and compatibility behavior. |
| CORE-09 | A domain invariant never depends on an asynchronously stale read model. |
| CORE-10 | Replay never runs original commands or repeats external effects. |
| CORE-11 | Every query and command involving tenant data is explicitly tenant-scoped. |
| CORE-12 | Each retryable obligation has one retry authority. Transport and workflow retries must not multiply it invisibly. |

These twelve laws are the stable review surface. Detailed tests below explain how to prove them. Do not multiply them into hundreds of overlapping registry entries.

---

# 3. Construction order and stopping points

| Layer | Build | Independently usable result | Completion gate |
| --- | --- | --- | --- |
| 0. Domain | Commands, events, reducers, invariants, small FSMs | Pure domain library | Deterministic decisions and transition-law tests |
| 1. Transactional context | One component, journal/state persistence, authorized commands, idempotency, queries | Working single-context application | Atomicity, identity, tenant isolation, and history reconstruction proven |
| 2. Composed application | Second context, atomic use cases, essential read models, minimal composition, offline rebuild | Practical multi-context product | Cross-context rollback and consistent views; production-shaped smoke and restore exercise |
| 3. Durable obligations | One local reaction and one external effect, recovery and operator exits | Reliable background/integration application | Duplicate, crash, timeout, replay, restore, and exhaustion tests |
| 4. Processes | Workflow, durable business process, time/human waits, compensation | Long-running business application | Resume, cancellation, approval races, and deployed-version compatibility |
| 5. Agents | Scoped proposals, ordinary command execution, budgets/provider accounting | Governed agentic product | No bypass; approval and budget enforcement; ambiguous-provider settlement |
| 6. Advanced reads | Coalesced recomputation, ordered consumers, or online rebuild as needed | Scalable specialized read processing | Mode-specific ordering, freshness, generation, and cutover proof |

Build one thin working use case through a layer before making the layer generic. Layers 4, 5, and 6 are not a compulsory sequence: an application can use an ordered consumer without agents, and can run an agent using only transactional views.

Security, bounded resource use, useful errors, and tests begin in Layer 1. They are not a deferred production-hardening layer. Operations are introduced with the capability that creates an operational obligation.

**Recommended first stopping point:** Layer 2, with a two-context reference application and no background jobs required for its core business correctness or essential screens.

---

# 4. Layer 0 — Domain decisions and historical truth

## 4.1 Terms

A **bounded context** owns its vocabulary, business state, invariants, and journal API. A **command** expresses an intended business operation. An **event** records a fact the domain has accepted. A **stream** is the ordered history of an identified domain subject; it is not automatically the complete transaction boundary. **CMS** means Command Model State: the current state used by commands. A **use case** may coordinate several context operations in one parent mutation.

No aggregate base class is required. An invariant can involve one entity, several entities in one context, or an explicitly composed operation across contexts. The data actually read by the transaction must cover that invariant, including indexed absence/range checks when applicable.

## 4.2 Decision interface

The following TypeScript is an interface sketch for the proposed design, not an existing package API:

```ts
export type Decision<E, R> =
  | {
      kind: "record";
      outcome: "applied" | "business_failure";
      events: readonly E[];
      result: R;
    }
  | {
      kind: "reject";
      code: string;
      message: string;
    };

export interface DecisionContext {
  readonly now: number;
  readonly operationId: string;
}

export interface DomainBehavior<S, C, E, R> {
  decide(state: Readonly<S>, command: Readonly<C>, ctx: DecisionContext): Decision<E, R>;
  evolve(state: Readonly<S>, event: Readonly<E>): S;
}
```

Pure domain code MUST NOT perform database, network, scheduler, or environment access. Time and any required external facts enter as explicit inputs. Decisions MUST NOT mutate their inputs.

`record/business_failure` is for facts such as `ReservationDeclined`. `reject` is for disallowed intent with no business transition. An unexpected exception is neither: it is a technical failure.

A no-op success can have no events only when business state does not change. Technical metadata such as tracing is not a reason to fabricate a domain event.

## 4.3 One state-transition authority

For a reconstructible domain:

```text
nextBusinessState = fold(evolve, currentBusinessState, emittedEvents)
```

The persistence adapter stores that resulting state. The decider does not also return an independently authored state patch. This removes a common opportunity for state and history to disagree.

Commands load CMS and apply only the newly produced events. They do not replay the historical stream on the normal path. Historical reconstruction is an inspection/rebuild operation.

Persistence fields such as internal document IDs, projection generations, or access-cache metadata are outside the business-state equality. Any exclusion from reconstruction MUST be explicit. State-schema conversions that change representation but not business meaning are versioned migrations, not fictitious business events.

A complete sequence reconstructed from its creation/import event must match the current business state under the applicable event readers and reducer semantics. Capture historically relevant decisions—accepted price, currency, policy version, approved document revision—in facts rather than re-fetching current values during replay.

## 4.4 Where full history is and is not promised

The domain profile defaults to reconstructible business history for the streams it manages. It does not require every application table to use that profile. UI preferences, ephemeral presence, disposable caches, and similar state can use ordinary Convex mutations with authorization and schemas.

An audit-only domain is permitted only as an explicit choice: its events are not advertised as sufficient for reconstruction. It does not inherit event-only rebuild or point-in-time guarantees. This is a boundary decision, not an automatic fallback when a reducer is incomplete.

## 4.5 Acceptance

Given a creation/import event and accepted command sequence, replay produces the same business state as incremental execution. Rejected commands produce no transition. A recorded business failure produces the documented historical fact. Invalid FSM transitions are rejected. Repeated evaluation with identical inputs produces identical decisions.

Use a small domain FSM when it communicates legal transitions; do not impose a general workflow engine on a three-state entity.

---

# 5. Layer 1 — A complete transactional context

## 5.1 Storage ownership

Each context component initially owns its domain CMS tables, a journal, and stream metadata. A shared journal library implements common append/read validation; it does not require another deployed component.

| Data | Owner | Necessary purpose |
| --- | --- | --- |
| Domain CMS | Context component | Current decision state and revision |
| Journal events | Context component | Immutable business facts |
| Stream metadata | Context component | Stream identity, current revision, and enumeration, including retained/tombstoned subjects |
| Command receipts | Parent application | End-to-end idempotency and original command outcome |
| Access membership/grants | Parent or dedicated access context | Authoritative authorization, independent of delayed projections |

A domain stream revision in CMS and stream metadata must agree when both representations are present. A journal helper performs the complete update atomically. For a simple context, stream metadata can be consolidated with CMS where enumeration and deletion semantics remain correct; this is a physical storage optimization, not a weakened contract.

Tenant identity is required for tenant-owned records. Even a single-tenant prototype uses an explicit server-established scope. Do not use absent `tenantId` as a wildcard.

## 5.2 Event envelope and ordering

| Field | Meaning |
| --- | --- |
| `eventId` | Stable application event identity |
| `tenantId`, `contextId` | Ownership scope |
| `streamType`, `streamId`, `streamRevision` | Exact order within a subject's history |
| `eventType`, `eventSchemaVersion` | Historical contract |
| `operationId` | Root accepted command/use-case identity |
| `correlationId` | End-to-end diagnostic grouping |
| `causedBy` | Immediate cause, such as a command or triggering event |
| `actor` | Server-established actor kind/identity and relevant delegation reference |
| `recordedAt`, optional `occurredAt` | Recording time and separately established domain occurrence time |
| `payload` | Validated, bounded fact data |

`streamRevision` advances by the number of appended stream events. Identifier uniqueness and expected revisions are enforced through indexed reads and writes in the same transaction; an index alone is not a SQL-style unique constraint.

Event references crossing context boundaries include `(tenantId, contextId, eventId)`; a private database ID is not the portable business identity. No deployment-wide ordering token is required. Timestamps, `_creationTime`, and UUID ordering MUST NOT be used as proof that a live consumer has observed every committed event. Cross-stream event relationships use operation identity and explicit causality. A root command receipt may retain its bounded set of affected stream revisions/event references without declaring a global log order.

Start with indexes needed for stream replay, event identity, and stream enumeration. Add trace or event-type indexes only when an actual query needs them. Context APIs return DTOs and application IDs; private Convex document types do not cross the component boundary.

## 5.3 Command identity and receipt

Every public business command requires a stable client request key. The server constructs the actual idempotency scope:

```text
(tenantId, callerNamespace, commandType, requestKey)
```

The caller namespace is derived from authenticated user/service identity or an internal workflow/agent authority. A public caller cannot choose the internal system namespace.

The fingerprint includes a fingerprint version, the normalized request contract version, and all business-significant input, including any explicitly reviewed expected revision. It excludes diagnostic retry timestamps and correlation hints. Its canonical encoding must support the values the command contract allows; do not silently coerce bigint or other non-JSON values.

The receipt stores the scope/key, fingerprint, operation ID, original result, affected revisions, and a defined replay horizon. It need not have a long-lived `pending` state for a one-transaction command. Concurrent identical requests are serialized by the database read/check/insert protocol: only one business effect may commit.

For a duplicate, return the original committed outcome after checking current authorization to disclose it. A reused key with a different payload is a conflict. Do not execute the changed request or reinterpret the old request through newly changed business defaults.

If a retry contract expires, it must be explicit. For irreversible actions, retain a compact identity/tombstone or rely on an equally strong domain uniqueness rule; deleting receipts must not silently permit repetition. Global cross-tenant idempotency is not the default.

## 5.4 Exact transaction algorithm

The public boundary performs authentication, tenant resolution, authorization, input validation, and the receipt lookup. Rate admission for new intent happens after a valid duplicate can be recognized. Transient admission refusal throws a retryable error and does not retain a terminal command outcome.

It then invokes one registered internal **command-body mutation** as a deliberate subtransaction. That body calls context operations, applies essential read-model changes, and—when installed—accepts required durable obligations. Ordinary implementation helpers inside this body are plain TypeScript function calls.

On success, the outer mutation records the successful outcome and returns. Everything commits in one top-level transaction.

On business rejection, the command body throws a dedicated structured rejection value. The outer boundary catches only that known result, after the entire command body has rolled back, and stores a rejection receipt. On any unexpected/technical error, the outer boundary throws so all writes, including receipts, roll back.

```text
PUBLIC MUTATION — one top-level transaction
  authenticate → authorize → validate → check receipt
  try:
      runMutation(commandBody)          // intentional subtransaction
          context writes + journals
          essential read models
          optional durable obligations
      record committed receipt
  catch known domain rejection:
      // the entire body has already rolled back
      record rejected receipt
  catch anything else:
      throw                            // top-level rollback
```

This child boundary has a specific purpose: it permits durable rejection recording after rolling back earlier context work. It is not a reason to turn each helper into another registered function. A catch around an ordinary helper does NOT undo its earlier database writes.

The structured rejection must survive actual Convex function serialization; that exact behavior is a native acceptance test. Do not rely on a custom JavaScript prototype crossing component boundaries.

## 5.5 Context API guarantee

A context command validates its input, loads current state, decides, folds its events, and persists both CMS and journal before returning event/transition DTOs to the parent. It exposes no separate business-state-only mutation.

A parent cannot read private context tables. Context-to-context coordination occurs through the parent use case, not by granting peer access to private schemas. Trusted parent code remains part of the application trust boundary: this is protection from unauthorized clients and accidental cross-module access, not a claim to withstand a malicious deploy administrator.

The parent is responsible for its own receipts and read models. Build-time import rules and integration tests ensure every sanctioned writer uses the complete use-case path. Context-local journal integrity remains protected even when the context API is called directly by trusted parent code.

## 5.6 Query contract

Provide typed, authorized queries immediately. A query can return a context's deliberately exposed DTO directly; it does not need a duplicate projection table simply because the platform uses CQRS.

Read/write separation means distinct contracts and responsibilities. It does not mandate a second physical representation for every field. Avoid exposing CMS as a generic database record. Query DTOs may omit secrets, rename fields, and include safe derived values.

Reactive subscriptions are state synchronization, not durable event subscriptions. They are sufficient for the ordinary Layer 1 UI.

## 5.7 Layer 1 gate

Demonstrate one complete domain operation, same-key retries after a lost response, different-payload reuse, tenant isolation, stale expected-revision rejection, fault injection after state/journal writes, and reconstruction equality. A pure local command requires zero asynchronous jobs and no application-managed recovery records.

---

# 6. Layer 2 — Composed use cases and useful CQRS

## 6.1 Cross-context application services

Add a second context only when a meaningful ownership/vocabulary boundary exists. Keep application orchestration in a small parent use-case function. The function can invoke several context mutations inside its command-body subtransaction.

A context operation is not a new public command merely because the use case calls it. One `PlaceOrder` request has one externally meaningful idempotency receipt; internal domain steps do not automatically each acquire a command-bus lifecycle.

The use case MUST NOT catch a later context rejection and return success after earlier context writes. Translate a rejected context result into the command-body rejection described in Layer 1 so all prior body effects roll back.

Where a business failure itself must be retained, model the entire intended outcome explicitly. For example, a persisted order request with `fulfillmentStatus: awaiting_stock` is a different command contract from atomic placement that rejects unavailable stock. Do not let error handling choose that business policy accidentally.

## 6.2 Worked baseline: place a complete order

**Contract:** Place an order with authoritative pricing and atomically commit its inventory allocation, or reject without an order/allocation. No payment provider or waiting period is involved in this baseline.

The request contains a stable request key, product IDs and quantities, and any approved quote/version reference. A client-submitted price is not authoritative. Monetary values use an explicitly chosen exact representation and currency rules, not accidental floating-point arithmetic.

Inside the command body, read the necessary product/quote and inventory facts through context APIs, validate the complete order, commit the domain transitions, and return their facts. The Orders context records `OrderPlaced`; Inventory records the allocation facts required for its subject histories. The parent maintains the essential order-summary DTO/table once and records the public command outcome.

This is one top-level transaction even when it makes multiple component calls. It need not collapse all history to one event. Per-product stock facts can remain, while expensive command orchestration and screen projection work happen once per business request.

**Complexity budget:** Public command transactions are O(1); input validation, affected stock records, and required domain events can be O(N). Core projection job count is zero. O(N) business work is acceptable; O(N) repetitions of general-purpose orchestration are not the default.

A maximum-size request is validated against the actual document/transaction budget. Splitting one intended atomic placement over several transactions is not a transparent optimization. Either reject oversize input or introduce a separately specified import/process command with honest partial-progress semantics.

## 6.3 Read-model selection

| Read contract | Default implementation | Reason to materialize |
| --- | --- | --- |
| One entity detail | Authorized component query returning a DTO | Expensive derivation or a separately optimized shape |
| Essential list/summary | Indexed CMS-derived DTO or transactional application projection | Avoid repeated joins/scans and simplify public queries |
| Small cross-context view | One parent query composing bounded component reads, or transactional projection | Measured cost or fanout justifies stored denormalization |
| Broad/reporting view | Not part of the baseline | Use Layer 6 or an external analytical store when needed |

A projection is explicitly named and versioned. A query is not allowed to pretend that an optional asynchronous projection is authoritative for command decisions.

Transactional projections run as ordinary deterministic handlers in the command-body transaction. All writers affecting them must use the same sanctioned dispatch path. Updating a projection MUST NOT recursively issue new commands or create hidden business side effects.

For baseline entity projections, share reducer/projection logic between live update and rebuild. A cross-context view should usually recompute from authoritative current DTOs in a bounded transaction, rather than require an artificial global event order.

## 6.4 Consistency contract

After a successful command, a subsequent authorized query sees the committed essential state or a later legitimate state. It does not wait for a background projection. A concurrent later command may change the entity before that query, so the contract is not that every subsequent read returns the exact original response forever.

The response includes affected revisions. A query may expose a source revision when clients need to compare freshness. Do not create a global command-status polling protocol for a view that is already transactionally maintained.

Optional optimistic UI can improve interaction, but it is a client presentation technique, not the source of domain truth. There is no mandatory committed-event overlay needed to hide baseline projection lag.

## 6.5 The smallest useful module system

A module owns its schemas, domain operations, journal readers, query contracts, and optional transactional projections. The application owns cross-context use cases and their authorization.

A single authoritative command definition supplies its name, input/output contract, executor reference, permission policy, and required projections. Static exported Convex functions remain visible in source and code generation. Do not assume Convex can discover arbitrary dynamically created functions from a runtime registry.

Start by reusing schema values, inferred types, typed generated references, and a small composition helper. When two working modules establish the repeated pattern, generate boring endpoint/registration artifacts from those declarations. Regeneration must be deterministic and checked in CI. A class may group a module's definitions, but it has no background lifecycle and holds no correctness-critical global mutable state.

Do not build a decorator framework, service locator, reflection registry, or general DI container first. Explicit constructor/argument injection of ports is enough. The domain remains independent of Convex; the adapter can be honestly Convex-specific.

Use one canonical schema representation for a command. Reuse it at boundaries or generate the supported structural validators; run semantic refinements explicitly. A supposedly universal schema converter that silently drops refinements is unacceptable. Runtime validation at different trust boundaries is legitimate; manually authoring the same shape in several places is not.

## 6.6 Reference layout

Logical modules need not become separate npm packages immediately.

```text
packages/
  domain/                         # Pure decisions, event types, reducers, small FSM helper
  convex-domain/                  # Journal/command adapters; optional modules as subpaths
apps/
  reference/
    convex/
      convex.config.ts
      schema.ts
      access.ts
      commands.ts                 # Thin public command exports
      commandBodies.ts            # Deliberate rollback subtransactions
      composition.ts              # Authoritative module/use-case composition
      components/
        orders/                   # Private schema, operations, journal, DTO queries
        inventory/
      useCases/
        placeOrder.ts
      views/
        orderSummary.ts
      maintenance/                # Scoped rebuild/export/repair functions
    frontend/
    tests/
      domain/
      integration/
      acceptance/
fixtures/
  platform-native/                # Dedicated kernel test application, not the product example
```

An adopted optional module adds only its own implementation, tables, and static bindings. The source layout is illustrative; this specification tests responsibilities and behavior, not exact filenames.

## 6.7 Recovery and rebuild before advanced machinery

The Layer 2 application must support journal export, stream verification, and rebuild of its declared projections. The first rebuild implementation is deliberately **offline for a scoped tenant/context**, not a partially correct online algorithm.

An operator enters an audited maintenance mode whose gate is read by every sanctioned writer in that scope. Existing/parallel writers conflict with the gate transition under OCC or finish before the frozen state is established. Later background writers must also obey or be fenced/drained by the maintenance protocol. An authorized maintenance executor is the explicit exception.

With writes frozen, enumerate streams and their final revisions, replay/recompute into a separate projection generation in bounded resumable batches, verify it, switch the active generation atomically, and reopen writes. A failed rebuild leaves the old generation intact and the scope's maintenance status visible. The operator can safely resume or abort; no automatic reopening while data is inconsistent.

Stream enumeration uses a stable index/keyset or a frozen manifest. The lack of a global sequence causes no tailing gap because the chosen scope is not changing. A cross-context current-state view is rebuilt from that scope's authoritative state; historical cross-context time travel is not implied.

Changing event readers, CMS schemas, or reducer meaning requires fixtures and a migration plan. Introduce new event schemas without rewriting old facts by default. Do not claim that adding a `schemaVersion` field alone implements schema evolution.

## 6.8 Layer 2 gate and stopping point

Prove atomic placement across Orders and Inventory, including an injected failure after the first context writes. Confirm immediate query consistency, accurate business history, same-key retries, and a maximum supported order. Run a production-configuration smoke test with test-only endpoints absent/disabled, and restore a copy of retained data with the matching code/configuration.

At this point the system is a useful application, not a framework demonstration waiting for queues. Stop here when the product needs no deferred work.

---

# 7. Layer 3 — Durable obligations, local reactions, and external effects

**Activation trigger:** The product needs an effect that must occur after the transaction, a wait, background isolation, or external I/O. Being called an “event-driven system” is not by itself a trigger.

## 7.1 The unit is an obligation

A durable obligation records a specific promise such as “deliver order confirmation for operation X” or “recompute this customer summary.” It is not a second copy of every domain event.

When a command promises such work, the obligation and the domain event commit in the same parent transaction. Initial scheduling can join that transaction. Worker concurrency admission happens later, not by inspecting an incidental recovery-queue limit during order placement.

If persistence or the required scheduling operation itself hits a hard platform limit, the transaction can still fail. This design does not promise unlimited buffering. A business quota on pending obligations is permitted only as an explicit, documented admission policy with a retryable outcome where appropriate.

A scheduler ID or Workpool ID is execution metadata. The obligation or an identified domain receipt is the evidence of fulfillment.

## 7.2 Minimum data

| Field | Purpose |
| --- | --- |
| `effectId`, `effectKey` | Stable identity; uniqueness scoped to tenant and logical effect |
| `tenantId`, `sourceOperationId`, optional `sourceEventId` | Ownership and causality |
| `handlerKey`, `handlerVersion`, `payloadSchemaVersion` | Stable accepted execution contract |
| `payload` or immutable versioned payload reference | Exact accepted work; no mutable “latest payload” pointer |
| `authority` | Server-established service/delegation identity and authorization policy |
| `status` | Lifecycle, described below |
| `nextAttemptAt`, `attemptCount`, `deadline` | Retry policy with a finite bound |
| `generation`, optional `activeAttemptId` | Stale-dispatch fencing |
| optional `leaseUntil` | External action execution ownership, not proof of provider cancellation |
| `completion` or last classified error | Evidence and diagnosis |

There is one generic obligation lifecycle. Specialized domain records such as payment attempts or approvals exist only where they carry distinct business evidence. Do not create separate watch, completion-watch, notification-receipt, retry-subject, and dispatch-record tables for every successful local job.

## 7.3 States and exits

| State | Meaning | Valid exit |
| --- | --- | --- |
| `pending` | Accepted, including delayed retry via `nextAttemptAt` | Execute, cancel before execution, or attention on policy expiry |
| `running` | External action attempt has claimed execution | Succeed, schedule a known-safe retry, or attention/reconciliation |
| `succeeded` | The specified effect is proven | Terminal; receipt retained through its replay horizon |
| `needs_attention` | Retry exhausted, permission revoked, unknown external outcome, unsupported version, or permanent failure | Authorized reconcile, repair and retry, proven cancellation, or explicit abandonment |
| `cancelled` | The promised effect will not happen and no unresolved external execution remains | Terminal |
| `abandoned` | An authorized operator ended the obligation without fulfilling it | Terminal unmet commitment, with reason and actor; never displayed as success |

A local mutation effect does not need a persistently visible `running` state: claim, effect, and completion can commit together. Retry delay is a timestamp on `pending`, not an extra lifecycle state.

“Terminal” means no automatic work remains. It does not erase the distinction between fulfilled, cancelled, and abandoned.

## 7.4 Local database reaction protocol

Use a scheduled mutation by default. Its wrapper loads the obligation, checks generation and eligibility, then invokes the effect body as a deliberate subtransaction. The effect may call a normal business command/use-case with a stable internal identity.

On success, the business effect and obligation completion commit in the wrapper's transaction. On a known business rejection, record the appropriate settled business result. On a retryable execution failure, the effect body rolls back and the wrapper records the next attempt or attention state. Unexpected wrapper/platform failure leaves no partial effect; a recovery sweep can detect a failed/missing dispatch and rearm it.

The healthy path does not require an `onComplete` callback to establish its truth. Completion notification for a UI is ordinarily just a reactive query of the obligation.

If the target body is an ordinary helper rather than a registered subtransaction, the wrapper MUST NOT catch its exception and commit earlier helper writes. This is the same rollback rule as commands.

## 7.5 External action protocol

```text
Transaction A: validate obligation, claim attempt, record external effect key
Action:        call provider with stable idempotency key where supported
Transaction B: record provider evidence and settle the business obligation
```

The external call is outside the database transaction. A timeout can mean either no effect or an effect whose response was lost. Each effect contract therefore selects one safe policy:

| Policy | Required behavior |
| --- | --- |
| Provider idempotency | Retries reuse the same provider-side key and respect its documented validity period |
| Reconcile before retry | Query provider state or await a correlated webhook before issuing another irreversible attempt |
| Duplicate tolerant | Duplication is an explicit business property; still bound retries and record outcomes |

An effect without any safe repetition policy cannot be automatically retried after an ambiguous outcome. It moves to `needs_attention`. A new random provider key is not a retry strategy.

The completion transaction verifies the logical effect and attempt identities and applies accounting/state changes once. An old generation cannot overwrite a newer decision. However, late provider evidence is not discarded merely because its worker is stale: retain the observation and reconcile it against the same effect identity. Fencing database writes does not cancel an already executing network request.

A cancellation request while an external action is running is not instantly `cancelled`. Settle or reconcile the in-flight attempt before declaring no effect. Compensating an effect is a new business operation, not a database rollback.

## 7.6 Retry ownership and vendor execution

Use Convex scheduling for simple deferred local work. Add Workpool when concurrency control, prioritization, or external provider load requires it. Use a pinned, verified adapter for the selected Workpool/Workflow versions; do not assume that all function kinds or callback paths share retry semantics.

The obligation module owns application-level retry policy in this profile. A Workpool adapter must not silently add an independent retry tree; disable overlapping automatic retries or explicitly delegate retry ownership to the vendor adapter and expose its attempts consistently. Convex's internal transaction retries are implementation retries, not new business attempts.

Recovery examines durable state and transport evidence. A job still queued behind legitimate backlog is not a failed worker. Rearm only after classified failure, missing dispatch, or an applicable execution lease condition. Bound repeated failures of the recovery mechanism itself; eventually escalate rather than create an immortal repair loop.

One batched, indexed sweeper per installed effect module is the baseline. Avoid one watchdog and one watchdog-of-watchdog per job. A future partitioned dispatcher can scale scanning without changing the obligation contract.

## 7.7 Backpressure and fanout

A full execution pool delays work; it does not reinterpret valid business intent as a permanent rejection. Partition concurrency by real contention or external rate limits. Tenant fairness becomes an explicit policy when one tenant can materially starve another.

Small static event subscriptions can create obligations directly in the publishing transaction. Their maximum fanout is part of the command budget. Very large/dynamic fanout requires a separately specified durable fanout task that snapshots the relevant routing version; it is not an unbounded loop in the public mutation.

Every derived command carries causation and a server-controlled namespace. Reaction chains need a bounded policy against accidental cycles and unlimited amplification.

## 7.8 Operator and retention contract

The module ships scoped inspect, retry, reconcile, cancel, and abandon operations appropriate to its effect types. Operators cannot invent a successful receipt without authorized evidence. Repairs have a reason, actor, old/new generation, and the exact subject identity.

Accepted unresolved obligations are never deleted by routine TTL. Completed receipts remain until every supported source retry/redelivery/replay horizon is closed. Bulky diagnostics may expire earlier while a compact dedup identity survives. Sweepers run in bounded batches and must drain eligible data faster than it is created over the intended workload.

On restore, start with external delivery disabled, reconcile external outcomes across the recovery-point gap, and reconstruct missing schedules from obligations. Do not blindly send every restored `pending` payment/email again. Preserve the logical external idempotency namespace across restore; creating a fresh deployment must not create fresh identities for old obligations.

## 7.9 Layer 3 gate

A duplicate worker invocation produces one local effect. A failed/missing dispatch is recovered. Exhaustion has a usable operator exit. Provider success followed by a lost response does not cause a second irreversible effect. Concurrent cancellation/settlement has a documented winner or an explicit uncertain state. Restoring without scheduled functions still leaves discoverable, recoverable obligations.

At least one local reaction and one real external-boundary adapter or faithful fault-injecting provider fixture must prove the complete protocol. A mocked successful enqueue is not sufficient.

---

# 8. Layers 4–5 — Processes, human decisions, and agents

## 8.1 Layer 4 activation

Add a durable process when the business operation spans time, external systems, human decisions, or intentionally separate transactions. Do not add a saga merely because two bounded contexts participate.

Use the Convex Workflow component as the durable execution engine where its verified behavior fits. Do not build a second generic workflow journal. The application still owns a business process record because its meaning must not depend on vendor-internal step names.

| Concern | Owner |
| --- | --- |
| Business state, such as `awaiting_payment` | Domain process/context |
| Durable sequencing, suspension, and step results | Workflow adapter/component |
| One external side effect and its uncertainty | Layer 3 effect record/adapter |
| Human approval and permitted transition | Domain authorization/approval model |
| Public progress/query DTO | Application query layer |

These are distinct responsibilities, not competing owners of the same state transition. A workflow waiting for an effect refers to that effect's identity; it does not create another independent obligation claiming the same provider action.

## 8.2 Process contract

A process has a stable ID, tenant/actor provenance, input or immutable input reference, definition version, business status, and references to active effects or waits. The engine journal can store execution details without duplicating them as application tables.

Local steps that can commit together are grouped into one mutation. Only true wait/effect boundaries become workflow steps. A workflow starts from a persisted business request, not an unrecorded action invocation.

Choose one owner for retries at each boundary. When the effect module owns external retries, the workflow waits for its result and does not launch additional attempts independently. When a workflow adapter owns them, the effect accounting must be integrated with that adapter so identities and budgets remain consistent. The baseline implementation uses the former policy.

Persist the process/workflow definition version at start. Changing code must not reinterpret an in-flight run arbitrarily. Retain compatible old definitions, provide an explicit migration, or drain before removing them.

## 8.3 Human waits

Approval identifies the exact proposed operation and input revision/hash, who may approve it, its expiry, and the policy version. The approving mutation checks current authority and atomically changes the approval state. A later executor rechecks the declared execution authorization and business preconditions.

The design distinguishes two questions: “Did an authorized person approve this proposal?” and “Is this operation still permitted and valid now?” A stale proposal must not silently acquire fresh scope or altered parameters.

Approval, rejection, expiry, and concurrent execution have explicit transitions. A process must not remain indefinitely `pending` after its proposal was rejected. Human-only operations are checked by server-side actor policy, never by model instructions.

## 8.4 Worked temporal variant: payment checkout

This is a different contract from the atomic Layer 2 placement: `StartCheckout` records an order awaiting payment and a reservation with a business expiry. It returns a process ID and an honest awaiting-payment status.

The process requests a payment effect, waits for durable provider evidence, then confirms order/allocation in one local transaction. Definitive payment failure releases the reservation under domain policy. Ambiguous payment status waits for reconciliation; it does not automatically cancel and try another payment.

A payment that succeeds after reservation expiry needs an explicit business policy: reallocate, request intervention, or issue a separately tracked refund. Compensation is a new command/effect with its own identity and outcome. It is not an attempt to pretend the earlier payment never happened.

## 8.5 Layer 4 gate

Restart/resume preserves completed effects. Duplicated signals do not advance a process twice. Approval expiry reaches a settled business outcome. Cancellation while a provider is running remains honest. A code deployment leaves old accepted runs executable or explicitly blocked with an operator remedy. Local multi-context finalization is atomic.

## 8.6 Layer 5 activation

Add agent execution when a model's judgment is part of a product capability. An agent is an actor/process participant, not an alternative domain runtime.

The agent may read authorized query DTOs, produce validated proposals, request policy-gated commands, and inspect progress. It cannot write CMS/journals directly, choose a system caller namespace, grant itself privileges, or manufacture approvals.

```text
Agent reasoning
    → structured proposal
    → deterministic capability/risk policy
    → optional human approval
    → the SAME command boundary used by other actors
    → ordinary domain events and query updates
```

An Agent module may own runs, proposals, provider attempts, and its own audit history. It does not become the owner of every business object it can manipulate.

## 8.7 Provider accounting and budgets

A paid call reserves a budget before dispatch. Record provider/model identity, input artifact versions or a protected payload reference, request fingerprint, policy/prompt version, attempt identity, and known usage/outcome. Store sensitive model inputs only where the product's data policy permits them; a trace ID is not permission to retain everything forever.

Bound per-run spend, attempt count, elapsed time, and permitted tool/command calls. Estimate reservations conservatively according to the provider adapter's policy. Settlement occurs once from observed evidence.

Execution concurrency and monetary uncertainty are separate resources. A timed-out lease is not proof that an external request stopped, and an unknown cost must not be silently released as zero. Conversely, uncertainty must have reconciliation and operator exits rather than leak a concurrency slot forever. The adapter specifies a bounded cancellation/quarantine/settlement procedure consistent with the provider's behavior.

A provider retry may cost money even when domain execution remains idempotent. The system does not promise exactly-once billing from database idempotency alone.

Model confidence is advisory input, not authority. Risk policy depends on action kind, scope, value, reversibility, provenance, and measured model performance where relevant. High model-reported confidence cannot bypass a human-only constraint.

## 8.8 Layer 5 gate

A model-generated command receives identical domain authorization, validation, idempotency, and event guarantees. Rejected/expired approval prevents execution. A changed proposal invalidates prior approval. Budget overrun is blocked before the next paid request. Late provider settlement is recorded once. A malicious prompt or untrusted retrieved document cannot widen the agent's server-side capabilities.

---

# 9. Layer 6 — Advanced reads only when the simple modes are insufficient

This layer contains independent capabilities. Install only the one whose activation condition is satisfied. Its existence must not convert transactional queries into eventually consistent queries.

## 9.1 Coalesced latest-state recomputation

**Trigger:** Recomputing a nonessential view on each command is too expensive, and the product needs the latest state rather than every intermediate event.

The source command atomically marks an affected, appropriately scoped view key dirty. Several changes can coalesce into the same pending recomputation. A local recompute mutation reads authoritative source state and the invalidation state, updates the view, and clears only the work it has covered. Concurrent source changes participate in OCC so the recompute cannot accidentally clear a newer invalidation.

Use one transaction for the read-and-write when the computation fits. If computation must leave that transaction, capture complete source revisions and membership dependencies, then validate them before publishing the result. Comparing only one convenient entity revision is not sufficient for a join or dynamic set.

The query exposes stale/recomputing status and the revision coverage appropriate to the view. Commands never use it as an invariant source. This mode cannot implement a history-dependent reducer that needs every event.

## 9.2 Ordered event consumers

**Trigger:** Every selected event matters, processing order changes the answer, and same-transaction processing is inappropriate or too costly.

Order is defined per `(tenant, consumer, generation, partition)`. Choose the smallest partition consistent with the projection's semantics: commonly an entity or a real shared business resource, not the entire deployment.

For this mode only, acceptance allocates a contiguous **consumer sequence** and persists the delivery identity in the source command's transaction. This can introduce a partition-head write; that cost is justified by the required order. The consumer sequence is distinct from source-stream revision: a filtered consumer must not wait for events it never subscribed to.

A local worker applies the next sequence, records exact fulfillment or advances a proven contiguous checkpoint, and arranges further work in the same transaction. Processing cannot jump over a failed head. An already applied duplicate is harmless; an out-of-order unprocessed event is deferred, not discarded.

The worker may process a bounded contiguous batch to amortize dispatch overhead. It MUST NOT attach a complete independent queue/callback lifecycle to every event when one bounded batch can maintain the same correctness contract.

A poison event blocks its affected partition and is inspectable. Repair/retry is supported. A deliberate skip is an authorized data-loss decision recorded as such, not a fabricated success receipt. Whether skipping is permitted is part of the consumer contract.

Generation changes fence old local workers. Persisted checkpoints/receipts remain valid through supported redelivery horizons. External ordered effects require additional provider-side ordering/uncertainty policy; local generation fencing alone cannot order already issued network calls.

## 9.3 Online projection rebuild

**Trigger:** The scoped write pause of Layer 2 is operationally unacceptable.

The module must first declare a supported rebuild class: per-entity reconstructible projection, bounded current-state recomputation, or a genuinely cross-stream event-dependent projection. Do not claim one generic algorithm safely covers all three.

For per-entity views, enable the new generation's live-update path before backfill. Enumerate source subjects with a no-gap protocol; include subjects created during the backfill. Backfill and live updates use source revision checks so old backfill cannot overwrite a newer result. Streams too large for one transaction are folded in staged bounded chunks; final promotion validates/catches up the source revision before publishing the result.

For cross-context current-state views, use coherent bounded source reads and dirty-key tracking. For cross-stream historical reducers, define a dependency/order protocol or a genuinely consistent source-cut manifest. A vector of per-stream positions is useful bookkeeping, but does not by itself prove a causally consistent historical cut.

Cutover requires coverage and catch-up verification, new-generation health, and a rollback route. Old workers are fenced, and old generation data is retained for the declared rollback horizon. Rebuild is effect-free: no notifications, payments, provider calls, or original command execution.

If these obligations are not implemented, the supported rebuild remains offline. A partially online job is not an acceptable substitute.

## 9.4 Layer 6 gate

Coalescing does not lose a change arriving during recomputation. Ordered replay of a noncommutative reducer preserves every event. Duplicate or stale generation workers cause no extra effect. A failed partition does not stop unrelated partitions. Online backfill cannot overwrite newer state and cannot omit newly created subjects. Cutover/rollback survive interruption.

---

# 10. Conditional extensions with explicit reintroduction triggers

Only mechanisms with a concrete later use are included here. They are not implementation obligations until their trigger is met.

| Extension | Reintroduce when | First implementation should preserve |
| --- | --- | --- |
| Explicit DCB/scope revision | A human/agent authorized a decision against a reviewed multi-entity scope, or the domain needs deliberate scope serialization | Expected scope revision and complete membership/dependency coverage; distinguish stale intent from engine OCC |
| Global ordered feed | A real consumer requires one total order across contexts | A separately specified sequencer/feed, accepted throughput cost, no false claim that timestamps reconstruct old commit order |
| Separate snapshot/archive tier | Historical reconstruction or journal size exceeds the operational budget | Snapshot/reducer version, source revision, integrity verification, and retained reconstructibility |
| Cryptographic delegation proofs | Independent issuers, trust boundaries, or delegated capabilities require them | Issuer, audience, scope, permitted operation/arguments, expiry, and replay policy; keys genuinely separate authority |
| Durable circuit breaker | A real failing provider causes expensive repeated attempts or cascading resource loss | Scoped admission, defined half-open probe ownership, bounded recovery, operator exit |
| Generic reservation/lease library | Several real domains share the same reservation semantics | Domain identity, expiry rules, safe confirmation/release, reconciliation; not a lock around ordinary ACID writes |
| Generic process-manager framework | Several durable reactions share genuine correlation/state behavior | One processing/effect contract; no second independent retry machine around the same obligation |
| Large fanout dispatcher | Static in-transaction subscriber fanout no longer fits budgets | Durable routing snapshot, resumable delivery enumeration, per-effect identity, explicit admission limits |
| External broker/event store | Independent consumers, topology, retention, or throughput require a separate event platform | Atomic local obligation to publish, external idempotency/checkpoints, explicit eventual-consistency boundary |
| Independent context deployments | Security, geography, ownership, or failure-isolation requirements justify distributed operation | No claim of cross-deployment ACID; explicit integration contracts and temporal compensation |
| Declarative dynamic views | Real users need safe runtime-configurable queries that deployed views cannot cover | Allowlisted query operators, authorization, bounded resources, and explicit freshness; no arbitrary model-generated database code |
| Tamper-evident audit storage | A documented assurance requirement exceeds ordinary append-only application APIs | Independently meaningful integrity/retention controls; hashes in the same writable database are not independent assurance |

The following do not belong in the new design as standing requirements: aggregate base classes, mandatory per-event asynchronous delivery, a universal command bus for internal helper calls, a generic DI lifecycle, redundant runtime declaration registries, mandatory signing within one trusted parent, and telemetry that can veto successful business writes.

An extension cannot be justified solely by the possibility that a future system might need it. Record the actual consumer, the insufficiency of the simpler layer, the new failure boundary, and the acceptance proof before activating it.

---

# 11. Operational and compatibility requirements at every layer

## 11.1 Authorization and tenancy

One authorization vocabulary covers humans, services, agents, reviewers, and operators. Permissions differ, but three unrelated grant mechanisms are not required. Resource scope and actor kind are server-established and explicit.

Authoritative ownership/membership is checked independently of optional read models. Scheduled workers receive captured provenance because scheduling does not propagate auth. Each worker contract states whether it reauthorizes a delegated user's current rights or executes an already accepted business obligation under a narrowly scoped service authority. These are different policies; neither is an excuse for an anonymous superuser.

Persisting a delegated authority does not grant unlimited future access. For money movement, sensitive disclosure, and agent actions, execution-time authorization/approval policy is mandatory. An access revocation must not silently erase an already accepted obligation: settle it, stop it, or escalate under the declared policy.

The baseline assumes one trusted deployment administrator/application. Independent malicious modules or administrators require a different trust boundary; do not claim TypeScript brands, component privacy, or a parent-signed token solve that problem.

## 11.2 Privacy and retention

Keep immutable events small and focused on business facts. Prefer references to separately governed personal data where reconstructing that data is unnecessary. Where a historical snapshot is necessary, identify its retention purpose and protection. Redacting a returned copy is not erasing stored data.

A product that accepts personal data needs a documented retention/deletion policy before production use. Erasure or crypto-shredding is not a blanket default framework feature; introduce the mechanism that the product's actual requirements and threat model demand. State which historical claims remain possible after data is removed.

Do not retain raw prompts, full credentials, signed tokens, or unlimited error payloads in diagnostic records. Logs use bounded safe fields. Audit and business facts have different retention requirements from temporary execution metadata.

## 11.3 Observability

Every installed profile supports diagnosis by request key/operation ID, tenant, business subject, and causation. Event IDs and provider attempt IDs are available where relevant. Logs are observations; persisted receipts are the authority for committed effects.

Ordinary logging/metrics failures MUST NOT cancel a valid business transaction. Mandatory business/security audit belongs inside the business transaction and has an explicit schema. A thrown transaction cannot retain its own ordinary database error record: durable technical attempt logging, when required, needs a separate boundary or an external log sink.

Record measurements appropriate to the enabled layers: command latency and OCC retries, domain/event writes, essential view cost, oldest unresolved obligation age, retry/exhaustion count, provider uncertainty, and rebuild/restore progress. Do not install dozens of empty monitoring abstractions for unavailable capabilities.

## 11.4 Resource budgets

Every bulk command, projection, fanout operation, sweeper, and replay batch declares an input/data-work bound. Qualify it against the pinned Convex runtime and selected deployment profile. The documented platform limits are ceilings, not suggested batch sizes.

A proposal must account for at least top-level commits, component/function calls, documents and bytes read/written, asynchronous jobs, retained infrastructure rows, and shared contention keys. Count actual runtime work rather than helper-function names. Healthy-path costs and retry costs are reported separately.

The initial acceptance dataset covers 1, 10, and the chosen maximum supported order size, multiple concurrent writers to distinct orders, and writers competing for the same stock. Numeric latency/throughput SLOs are product decisions established before the benchmark; this specification does not invent a performance promise.

## 11.5 Deployments and durable compatibility

Store result/payload/event schema versions where retained data depends on them. Public command retries must still decode their retained original outcomes within the supported retry window. Do not remove an old result reader just because new commands use a new response shape.

Persist logical `handlerKey` and accepted handler version, resolved by a typed static registry. Where a vendor stores native function handles, retain stable shim endpoints for in-flight work. Changing a source-file path must not silently strand a retained obligation. An unsupported accepted version is visible `needs_attention`, not an endless retry.

A release must preserve old pending work, migrate it, or drain it. Reset-only upgrade procedures are allowed for explicitly disposable unreleased environments, not retained customer data.

Code, schemas, configuration, credentials, database data, and any required external outcome evidence all belong to the recovery plan. Test restoration, not merely backup creation. In later profiles, pause external dispatch until the recovery-point gap has been reconciled.

---

# 12. Conformance suite for testing an implementation against this design

The following scenarios are the acceptance contract. They test behavior, not package names or the number of abstraction layers. “Required layer” means the first layer that makes the capability available.

| ID | Required layer | Scenario | Pass condition |
| --- | --- | --- | --- |
| T01 | 0 | Evaluate a decision twice with identical inputs | Identical output; inputs unchanged; no I/O |
| T02 | 0–1 | Execute commands incrementally and reconstruct from events | Equal business state and stream revisions under the specified readers |
| T03 | 1 | Reject an invalid state transition | No business-state/event change; documented rejection |
| T04 | 1 | Inject failure after CMS work, after journal append, and before receipt | No partial command state/events/read models/receipt commit |
| T05 | 1 | Submit the same command concurrently and retry after response loss | One logical effect and one stable retained outcome |
| T06 | 1 | Reuse an idempotency key with changed business input | Explicit conflict; original result/state unchanged |
| T07 | 1 | Two tenants use the same client request key and domain-local ID | No unintended collision or disclosure; scoped behavior is correct |
| T08 | 1 | Client attempts to impersonate internal worker or agent namespace | Refused; caller cannot construct privileged execution context |
| T09 | 1 | Revoke authorization before retrying a previously successful command | Cached outcome is not disclosed without current required access |
| T10 | 1 | Trigger a transient rate/capacity refusal, then retry the same intent | No cached terminal rejection; retry can succeed |
| T11 | 1 | Execute against a stale explicitly reviewed revision | Rejected as stale intent; no silent fresh-state reinterpretation |
| T12 | 1 | Two commands compete for the same stock/uniqueness predicate | The invariant holds; logical conflict is not confused with engine retry |
| T13 | 2 | First context writes; second context rejects or throws | Full command body rolls back; outer rejection recording is safe |
| T14 | 2 | Successful command followed by essential query/subscription | No background projection is required for committed essential state |
| T15 | 2 | Place 1, 10, and maximum-size orders | One successful top-level command commit each; zero core projection jobs; budgets hold |
| T16 | 2 | Rename a typed handler or change its argument contract incorrectly | Build/type/registration validation fails before runtime traffic |
| T17 | 2 | Rebuild while the scoped write barrier is active; interrupt and resume | Stable source set, deterministic result, safe cutover/abort, no external effects |
| T18 | 2 | Restore a representative dataset and matching code/configuration | Domain/journal/read-model invariants hold; recovery procedure is executable |
| T19 | 2 | Run native acceptance without behavior-changing test mode | Same authority, schemas, concurrency policies, and production code path as release |
| T20 | 3 | Duplicate a local effect worker and lose any completion callback | One committed business effect; obligation truth does not depend on callback |
| T21 | 3 | Kill/cancel a dispatch before work; simulate a failed scheduled wrapper | Recoverable obligation remains; classified bounded rearm occurs |
| T22 | 3 | Queue legitimate backlog | Work is not replaced merely because it has not started yet |
| T23 | 3 | Exhaust retries, including failures of recovery itself | Explicit attention state and usable authorized operator exit |
| T24 | 3 | Provider succeeds but reply/completion is lost | Reconciliation or same valid provider key prevents duplicate irreversible effect |
| T25 | 3 | Old worker reports after a new attempt or cancellation | No stale state overwrite; relevant provider evidence is retained and reconciled |
| T26 | 3 | Restore pending effects after external outcomes advanced beyond backup | Dispatch is gated until the gap is reconciled; identities remain stable |
| T27 | 3 | Run retention while retries/redelivery remain possible | Required dedup/obligation evidence survives; no unresolved work is erased |
| T28 | 4 | Restart a process after an external step completed | No repeat of completed effect; correct business progress |
| T29 | 4 | Race approval, expiry, revocation, and execution | Only authorized transitions occur; no stranded false pending state |
| T30 | 4 | Upgrade code with an in-flight old process | Compatible continuation, explicit migration, or clear blocked state with remedy |
| T31 | 5 | Agent proposes a valid-looking unauthorized command | Ordinary command policy rejects it; no bypass write path |
| T32 | 5 | Modify proposal input after approval or exceed run budget | Old approval is invalid; unauthorized/over-budget execution cannot proceed |
| T33 | 5 | Timeout a paid model call and later receive usage | Accounting settles once; uncertainty is not treated as zero cost or permanent slot leakage |
| T34 | 6 | Change source data during coalesced recomputation | New change remains covered or dirty; no lost invalidation |
| T35 | 6 | Deliver duplicate and out-of-order noncommutative events | Every required event is applied once in the declared partition order |
| T36 | 6 | Fail one ordered partition | Unrelated partitions progress; failing partition is inspectable/recoverable |
| T37 | 6 | Race backfill with live writes/new subjects and then cut over | No old overwrite, missing subject, or side-effect replay |
| T38 | All installed | Break metrics/logging and separately break mandatory audit | Diagnostics do not abort valid work; required audit failure does |

## 12.1 Test tiers

Domain tests are pure and fast. Adapter/simulator tests cover outcome combinations, serialization, declaration integrity, and failure classification. Native tests prove actual component/subtransaction, scheduling, contention, and schema/deployment behavior. A small end-to-end acceptance path runs the production composition.

Simulators are useful but have a conformance obligation against the native boundary they model. Do not replace a native behavior with a no-op and then claim delivery is proven. Use real-backend tests sparingly for the facts that require them, rather than duplicating every domain test there.

The kernel's fixture application is separate from the minimal consumer example. Test-only mutation surfaces do not ship as hundreds of public functions in the production app. Disposable backend identity, teardown, and state ownership are part of test infrastructure; no test borrows an uncontrolled shared production-like database.

## 12.2 Evidence format

Each acceptance run records the implementation commit, enabled profile/layers, backend and dependency versions, deployment configuration, dataset/workload, test command, and result. A source/test binding is not a passing run. A simulator result is not native proof. A configuration-adjusted run states its difference from production.

Readiness is stated plainly: specified, implemented, tested under named conditions, and operationally accepted. No generic “ready” label is inferred solely from a graph of links.

## 12.3 Architectural comparison criteria

An alternative implementation is acceptable when it satisfies the relevant laws/scenarios with fewer consumer obligations or a demonstrably better cost profile. It does not need to copy this document's folder names or interface sketches.

Compare the number of independent manually maintained facts, commit boundaries, persisted state machines, and recovery owners per feature. A wrapper that hides twelve registrations without removing them is not the same improvement as one declaration that generates or eliminates them.

A failed conformance test should identify the violated promise. It must not automatically justify another generic subsystem. First ask whether the failure boundary can be removed or its existing owner corrected.

---

# 13. First implementation experiment and adoption sequence

## 13.1 The first experiment

Build the transactional profile through Layer 2 in a clean small application. Implement Orders and Inventory, complete order placement, one additional lifecycle command, one essential summary, and journal inspection/reconstruction. Use the existing pure deciders/FSM concepts where they fit, but implement the new transition-authority contract rather than retaining duplicate state-update logic for compatibility.

Do not copy the existing order application's entire infrastructure composition. The point of the experiment is to test the target topology without inherited registration/recovery obligations.

**Required demonstration:** one authorized request places a complete order and updates its essential reads atomically; a fault anywhere in the body leaves no partial business effect; a retry does not duplicate it; historical reconstruction verifies its business state.

Measure the cases in T15, both uncontended and with shared-stock contention. Record actual function/component calls and retained rows. Compare semantics first, performance second. This is a design validation experiment, not a promise of a particular speedup.

## 13.2 Then extend by one real need

Add a confirmation effect with the complete Layer 3 contract. Demonstrate provider uncertainty/recovery before adding more effects. Add a temporal payment or approval process only when that is the next product capability. Add an agent as a caller of the same command path, not as a new route around it.

Extract reusable composition after at least two real modules expose the repeated pattern. Extract a generic process manager or advanced ordering module only after its activation condition is real. The default example should remain readable without understanding those modules.

## 13.3 Applying this to retained data

This specification is not authorization to delete or migrate existing data. Preserve the reviewed implementation and its evidence as a baseline. Map each existing contract to the new capability that continues it, changes it, or explicitly retires its guarantee.

For a retained central journal, keep an adapter or plan a verified one-way migration that preserves event identities, revisions, tenant/context scope, and reader compatibility. Avoid independent dual writes to old and new authorities. A boundary moves only with a cutover and reconciliation strategy. If an old history is incomplete, retain its honest audit-only status or establish an explicit imported baseline and a new reconstructible epoch; do not manufacture past business events to satisfy the new replay law.

Before retiring an old queue/handler, drain it, migrate accepted obligations, or fence and settle them explicitly. Keep the old dispatch shim while vendor jobs refer to it. A new synchronous view needs a one-time correct rebuild/cutover; switching future writes alone does not repair historical projection state.

Code simplification does not excuse losing durable commitments. Conversely, a mechanism with no retained obligations and no remaining consumer should not survive solely because a historical document named it.

## 13.4 Exit criteria for the first usable platform

The transactional profile is complete when a new feature can be added by defining its domain input/events/decision and one typed command/use-case binding, with only the additional read model the feature actually needs. A maintainer can trace its success and failure without consulting unrelated queue, agent, or governance registries.

The durable profile is complete when adding one effect supplies domain policy and a handler, while the module supplies safe dispatch, recovery, inspection, and retention. The application does not reinvent generic operator endpoints for each effect.

The agent profile is complete when reasoning is replaceable while authority, command correctness, and provider accounting remain deterministic platform responsibilities.

> The architecture is successful when increasing domain sophistication does not automatically increase infrastructure sophistication.

---

# 14. Source and provenance notes

All requirements and activation choices in this document are proposed design decisions. Platform facts in section 2 come from the primary sources below, checked on 2026-09-29. The sources substantiate primitives, not the correctness or performance of this unimplemented architecture. Exact library versions, limits, and adapter semantics must be qualified for the implementation's selected runtime.

Repository basis: the preceding architectural review, the pinned Atlas mental model and the representative command, projection, journal, and agent paths reviewed at commit `3ca2e65db35b3061843900a4008f60bd64ea4c21`. The supplied attachment is an Atlas directory listing, not an additional code snapshot. The per-context journal, event-derived state update, explicit command-body subtransaction, and layered packaging in this specification are new recommendations rather than descriptions of that branch.

| Ref | Primary source / precise use |
| --- | --- |
| S1 | Convex OCC and Atomicity — serializable mutation semantics. `https://docs.convex.dev/database/advanced/occ` |
| S2 | Understanding Components — isolation and transactional composition. `https://docs.convex.dev/components/understanding` |
| S3 | GenericMutationCtx API — mutation/subtransaction execution. `https://docs.convex.dev/api/interfaces/server.GenericMutationCtx` |
| S4 | Authoring Components — component API visibility, explicit identity, function handles. `https://docs.convex.dev/components/authoring` |
| S5 | Realtime — query subscriptions as state synchronization. `https://docs.convex.dev/realtime` |
| S6 | Scheduled Functions — atomic scheduling, execution/error semantics, auth propagation. `https://docs.convex.dev/scheduling/scheduled-functions` |
| S7 | Actions — external I/O and separate database transactions. `https://docs.convex.dev/functions/actions` |
| S8 | Backup & Restore — data backups and excluded scheduled functions/configuration. `https://docs.convex.dev/database/backup-restore` |
| S9 | Limits — document, transaction, scheduling, and deployment resource boundaries. `https://docs.convex.dev/production/state/limits` |
| S10 | Best Practices — typed boundaries, awaited operations, bounded queries, appropriate helper use. `https://docs.convex.dev/understanding/best-practices` |
| S11 | Workflow component — available durable workflow execution. `https://www.convex.dev/components/workflow` |
| S12 | Workpool component — available concurrency-controlled work execution. `https://www.convex.dev/components/workpool` |
| S13 | Testing Local Backend — native integration-testing basis. `https://docs.convex.dev/testing/convex-backend` |
| R1 | Pinned Atlas mental model. `https://github.com/libar-ai/convex-event-sourcing/blob/3ca2e65db35b3061843900a4008f60bd64ea4c21/atlas/00-start/mental-model.md` |
| R2 | Pinned consumer path. `https://github.com/libar-ai/convex-event-sourcing/blob/3ca2e65db35b3061843900a4008f60bd64ea4c21/atlas/40-building/consumer-path.md` |
| R3 | Pinned wave report. `https://github.com/libar-ai/convex-event-sourcing/blob/3ca2e65db35b3061843900a4008f60bd64ea4c21/docs/project-management/omo-runs/runs/2026-09-27-fix-wave-1/REPORT.md` |

No repository writes, deployments, or implementation tests were performed to produce this specification. Acceptance scenarios are requirements to execute against a future implementation, not reported passing results.
