# Convex Transactional Domain Platform
## Proposed specification and implementation sequence

The target is a **Convex-native transactional domain platform with optional durable execution**.

Its first usable version should already provide meaningful DDD, reliable command handling, event history, and consistent reactive reads. It should **not** need a projection queue, saga runtime, recovery framework, or agent subsystem before an application becomes useful.

I’ve prepared the complete specification as one standalone Markdown document:

**:chatgpt-content-reference{index="13"}[Download the detailed specification — v0.1](sandbox:/mnt/data/convex-transactional-domain-platform-spec-v0.1.md)**

It contains the storage contracts, transaction protocols, lifecycle states, module boundaries, conditional extensions, implementation sequence, and **38 conformance scenarios** against which you can test another design or implementation. These are proposed requirements, not claims of tests already executed.

The central decisions and construction sequence follow.

---

# 1. The architectural foundation

> **Ownership follows bounded contexts. Atomicity follows the business operation. Asynchrony follows an actual need to defer work.**

That is the rule from which the rest of the architecture should follow.

Convex supplies serializable transactions and transactionally composed component calls. We should use those properties directly, rather than introducing coordination protocols for operations the database can already commit together. :chatgpt-content-reference{index="0"}

The design preserves the existing system’s valuable starting point: commands operate on current Command Model State, rather than replaying historical events before every decision. The Atlas identifies that model and cross-component atomicity as fundamental to the implementation. 

The target architecture is:

```text
Client / integration / authorized agent
                    │
          Typed command boundary
                    │
      ONE PARENT CONVEX TRANSACTION
                    │
      ┌─────────────┼───────────────────┐
      │             │                   │
  Context A     Context B         Application
      │             │                   │
  Decisions     Decisions        Essential read models
  Current state Current state    Command outcome
  Event journal Event journal    Idempotency receipt
                    │
          Optional durable obligation
                    │
             ASYNC BOUNDARY
                    │
           Worker / external action
                    │
          Completion or reconciliation
```

The important distinction is that the lower half is **optional**.

A sophisticated business operation is not necessarily an asynchronous operation.

---

# 2. One refinement: each context owns its journal

For this clean target, I would make one additional simplifying choice beyond the earlier review:

**Each bounded context owns its event journal alongside its current command state.**

The common journal implementation is reusable library code. It does not require a deployment-wide event-store component through which every context must coordinate its writes.

A context’s mutation API performs:

```text
Load current state
    → Make domain decision
    → Produce events
    → Derive next state from those events
    → Persist state and events together
    → Return the accepted transition
```

This makes the essential guarantee local:

> A sanctioned context operation cannot update business state without recording its required historical facts.

The parent still coordinates several context operations and application projections within the same transaction.

This fits Convex’s component model: components own their schemas and data, expose function APIs, and participate transactionally in their caller. It does not imply separate hardware or independent deployment failure domains. :chatgpt-content-reference{index="2"}

### What this deliberately gives up

There is no mandatory application-wide event offset.

Cross-context history is assembled through context APIs. Events have stable identities, per-stream revisions, operation identity, and causality—but unrelated changes do not all contend on one application-level sequencing counter.

A global ordered feed can be added later when a real consumer requires it. Until then, it is unnecessary coordination.

For migration, the existing central event store can remain behind an adapter. Moving retained history is not a prerequisite for testing the rest of this design.

---

# 3. Build the system in independently useful layers

These are **capability layers**, not a checklist that every application must complete.

| Layer | What you build | What is usable afterward |
|---|---|---|
| **0. Domain** | Commands, events, reducers, invariants, small FSMs | A pure, testable domain library |
| **1. Transactional context** | One component, state/journal persistence, authorization, command idempotency, queries | A working single-context application |
| **2. Composed application** | A second context, atomic use cases, essential read models, minimal module composition, offline rebuild | A practical multi-context product |
| **3. Durable obligations** | Background reactions, external effects, bounded retries, recovery, operator exits | A reliable integration/background-processing application |
| **4. Long-running processes** | Workflow execution, business process state, human waits, compensation | A temporal business application |
| **5. Agents** | Authorized proposals and commands, approval policies, budgets, provider accounting | A governed agentic application |
| **6. Advanced reads** | Coalesced recomputation, ordered consumers, online rebuild—individually when needed | Specialized read-processing capabilities |

**Recommended first stopping point: Layer 2.**

At that point, the system should be a useful product, not a framework demonstration waiting for its infrastructure.

Layers 4–6 are not a compulsory sequence. An application can need ordered event processing without agents. An agentic application can use only transactionally maintained views.

Security and tests begin with the first deployed capability. Recovery is introduced with the capability that creates something needing recovery.

---

# 4. Layer 0: retain domain discipline, simplify the mechanics

## 4.1 Pure decisions remain the center

Keep pure deciders, domain vocabulary, business invariants, and FSMs that express meaningful lifecycle rules.

The basic relationship is:

```text
decide(currentState, command, explicitContext)
    → accepted events and result
    OR
    → business rejection
```

Domain code does not access the database, scheduler, network, environment variables, or ambient authentication.

Time, approved prices, policy versions, and other necessary facts enter explicitly.

An aggregate base class is unnecessary. A stream records a subject’s history; it does not dictate the entire transaction boundary.

## 4.2 Use one authority for state transitions

This is an important change from returning both an event and an independently authored state patch.

For a domain that promises reconstructible history:

```text
nextBusinessState =
    fold(evolve, currentBusinessState, emittedEvents)
```

The persistence adapter stores that result.

This preserves the current-state command path: the command loads CMS and applies only its newly produced events. It does **not** replay historical events.

However, state and history now agree by construction rather than depending on two pieces of business logic remaining synchronized.

The key acceptance property is:

```text
State obtained through incremental execution
    =
State reconstructed from the recorded events
```

Persistence metadata can be excluded from this equality, but the exclusions must be explicit.

## 4.3 Do not event-source unrelated application state

The domain profile does not need to own UI preferences, ephemeral presence, disposable caches, or every administrative table.

Those can use ordinary authorized Convex mutations.

An audit-only domain is also a legitimate explicit choice—but it must not advertise event-only reconstruction. The system should never silently downgrade from reconstructible history to “we happened to record some events.”

---

# 5. Layer 1: the complete command contract

The smallest deployed application already needs correctness, not merely successful writes.

## 5.1 Minimum storage

| Record | Owner | Responsibility |
|---|---|---|
| Domain CMS | Context | Current decision state |
| Journal events | Context | Historical business facts |
| Stream metadata | Context | Identity, revision, enumeration |
| Command receipt | Parent application | Original outcome and idempotency |
| Authoritative access records | Parent or access context | Authorization independent of delayed views |

Some physical records may be consolidated where their contracts remain intact. For example, a simple CMS record may also serve as stream metadata.

There is no requirement to turn each concept into a package, component, or table.

## 5.2 Stable, scoped command identity

Every externally retryable business command receives a stable request key.

The server constructs the actual identity:

```text
tenant
+ authenticated caller namespace
+ command type
+ request key
```

The client cannot choose a system-worker namespace.

The request fingerprint includes business-significant input and its contract version. It excludes diagnostic retry timestamps.

The behavior is precise:

| Situation | Required outcome |
|---|---|
| Same identity, same request | Return the original outcome |
| Same identity, different request | Reject identity reuse |
| Transient admission refusal | Permit retry of the same intent |
| Current authorization no longer permits disclosure | Do not reveal a cached result |
| Supported retry horizon has expired | Follow an explicit policy; do not silently allow irreversible duplication |

A one-transaction command does not need a durable `pending` lifecycle.

It either commits an outcome or fails without one.

## 5.3 Preserve distinct outcomes

Keep these distinctions:

**Business rejection:** the request is understood but disallowed; no business transition occurs.

**Recorded business failure:** something meaningful happened, such as a reservation being declined, and that fact belongs in history.

**Transient refusal:** the request may succeed later; it is not a permanent business outcome.

**Unexpected technical failure:** execution must roll back.

Do not reduce these to `success: boolean`.

## 5.4 Make rollback behavior explicit

There is a subtle but important case: one context writes, a second context rejects, and the application wants to retain a rejection receipt.

The safe default is:

```text
Public mutation
    Authenticate
    Authorize
    Validate
    Check command receipt

    Invoke command-body mutation as a subtransaction
        Context A changes
        Context B changes
        Essential read models
        Optional durable obligations

    On success:
        Record committed command outcome

    On known business rejection:
        Entire command body has already rolled back
        Record rejected command outcome

    On unexpected error:
        Throw and roll back everything
```

This remains **one top-level transaction**. The internal command-body boundary exists specifically to support rollback while retaining a legitimate rejection outcome. Convex documents mutation subtransactions that make this composition possible. :chatgpt-content-reference{index="3"}

Ordinary helpers remain ordinary TypeScript calls.

**Catching an exception from an ordinary helper does not undo its earlier database writes.** The implementation must not confuse a JavaScript catch with a transactional rollback boundary.

---

# 6. Layer 2: compose business operations, not chains of miniature commands

## 6.1 Make `PlaceOrder` a genuine application command

The baseline reference use case should be:

> Place a complete order with authoritative pricing and atomically commit its inventory allocation—or reject without leaving an order or allocation.

It should not implement that request by repeatedly invoking the complete public-command machinery for:

```text
CreateOrder
AddOrderItem × N
SubmitOrder
```

Instead:

```text
PlaceOrder
    → Validate the complete request
    → Resolve authoritative prices or approved quote
    → Make the order and inventory decisions
    → Persist their domain transitions and events
    → Update essential read models once
    → Record one public command outcome
```

This does not prohibit detailed events. Inventory may need a fact for each affected product. That is meaningful O(N) business work.

What should remain constant is the public orchestration structure.

### Baseline cost contract

| Dimension | Target |
|---|---|
| Successful top-level command commits | One |
| Core projection jobs | Zero |
| Validation and affected business records | May be O(N) |
| Complete public-command executions | One per business intent |
| Application-wide sequencing counter | None |
| Queue recovery required for essential reads | None |

These are architectural targets, not promised latency numbers.

Maximum-size requests still need qualification against Convex’s actual document, transaction, and scheduling limits. Splitting an atomic operation over several transactions changes its contract; it is not a transparent performance optimization. :chatgpt-content-reference{index="4"}

## 6.2 CQRS does not require duplicate storage everywhere

Use the simplest suitable read implementation:

| Read need | Default |
|---|---|
| One entity’s detail | Authorized context query returning a DTO |
| Essential list or summary | Indexed query or small transactional projection |
| Small cross-context view | Bounded parent query or transactional projection |
| Expensive nonessential view | Optional advanced-read capability |

A context query can return a deliberately designed DTO without exposing its private storage schema.

An essential projection updates in the command transaction. It does not recursively issue commands or trigger hidden business effects.

Convex’s reactive queries then synchronize that committed read state to subscribers. A separate event-to-WebSocket subsystem is unnecessary for this path. :chatgpt-content-reference{index="5"}

The consistency promise is:

> After a successful command, an authorized subsequent query sees its committed essential state or a later legitimate state—not an older state waiting for a projection worker.

## 6.3 The module system must remove repeated facts

A module should own its domain operations, schemas, journal readers, query contracts, and optional projections.

A command definition should provide its name, schema, executor, authorization policy, and necessary read-model behavior once.

Start with shared schema values, inferred types, typed generated references, and a small composition helper. Generate repeated static endpoint bindings after two real modules establish the pattern.

Do not introduce a general DI framework first.

Module classes are reasonable organizational containers, but they do not need startup/shutdown lifecycles or correctness-critical mutable singleton state. Convex functions and generated references remain explicit.

**The test of the module system is not whether it hides wiring. It is whether it eliminates independently maintained wiring facts.**

## 6.4 Include a simple, correct rebuild

Layer 2 should support journal inspection, export, reconstruction verification, and rebuild of its actual projections.

The first rebuild implementation should allow a **scoped write pause**.

Under an audited tenant/context maintenance barrier:

```text
Freeze relevant writers
    → Enumerate stable sources
    → Rebuild into a separate generation
    → Validate
    → Switch generation
    → Reopen writes
```

Work occurs in bounded resumable batches.

This is deliberately simpler than online rebuild. It also avoids pretending that timestamp pagination provides a safe, complete live event cursor.

Online rebuild becomes necessary only when the write pause is operationally unacceptable.

---

# 7. Layer 3: add durable work around actual asynchronous boundaries

## 7.1 The unit is a business obligation

A durable obligation means:

```text
“Deliver confirmation for operation X.”
```

It does not mean:

```text
“Create another lifecycle record for every domain event.”
```

When the command promises deferred work, the obligation is recorded in the same transaction as the business change. Initial scheduling can commit with it: Convex explicitly supports atomic scheduling from mutations. :chatgpt-content-reference{index="6"}

The obligation records stable effect identity, scope, handler/version, accepted payload, retry policy, generation, and completion evidence.

There is no universal need for separate execution-watch, completion-watch, notification-receipt, dispatch-record, and retry-subject tables for every successful local job.

## 7.2 Keep the lifecycle small and truthful

| State | Meaning |
|---|---|
| `pending` | Accepted, including a scheduled retry |
| `running` | An external attempt has claimed execution |
| `succeeded` | The specified effect is proven |
| `needs_attention` | Exhaustion, uncertainty, revoked authority, or another blocked condition |
| `cancelled` | The effect will not occur and no unresolved execution remains |
| `abandoned` | An operator ended the obligation without fulfilling it |

Retry delay is a timestamp on `pending`, not another state.

A local mutation effect may never need a persistently visible `running` state: its effect and completion can commit together.

A process that is abandoned is not displayed as successful.

## 7.3 Local reactions should have one completion authority

For a local database reaction, use a scheduled mutation by default.

The worker applies the business effect and records completion in the same transaction. A deliberate subtransaction permits safe failure recording where needed.

The successful effect does not depend on an `onComplete` callback later establishing whether it happened.

A recovery sweep handles missing or failed dispatches. It does not replace a legitimately queued job merely because a backlog exists.

## 7.4 External effects require an uncertainty protocol

The external path is different:

```text
Transaction A: claim and record attempt
Action:        call external provider
Transaction B: persist evidence and settle
```

An action’s separate mutation calls are separate transactions. A provider call cannot be made atomic with those database writes. :chatgpt-content-reference{index="7"}

Every external effect must select a safe repetition policy:

| Policy | Required behavior |
|---|---|
| Provider idempotency | Reuse the same valid provider-side key |
| Reconciliation before retry | Establish the provider outcome before another irreversible attempt |
| Explicit duplicate tolerance | Accept duplication as a documented business property |

A timeout is not proof that nothing happened.

A stale worker must not overwrite newer state, but late provider evidence must still be retained and reconciled. Database fencing cannot cancel an already running network request.

## 7.5 One retry owner

Use native scheduling for simple work. Add Workpool when execution concurrency or prioritization actually requires it.

The effect module owns the application retry policy unless that ownership is deliberately delegated to a verified vendor adapter. Do not let Workpool retries, workflow retries, and application retries multiply one another invisibly.

Scheduled mutations and actions have different error/retry guarantees; neither eliminates the application’s responsibility for business recovery. :chatgpt-content-reference{index="8"}

The adopted module must include scoped inspection, recovery, retention, and operator exits. Those are not left as substantial handwritten work for each consuming application.

---

# 8. Layers 4 and 5: processes and agents use the same foundation

## 8.1 Add workflows when the business spans time

A workflow is justified by payment, external fulfillment, human approval, delayed availability, or another real temporal boundary.

Two components participating in one operation are not sufficient justification.

Use a durable execution engine for sequencing and suspension. Keep a domain process record for business meaning.

| Responsibility | Owner |
|---|---|
| Business status | Domain process/context |
| Durable step execution | Workflow engine |
| External-effect uncertainty | Effect record/adapter |
| Human authority | Authorization/approval model |
| Public progress | Application query contract |

The workflow references an existing effect identity. It does not create a second independent obligation for the same provider call.

## 8.2 Temporal checkout is a different contract

The atomic Layer 2 `PlaceOrder` does not involve payment.

A later `StartCheckout` can record an order awaiting payment and a reservation, then return a process identity and an honest pending status.

Payment success leads to atomic local confirmation. Definitive failure invokes the release policy. Ambiguity leads to reconciliation.

A late payment after reservation expiry needs an explicit reallocation, intervention, or refund policy. Compensation is a new tracked operation—not a pretend rollback of the external world.

## 8.3 Agents propose; normal commands execute

The agent path is:

```text
Authorized reads
    → Model judgment
    → Structured proposal
    → Deterministic capability/risk policy
    → Optional human approval
    → Normal command boundary
```

Agents do not get a parallel write route.

They cannot directly patch CMS, append arbitrary domain events, choose a privileged caller namespace, or manufacture approval.

The agent module owns runs, proposals, provider attempts, and relevant audit information—not every business object it can influence.

## 8.4 Approvals bind to an exact proposal

An approval identifies the requested operation, input revision/hash, permitted approver, expiry, and policy version.

Changing the input invalidates the approval.

Execution checks the declared current authorization and business preconditions. Model confidence cannot override a human-only constraint.

Convex components do not receive ambient `ctx.auth`; identity and relevant authority therefore need to be established in the application and passed deliberately. :chatgpt-content-reference{index="9"}

## 8.5 Keep provider accounting rigorous

Paid model calls reserve budget before dispatch and settle once from evidence.

Execution concurrency and monetary uncertainty are separate resources. Unknown cost is not zero cost. A timed-out lease is not proof of provider cancellation.

At the same time, uncertainty must have bounded reconciliation and operator exits rather than leaking execution slots forever.

These are good reasons for formalization because they protect real external commitments.

---

# 9. Reintroduce complexity only when its trigger appears

The specification includes later capabilities only where a concrete requirement could justify them.

| Capability | Activation trigger |
|---|---|
| **Coalesced asynchronous views** | Nonessential recomputation is too expensive per command; only latest state matters |
| **Ordered event consumers** | Every selected event matters and order changes the answer |
| **Online rebuild** | The scoped write pause is unacceptable |
| **DCB/scope revisions** | A decision must honor a reviewed multi-entity revision or deliberate scope serialization |
| **Global ordered feed** | A real consumer requires one total order across contexts |
| **Snapshot/archive tier** | Reconstruction cost or journal size exceeds its operational budget |
| **Cryptographic delegation** | Independent issuers or trust boundaries require enforceable delegated capabilities |
| **Durable circuit breaker** | A real provider failure causes costly repeated attempts or resource cascades |
| **Generic reservation library** | Several real domains share the same reservation semantics |
| **Generic process-manager framework** | Multiple reactions share genuine stateful correlation behavior |
| **External broker or separate deployments** | Independent consumption, topology, retention, security, or throughput requires them |

These are **activation conditions, not a roadmap commitment**.

Two details deserve emphasis.

For ordered consumers, sequence is allocated per actual consumer partition—not automatically per deployment. A filtered consumer’s sequence is different from its source stream’s revision.

For online rebuild, an older backfill must not overwrite newer state, new subjects must not be omitted, and cutover must be proven complete. A collection of per-stream positions is bookkeeping; it does not automatically establish a causally consistent historical snapshot.

Until those protocols exist, the system supports the simpler correct mode.

---

# 10. Operational requirements travel with the capability

The platform should never be easy to adopt on the happy path and difficult to operate on the failure path.

### Authorization

Use one policy vocabulary with distinct permissions for humans, services, agents, reviewers, and operators.

Workers carry explicit provenance. Their contract states whether they reauthorize a delegated user or execute a previously accepted obligation under a narrow service authority.

### Retention

Unresolved obligations are not deleted by routine TTL.

Deduplication evidence survives every supported retry/redelivery horizon. Large diagnostics may expire while compact identity records remain.

An immutable event containing personal data needs an explicit retention purpose and protection. Redacting a returned copy is not erasure.

### Observability

Ordinary logging and metrics must not cancel successful business work.

Mandatory business/security audit is different: it belongs in the transaction and can legitimately be fail-closed.

### Deployment compatibility

Accepted work records a logical handler identity and version. Where vendor jobs retain native function handles, stable shims remain available until those jobs are drained or migrated.

A source-file rename is not permission to strand accepted work.

### Restore

Recovery includes code, configuration, credentials, data, and external outcomes.

Convex backups exclude pending scheduled functions, so the durable profile must reconstruct work from its obligation records. External dispatch should remain disabled until the recovery-point gap is reconciled. :chatgpt-content-reference{index="10"}

---

# 11. The first experiment I would actually build

**Build the transactional profile through Layer 2 in a clean, small reference application.**

Use Orders and Inventory, complete order placement, one additional lifecycle command, an essential summary, and journal inspection/reconstruction.

Do not begin by transferring the old application’s entire infrastructure composition.

The first experiment passes when it demonstrates:

| Test | Required result |
|---|---|
| One complete order request | One top-level transaction; no core projection jobs |
| Failure after the first context writes | No partial order, allocation, event history, or essential view |
| Same-key concurrent requests | One logical business effect |
| Same key with changed input | Explicit conflict |
| Successful command followed by query | Essential committed state is visible without a worker |
| Two tenants reuse local identifiers | No collision or disclosure |
| Competing stock requests | Inventory invariant remains valid |
| Historical reconstruction | Matches current business state |
| Interrupted rebuild | Safe resume or abort |
| Production-configuration acceptance | No test-mode shortcuts hiding a different execution path |

The downloadable specification expands this into 38 conformance scenarios, including provider ambiguity, approval races, stale workers, restoration, and online rebuild.

An implementation should pass because it meets those promises—not because it copies particular filenames or class shapes.

Only after this baseline works would I add one durable confirmation effect, with its complete recovery contract. Then a genuine temporal process. Then an agent using the same command boundary.

---

## What this design is trying to achieve

The Atlas provides the historical structure—storage ownership, transaction behavior, execution traces, and implementation guidance—but the new target should be understandable without traversing that source graph. The uploaded directory map reflects those distinct views; it is background navigation, not additional runtime evidence. :chatgpt-content-reference{index="11"}

The intended outcome is not a less disciplined version of the original system.

It is a system in which:

**Business sophistication comes from domain decisions.**

**Consistency comes from Convex transactions.**

**Historical truth comes from explicit, reconstructible facts.**

**Durability machinery appears only where work genuinely crosses a transaction boundary.**

And the defining acceptance criterion is:

> **Increasing domain sophistication must not automatically increase infrastructure sophistication.**