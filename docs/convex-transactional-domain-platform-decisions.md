# Convex transactional domain platform: design decisions

Working notes of 2026-09-29 for a greenfield redesign. This is not a spec and not complete. It records the decisions that shape the design, the reason for each, and what is still unproven.

It grew from `convex-transactional-domain-platform-spec-v0.1.md`, its commentary, and a review of both on 2026-09-29. It stands on its own. The decisions, the facts they rest on, the probes and the acceptance scenarios are all here, and reading v0.1 is not needed. Where the two differ, this document holds the later decision. S-numbers point to the Sources section at the end.

Each decision carries a provenance line. Carried means taken from v0.1 in substance. Changed means the review reversed or narrowed v0.1. New means v0.1 did not address it. The owner has ruled on none of them; all are proposals.

## Thesis

Ownership follows bounded contexts. Atomicity follows the business operation. Asynchrony follows a concrete need to defer work.

The default operation is one Convex mutation. It authorizes a command, makes the domain decision, saves current state with its events, updates essential read models and records the outcome. A second transaction exists only to wait, to spread load, or to reach an external system.

The design succeeds when adding domain sophistication does not add infrastructure.

Layers, each usable before the next exists:

0. Domain: commands, events, `decide` and `evolve`, invariants, small state machines.
1. One context: a component with its state and journal, authorized commands, idempotency, queries.
2. Composed application: a second context, atomic use cases, read models, rebuild.
3. Obligations: local reactions, external effects, recovery, operator exits.
4. Processes: Workflow, time and human waits, approvals, compensation.
5. Agents: proposals, policy, budgets, provider accounting.
6. Advanced reads, each installed on its own trigger.

Profiles group them. Transactional is Layers 0 to 2, durable adds Layer 3, and workflow or agent adds the parts of 4 and 5 it needs. Layer 6 is optional for all. A lower profile never imports, mounts or configures a higher profile's machinery. Security, bounded resource use, useful errors and tests start in Layer 1. Build one thin use case through a layer before making the layer generic.

The first stopping point is Layer 2: a two-context application whose core correctness and essential screens need no background job.

A profile is done when growth stays cheap. The transactional profile is done when a new feature needs only its domain input, events and decision, one command or use-case binding, and the read model it actually uses, and a maintainer can trace its success and failure without unrelated queue, agent or governance registries. The durable profile is done when adding an effect means supplying its policy and handler, while the module supplies dispatch, recovery, inspection and retention. The agent profile is done when the reasoning can be replaced while authority, command correctness and provider accounting stay deterministic.

## How decisions are made

v0.1 went from an event-sourcing concern straight to an event-sourcing mechanism, then checked that Convex did not contradict it. Its table of Convex facts supported a design that already existed. Every weak spot the review found traced back to that order, so the rule here reverses it.

1. Start from the concern: atomicity, retries, ordering, deferred work, read freshness, rebuild, authority, restore, limits. Write down what Convex and its official components already guarantee. That goes into the fact ledger, marked documented, probed on a native backend, or assumed.
2. Every mechanism is a decision whose first option is the do-nothing option, which relies on Convex as it is. A mechanism enters only with three things. The failure it prevents, as a concrete scenario. The ledger fact showing Convex does not prevent it. Its standing cost: writes per command, registered functions, tables, lifecycle states, operator duties, and obligations that keep costing over time, such as keeping old formats readable.
3. Test scenarios are the spine. Check the do-nothing option against each scenario first. Only a failing scenario justifies a mechanism, and the cheapest mechanism that passes wins.
4. Detail follows the build. Layers 0 to 2 get full detail, the first experiment runs, and Layer 3 is written from what it showed. Later layers stay as a trigger, a promise and their scenarios until something triggers them.
5. Review a mechanism by trying to refute it: find a cheaper Convex-native design that passes the same scenarios.
6. A failed scenario names the broken promise. It does not by itself justify a new generic subsystem. First ask whether the failure boundary can be removed or its owner fixed.
7. Compare designs by what each feature needs: independently maintained facts, commit boundaries, persisted state machines, recovery owners. A wrapper that hides twelve registrations has not removed them.

## Laws

The twelve laws of v0.1, one reworded. They are the review surface; the decisions below give the detail.

1. Business writes go only through a context's sanctioned operations. No generic patch endpoint exists.
2. State and its required events commit together. An unexpected failure rolls back the whole command.
3. In a rebuildable domain, events are the only source of the next state.
4. Every command a caller can retry outside the Convex client's own retry carries a server-scoped idempotency key. Reworded, see decision 6.
5. Authorization comes before execution and before any stored outcome is disclosed.
6. A technical or transient failure is never stored as a business rejection.
7. Deferred work is never reported as done before its effect is proven.
8. Every installed durable capability ships with recovery, inspection, retention and compatibility behavior.
9. No invariant depends on a read model that updates later.
10. Replay and rebuild never run original commands or repeat external effects.
11. Every command and query on tenant data names its tenant scope.
12. Each retried piece of work has one retry owner. Transport and workflow retries never multiply it.

## Core decisions: Layers 0 to 2

### 1. One mutation per business operation

_Carried._

A business operation runs as one top-level mutation. It may call several context components, update parent read models and record its outcome, and all of it commits or rolls back together. Inside that mutation, failure handling is a throw. Sagas, compensation and outboxes belong only where the next step runs in its own transaction.

Convex already covers this with serializable mutations and component calls that commit with their caller. There is nothing to add.

Rejected: a saga between two local contexts, a command bus around each internal step, a lock protocol beside optimistic concurrency.

### 2. Each bounded context owns its state and its journal

_Carried._

Each context is a component that owns its current state (CMS), its event journal and its stream metadata, all written by the context's own mutations. Journal code is a shared library each context includes. There is no central event-store component.

The rule "state never changes without its events" is enforced inside the context API, so trusted parent code cannot break it by mistake. No deployment-wide counter sits in every write's path.

| Data | Owner |
| --- | --- |
| CMS | Context |
| Journal events | Context |
| Stream metadata: identity, current version, enumeration including deleted subjects | Context. May live in the CMS document while enumeration and deletion stay correct |
| Command receipts | Parent |
| Access grants | Parent, or a dedicated access context |

Every event carries this envelope:

| Field | Meaning |
| --- | --- |
| `eventId` | Stable application identity |
| `tenantId`, `contextId` | Ownership scope |
| `streamType`, `streamId`, `streamVersion` | Exact order within one subject's history |
| `eventType`, `eventSchemaVersion` | Historical contract |
| `operationId` | The root command or use case that produced it |
| `correlationId` | Diagnostic grouping across operations |
| `causedBy` | Immediate cause, a command or a triggering event |
| `actor` | Server-established actor kind, identity and delegation reference |
| `recordedAt`, optional `occurredAt` | When it was recorded, and when it happened in the domain if that differs |
| `payload` | Validated, bounded fact data |

Order and identity rules:

- An append names the stream version it expects. The check is an indexed read in the same transaction; an index alone is not a unique constraint.
- Order exists only within a stream. No deployment-wide order token exists. Timestamps, `_creationTime` and UUID order never prove that a consumer has seen every committed event.
- Events in different streams relate through `operationId` and `causedBy`. A receipt may list the stream versions one operation touched.
- A reference that crosses a context boundary is `(tenantId, contextId, eventId)`, never a private document ID. Context APIs return DTOs and application IDs.
- Start with indexes for stream replay, event identity and stream enumeration. Add others when a real query needs them.

**Cost.** There is no global event order. Cross-context history is merged through context APIs. A global feed comes back only when a real consumer needs one total order (decision 18).

**Open.** Every read of context data from the parent is a component call. The first experiment measures what that costs per query and per command. Isolation itself stays; it is the platform's defining property. The question is only where hot reads land, and whether a trivial context may be plain tables (see Open questions).

### 3. Events are the only source of the next state

_Carried; the two gaps at the end are new._

`decide(state, command, context)` returns events and a result, or a rejection. The persistence adapter computes the next state as `fold(evolve, state, newEvents)` and saves it. The decider never returns a separate state patch. Commands load current state and apply only the new events; they never replay history. Rebuilding a stream from its events must give the saved business state, and that equality is a test.

Today's platform has two authorities. The decider returns a `stateUpdate` that the handler saves, and a separate `evolve` sits beside it. See `libar-platform/packages/platform-core/src/orchestration/deciderHandler.ts:247` and `libar-platform/packages/platform-decider/src/types.ts:82` and `:224` in convex-event-sourcing at `538314e8a`. Nothing keeps the two in step. One authority makes state and history agree by construction.

Pure domain code reads no database, network, scheduler, environment or ambient auth. Time and outside facts enter as inputs. Facts that matter historically, such as accepted price, currency or policy version, are captured in events and never re-fetched during replay.

**Gap: initial state.** The v0.1 interface has none. Add `initial()` or let `evolve` accept an empty state, so a rebuild from the creation event has a defined start.

**Gap: state across several documents.** Folding is simple when a stream's state is one document. When state spans several, such as an order with separate line rows or stock spread over rows, the adapter needs a mapping from folded state to documents. If each command writes that mapping by hand, a second source of state creeps back. Prefer one document per stream while it fits the size budget. Where it cannot, derive the document writes from the folded state in one place per context.

### 4. Four outcomes, not a boolean

_Carried._

- Applied. Events recorded, state changed.
- Business failure. Something meaningful happened and belongs in history, such as `ReservationDeclined`. It commits like a success.
- Rejection. The request is understood and refused. Nothing commits.
- Technical failure. An unexpected throw. Everything rolls back and nothing is stored as a business outcome.

A transient refusal for rate or capacity is a retryable error, never a stored rejection.

Keeping a refused request as a fact is a business policy chosen per command. An order that waits for stock is a different command from one that rejects when stock is short. Error handling never makes that choice by accident.

### 5. Rebuildable history by default, with baseline events

_Carried; baseline events widened from legacy import to a general tool._

Domain streams are rebuildable from their events by default. Non-domain state, such as preferences, presence, caches and admin tables, uses ordinary authorized Convex mutations. A context may choose audit-only history explicitly, and then never advertises rebuild from events.

The lasting cost of rebuildable history is evolution: every change to `evolve` must still turn old events into the state saved today. The tool for that is a baseline event. When a change in meaning leaves old events unable to reproduce current state, the migration writes a baseline event holding the migrated state, and rebuild starts from the latest baseline. Earlier events stay as readable history. Old events are never rewritten, and old reducer versions are not kept forever. v0.1 allowed a new baseline only when importing legacy data.

A change of representation without a change of meaning is a schema migration, not an event. A `schemaVersion` field alone is not schema evolution.

### 6. Idempotency: Convex covers UI retries, receipts cover the rest

_Changed._

The Convex React client retries a mutation until it is confirmed, and the backend executes each mutation call once (S14, rechecked 2026-09-29). A lost response to a UI command is already handled. v0.1 required a client request key and a receipt on every public command, which repeats that guarantee.

Receipts are required where the guarantee does not reach:

- HTTP actions and webhooks
- mutations called from actions
- workers, workflow steps and agents
- any caller that is not a Convex client

A UI double submit is two separate mutation calls, outside the guarantee. For commands that create something, a client-generated entity ID plus a uniqueness check covers it.

Receipt rules carried from v0.1:

- The server builds the key from tenant, caller namespace, command type and request key. A public caller cannot choose a system namespace.
- The fingerprint covers business input and its contract version, not retry timestamps. Same key with different input is a conflict.
- Authorization is checked again before a stored outcome is disclosed.
- Expiry is explicit. An irreversible command keeps a compact tombstone or relies on a domain uniqueness rule.
- One transaction reads, checks and inserts the receipt, so concurrent identical requests serialize and only one effect commits. A single-transaction command needs no pending state.
- Rate admission for new intent runs after a duplicate is recognized, so a valid retry is never refused for capacity.

Receipts are thin: outcome, operation ID, affected IDs and stream versions. They do not store the full original result. Stored results force every result format to stay decodable for the whole retry window, and the client reads state through reactive queries anyway. A rejected command stores nothing (decision 7), so its key stays unused.

**Probe.** Where the client guarantee ends: a tab closed with a pending mutation, a server restart, the HTTP client.

### 7. Rejections are thrown, not stored, at the public boundary

_Changed._

A rejected command throws a structured `ConvexError`. The whole mutation rolls back, the caller receives the rejection, and nothing is stored. If the response is lost and the command runs again, that is correct. The caller never saw the first answer, and if the command now succeeds, the intent ran once.

v0.1 wrapped every command body in a nested mutation so a rejection receipt could survive the rollback. The nested mutation stays only where the caller must survive the failure:

- a worker wrapper that records the attempt after the body fails (decision 13)
- a refusal that must stay on record, such as a denied security-sensitive request or a rejected agent proposal. That record is a business fact, written through the normal path.

If a public boundary does need it, use one generic internal dispatcher mutation. A registered body per command doubles the functions every command needs.

`ctx.runMutation` inside a mutation gives partial rollback and costs more than a helper call (S10, rechecked 2026-09-29). A catch around an ordinary helper does not undo its writes.

**Probe.** `ConvexError` data survives a nested mutation and a component boundary intact.

### 8. Read models update inside the command; queries may read context state through its API

_Carried; departs from today's platform rule._

The core path runs zero projection jobs. The simplest read that works wins:

| Read need | Default |
| --- | --- |
| One entity's detail | Authorized component query returning a DTO |
| Essential list or summary | Indexed query, or a read model updated in the command |
| Small cross-context view | Parent query over bounded component reads, or a read model updated in the command |
| Broad reporting | Outside the baseline |

A projection is named, versioned and deterministic. It never issues commands or causes effects, and live update and rebuild share its logic. After a successful command, an authorized query sees the committed state or a later one. Command results carry affected stream versions so a client can compare. Reactive queries replace any event-to-WebSocket layer.

Today's rule is "never query CMS directly, use projections for all reads". Here, CQRS means separate contracts for commands and queries. It does not mean a second copy of every field. A context query returns a deliberate DTO, and its private schema stays private.

### 9. Rebuild online by default; pause writes only for history-dependent views

_Changed. v0.1 made a scoped write pause the default and online rebuild an advanced layer._

Because read models update inside commands, rebuilding a per-entity or current-state read model online is safe on Convex:

1. Register a new generation of the read model as building.
2. Live commands also write the building generation. A command that creates a stream writes its row. A command on an existing stream updates the row only if backfill has already written it, because an incremental update on a missing row builds a partial one.
3. Backfill batches read or fold each source at its current stream version and write the row only if the target is missing or older. Optimistic concurrency orders each batch against live commands, so neither overwrites newer data.
4. Verify coverage, then switch the active generation in one write. Keep the old generation for a rollback period.

`@convex-dev/migrations` provides resumable batching. Counts and sums need a per-entity marker so live commands and backfill never count one entity twice, which is still transactional.

The write pause stays for read models that depend on history across several streams, where rebuild needs a consistent cut. Under it, every writer in the scope reads a maintenance gate, background writers are fenced or drained, and an operator can resume or abort. It costs more than the online path, so it is the exception.

Rebuild never runs commands or external effects.

**Probe.** A backfill batch racing a live command; the migrations component fits a generation backfill.

### 10. Contexts meet only in parent use cases

_Carried; batch-shaped APIs are new._

Contexts never read each other's tables and never call each other. A rule linking two contexts lives in a parent use case, in the same transaction, or in an obligation that runs later. No handler inside a transaction issues commands, so every cross-context rule is visible in one place. The cost is that the parent grows with each such rule; group use cases by business flow.

A context operation called by a use case is not a public command. `PlaceOrder` has one receipt and one outcome, and the context steps inside it get no command lifecycle of their own. Placing an order is one command, never `CreateOrder`, then `AddOrderItem` per line, then `SubmitOrder`.

Context APIs take lists, such as `inventory.allocate({ lines })`, so a use case makes one call per context rather than one per line. O(N) business work is fine. O(N) component calls or orchestration is not the default.

An operation too large for one transaction is rejected, or becomes a separate import command with honest partial progress. Splitting it silently changes its contract.

### 11. Tenant scope and authority from day one

_Carried._

Every tenant-owned record, and every command and query on tenant data, names its tenant, even in a single-tenant deployment. An absent tenant is never a wildcard. Retrofitting tenancy costs far more than carrying a constant scope now.

The parent authenticates and authorizes, then passes server-established actor and scope into components, which have no `ctx.auth`. One authorization vocabulary covers humans, services, agents, reviewers and operators. Grants are authoritative data, never a read model that updates later. A worker carries captured provenance and states whether it re-checks the delegating user's current rights or runs an accepted obligation under a narrow service authority.

The trust boundary is one trusted deployment. Component privacy and type brands stop unauthorized clients and accidental cross-module access. They do not stop a malicious administrator, and no parent-signed token claims to.

### 12. One declaration per command, generated bindings later

_Carried._

Each command has one declaration: name, input and output schema, executor, permission policy and the read models it maintains. Convex functions stay static exports that code generation can see. Start with shared schema values, inferred types and a small composition helper. Generate the repetitive bindings only after two real modules show the pattern. Generation is deterministic and checked in CI.

No DI container, decorator framework, reflection registry or module lifecycle. A class may group a module's declarations and holds no correctness-critical global state. The test of the module system is whether it removes independently maintained wiring facts. Hiding them behind a wrapper does not count.

One canonical schema per command. A schema converter that silently drops refinements is not acceptable.

## Durable and later layers

These layers are installed only when their trigger appears. Their detail here is as deep as the design needs today; the build that triggers a layer writes the rest.

### 13. Deferred work is an obligation

_Carried; the do-nothing check is new._ Trigger: an effect must happen after the transaction, a wait, background isolation, or external I/O.

An obligation records one promise, such as "deliver confirmation for operation X". It commits in the same transaction as the business change, and its first scheduling joins that transaction. It is not a copy of every event. It has one generic lifecycle:

| State | Meaning |
| --- | --- |
| pending | Accepted. A retry is a timestamp on pending, not a state |
| running | An external call has claimed execution. Local reactions skip it |
| succeeded | The effect is proven |
| needs attention | Exhausted, uncertain, authority revoked, unsupported version |
| cancelled | Will not happen, and no call is still in flight |
| abandoned | An operator ended it unfulfilled. Never shown as success |

An obligation holds:

- an effect key, unique per tenant and logical effect
- the source operation, and the source event where there is one
- handler key, handler version and payload schema version
- the exact accepted payload, or an immutable versioned reference to it, never a pointer to the latest payload
- the server-established authority it runs under
- status, next attempt time, attempt count and deadline
- an attempt number and active attempt ID that fence stale dispatches
- for external calls, a lease that marks execution ownership and proves nothing about provider cancellation
- completion evidence, or the last classified error

A scheduler or Workpool ID is execution metadata. The obligation, or an identified domain record, is the evidence of fulfillment.

A local reaction is a scheduled mutation. Its wrapper checks the obligation and runs the effect body as a nested mutation. On success, the effect and the completion commit together. On a known business rejection, the wrapper records the settled business result. On a retryable failure, the body rolls back and the wrapper records the next attempt or needs attention. An unexpected wrapper failure leaves no partial effect, and the sweeper rearms it. No `onComplete` callback decides whether the effect happened; a UI learns of completion by a reactive query of the obligation. One batched sweeper per module recovers failed or missing dispatches, leaves a legitimate backlog alone, and escalates when recovery itself keeps failing. Specialized records exist only where they carry distinct business evidence, such as payment attempts or approvals.

A full worker pool delays work and never turns valid intent into a rejection. Partition concurrency by real contention or provider limits, and make tenant fairness an explicit policy once one tenant can starve another. A small static subscription creates its obligations in the publishing transaction, and that fan-out counts toward the command's budget. Larger or dynamic fan-out is a separate durable task that snapshots its routing. Derived commands carry causation and a server namespace, and reaction chains have a bound against cycles.

Routine TTL never deletes an unresolved obligation. A completed one stays until every retry, redelivery and replay horizon that could repeat it has closed. Bulky diagnostics may expire earlier while a compact identity stays. The module ships scoped inspect, retry, reconcile, cancel and abandon operations. A repair records reason, actor, old and new attempt, and the exact subject. No operator can create a success without evidence.

**Do-nothing check at activation.** A plain scheduled mutation plus a scan of `_scheduled_functions` for failed runs may cover a local reaction. The obligation table earns its cost through restore, since backups exclude scheduled functions, through retention past the system table's window, and through business visibility and operator exits. Confirm the system table's states and retention before building.

### 14. External effects declare how repetition is safe

_Carried._

Claim the attempt in one transaction, call the provider in an action, settle in a second transaction. Each effect picks one policy:

- reuse the provider's idempotency key within its validity period
- reconcile with the provider before any new irreversible attempt
- declare duplicates acceptable as a business property, still with bounded retries

With no safe policy, an ambiguous outcome goes to needs attention. A fresh random provider key is not a retry. A stale worker cannot overwrite a newer decision, but its late provider evidence is kept and reconciled. Fencing database writes does not stop a network call already sent. Compensation is a new business operation with its own identity.

### 15. One retry owner per obligation

_Carried._

The obligation module owns retry policy. When concurrency or provider limits call for Workpool, it runs with its own retries off, or ownership passes to it deliberately and its attempts show the same way. A workflow waits on an obligation's result and never retries the same effect on its own. Convex's internal transaction retries are not business attempts.

### 16. Processes use the Workflow component

_Carried._ Trigger: the operation spans time, external systems or human decisions.

Workflow is the durable engine. The application keeps a business process record whose meaning does not depend on the engine's step names. Local steps that can commit together are one mutation; only waits and external effects become steps. The definition version is saved at start. A deploy keeps old runs executable, migrates them, or blocks them with an operator remedy. Two contexts taking part in one operation is not a reason for a process.

Approvals bind to the exact proposal: operation, input hash, who may approve, expiry, policy version. Changing the input voids the approval. Two checks stay separate. The approval shows that an authorized person approved this exact proposal. Execution checks again that the operation is still permitted and valid now. Rejection, expiry and concurrent execution each have an explicit transition, so no process stays pending after its proposal was refused.

Worked example. `StartCheckout` is a different contract from atomic `PlaceOrder`. It records an order awaiting payment and a stock reservation with a business expiry, and returns a process ID with an honest awaiting-payment status. The process requests a payment effect, waits for provider evidence, then confirms order and allocation in one local transaction. A definite payment failure releases the reservation. An ambiguous status waits for reconciliation and never triggers a second payment. A payment that lands after the reservation expired needs an explicit policy: reallocate, ask a person, or refund as a separately tracked operation.

### 17. Agents call the same command path

_Carried._ Trigger: a model's judgment is part of a product capability.

Agent reasoning produces a structured proposal. A deterministic policy checks it, a human approves where policy says so, and the ordinary command boundary executes it. An agent cannot write state or journals, choose a system namespace, grant itself rights or create approvals. Untrusted input, such as a retrieved document or a hostile prompt, cannot widen its server-side capabilities. The agent module owns runs, proposals, provider attempts and its own audit, not the business objects it acts on.

Each run has bounds on spend, attempts, elapsed time and tool or command calls. A paid call reserves budget before dispatch and settles once from evidence. It records provider and model, input artifact versions or a protected payload reference, request fingerprint, prompt and policy version, attempt identity and observed usage, within what the product's data policy allows. Concurrency slots and money are separate resources. A timed-out lease proves nothing about the provider, and unknown cost is never released as zero, yet an uncertain call still gets reconciliation and an operator exit so its slot is not lost for good. A provider retry may cost money even when the domain command is idempotent, so database idempotency does not give exactly-once billing.

Model confidence is advisory. Risk policy depends on action kind, scope, value, reversibility, provenance and measured model performance, and no reported confidence overrides a human-only rule.

### 18. Everything else waits for its trigger

_Carried._

| Capability | Trigger |
| --- | --- |
| Coalesced recomputation of a view | Recomputing a nonessential view per command costs too much, and only the latest state matters |
| Ordered event consumer | Every selected event matters and order changes the result. Sequence is allocated per consumer partition in the source transaction |
| Online rebuild of cross-stream history views | The write pause is unacceptable for them |
| Explicit scope revision (DCB) | A decision must hold against a reviewed multi-entity scope |
| Global ordered feed | A real consumer needs one total order across contexts |
| Snapshot or archive tier | Rebuild cost or journal size exceeds its budget |
| Cryptographic delegation | Independent issuers or trust boundaries |
| Durable circuit breaker | A failing provider causes costly repeated attempts |
| Generic reservation library | Several real domains share reservation semantics |
| Generic process manager | Several reactions share real correlation state |
| Large fan-out dispatcher | Static fan-out no longer fits the transaction budget |
| External broker or separate deployments | Independent consumers, retention, security or geography require them |

Activating one records the actual consumer, why the simpler layer falls short, the new failure boundary and the acceptance proof. A possible future need is not a trigger.

Core rules of the Layer 6 capabilities, for when one activates:

- **Coalesced recomputation.** The command marks a scoped view key dirty in its own transaction, and several changes can share one pending recompute. A recompute reads authoritative state, updates the view and clears only the work it covered; optimistic concurrency keeps a newer mark from being cleared. If the computation must leave the transaction, it captures every source version and membership it depends on and validates them before publishing. The view shows its staleness, no command decides from it, and it cannot serve a view that needs every event.
- **Ordered consumer.** Order is per tenant, consumer, generation and partition, with the smallest partition the view's meaning allows. The source transaction allocates a contiguous consumer sequence, which differs from the stream version, so a filtered consumer never waits for events it did not subscribe to. A worker applies a bounded contiguous batch and never skips a failed head. A poison event blocks only its partition. Skipping it is an authorized, recorded data-loss decision, and the consumer contract says whether it is allowed.
- **Online rebuild of cross-stream views.** Declare the rebuild class first: per entity, bounded current state, or history across streams. A vector of per-stream positions is bookkeeping and does not prove a consistent cut. History across streams needs a dependency protocol or a real consistent source cut. Until that exists, these views rebuild under the write pause.

Not standing requirements: aggregate base classes, asynchronous delivery per event, a command bus for internal calls, a DI lifecycle, runtime declaration registries, signing inside one trusted parent, telemetry that can veto a business write, a central event store with a global position, full-result receipts, a nested mutation per command.

### 19. Operations travel with the capability

_Carried._

- Logging and metrics failures never cancel a valid business write. Mandatory business or security audit is written inside the transaction and fails closed.
- Accepted work stores a logical handler key and version. Stable shims stay while vendor jobs refer to old function handles. An unsupported version goes to needs attention, never an endless retry.
- Restore starts with external dispatch off, reconciles the gap since the backup, and rebuilds schedules from obligations. External idempotency keys survive restore.
- Every bulk operation, sweeper and batch has a stated bound, tested against the pinned Convex version. Platform limits are ceilings, not batch sizes.
- Events stay small. Personal data sits behind references where rebuild does not need it. A retention and deletion policy exists before production data, and it states which historical claims survive deletion. Redacting a returned copy is not erasure. Diagnostics hold no raw prompts, credentials or unbounded payloads.
- Diagnosis works by request key or operation ID, tenant, business subject and causation. Logs are observations; stored receipts are the authority for what committed. Measure what the installed layers create: command latency and optimistic-concurrency retries, event writes, read model cost, age of the oldest unresolved obligation, retry and exhaustion counts, provider uncertainty, rebuild and restore progress.
- A release preserves, migrates or drains pending work. Reset-only upgrades are for disposable environments. Code, schemas, configuration, credentials, data and external outcome evidence all belong to the recovery plan, and restore is tested, not only backup.

## Fact ledger

What the design relies on. Documented means stated in Convex docs. Rechecked means read again on 2026-09-29 during the review. Probed means a native backend test showed it. Nothing is probed yet.

| Fact | Status | Decisions |
| --- | --- | --- |
| Mutations are serializable under optimistic concurrency | Documented, S1 | 1, 9 |
| Component calls commit or roll back with the calling mutation | Documented, S2 | 1, 2 |
| `ctx.runMutation` inside a mutation gives partial rollback; the parent can catch and continue | Documented, S10, rechecked | 7, 13 |
| `ctx.runQuery` and `ctx.runMutation` inside a mutation cost more than a helper call | Documented, S10, rechecked; size unknown | 2, 7 |
| The React client retries mutations until confirmed, and the backend executes each call once | Documented, S14, rechecked | 6 |
| React and Rust clients run one client's mutations one at a time, in order | Documented, S15, rechecked | 6 |
| Queries are reactive; subscriptions synchronize state and are not durable event delivery | Documented, S5 | 8 |
| Scheduling from a mutation commits with it | Documented, S6 | 13 |
| Scheduled mutations retry internal errors and run once; developer errors end them; scheduled actions are not retried | Documented, S6 | 13, 14 |
| An action's mutation calls are separate transactions | Documented, S7 | 14 |
| Components have no `ctx.auth` | Documented, S4 | 11 |
| Backups exclude pending scheduled functions | Documented, S8 | 13, 19 |
| Transactions have limits | Documented, S9 | 10, 19 |
| `ConvexError` data survives a nested mutation and a component boundary | Assumed | 7 |
| A parent query calling a component query stays reactive | Assumed | 8 |
| `_scheduled_functions` shows failed runs for some retention window | Assumed | 13 |
| `@convex-dev/migrations` fits a generation backfill | Assumed | 9 |

Probes, in the order the decisions need them. Each is one small test on a native backend.

1. Where the client's exactly-once guarantee ends: a tab closed with a pending mutation, a server restart, the HTTP client. Decision 6.
2. `ConvexError` data across a nested mutation and a component boundary. Decision 7.
3. Cost of one component call in latency and function-call quota. Decisions 2 and 8.
4. Whether transaction limits add up across nested calls and components. Decision 10.
5. A parent query over component queries stays reactive, and how pagination crosses the boundary. Decision 8.
6. A backfill batch racing a live command under optimistic concurrency. Decision 9.
7. Before Layer 3: what a restore leaves of Workpool and Workflow state, and the states and retention of `_scheduled_functions`. Decisions 13 and 19.

## Acceptance scenarios

The acceptance contract. Scenarios test behavior, not package names or the number of layers. Layer is the first layer that makes the capability available. Origin says whether a row comes from v0.1 unchanged, was changed by the review, or is new.

| Layer | Scenario | Pass condition | Origin |
| --- | --- | --- | --- |
| 0 | Evaluate a decision twice with identical inputs | Identical output, inputs unchanged, no I/O | v0.1 |
| 0 | Run commands incrementally, then rebuild the stream from its events | Same business state and stream version | v0.1 |
| 1 | A command asks for an invalid state transition | Documented rejection; no state or event change | v0.1 |
| 1 | Inject a failure after the state write, after the journal append, and before the receipt | Nothing from the command commits | v0.1 |
| 1 | A non-UI caller sends the same command concurrently, and again after a lost response | One business effect, one stored outcome | Changed: non-UI callers |
| 1 | The UI submits the same create twice | One entity, through the client-generated ID and uniqueness check | New |
| 1 | Reuse a key with changed business input | Explicit conflict; original outcome and state unchanged | v0.1 |
| 1 | Two tenants use the same request key and local ID | No collision, no disclosure | v0.1 |
| 1 | A client claims a worker or agent namespace | Refused | v0.1 |
| 1 | Authorization is revoked, then a successful command is retried | Stored outcome not disclosed | v0.1 |
| 1 | Rate or capacity refusal, then a retry of the same intent | Nothing stored; the retry can succeed | v0.1 |
| 1 | A command names a stale, explicitly reviewed version | Rejected as stale, never reinterpreted against fresh state | v0.1 |
| 1 | Two commands compete for the same stock or unique value | Invariant holds; a logical conflict is told apart from an engine retry | v0.1 |
| 1 | A rejected command's response is lost, and it is retried after state changed | It runs against current state; nothing of the first attempt remains | New |
| 2 | The first context writes, then the second rejects or throws | Everything rolls back; the caller gets the rejection; nothing is stored | Changed: no rejection receipt |
| 2 | A successful command, then a query or subscription | Committed state visible without any worker | v0.1 |
| 2 | Orders of 1 line, 10 lines and the maximum | One top-level commit each, zero projection jobs, one call per context, budgets hold | Changed: call count added |
| 2 | Rename a typed handler or break its argument contract | A build, type or registration check fails before any traffic | v0.1 |
| 2 | Rebuild a per-entity read model online while commands run; interrupt and resume | No stale overwrite, no missing entity, no side effects; cutover and rollback work | Changed: online by default |
| 2 | Rebuild a cross-stream history view under a write pause; interrupt | Resume or abort safely; writes reopen only after verification | Changed: only for these views |
| 2 | Rebuild a stream that has a baseline event | Equals saved state; earlier events still readable | New |
| 2 | Restore a representative dataset with matching code and configuration | Domain, journal and read-model invariants hold; the procedure runs | v0.1 |
| 2 | Run native acceptance with production configuration | Same authority, schemas, concurrency and code path as a release | v0.1 |
| 3 | Duplicate a local worker and lose any completion callback | One effect; the obligation's truth does not depend on a callback | v0.1 |
| 3 | Kill a dispatch before work, or fail the scheduled wrapper | The obligation remains; a bounded rearm follows | v0.1 |
| 3 | Legitimate backlog builds up | Queued work is not replaced for not having started | v0.1 |
| 3 | Exhaust retries, including failures of recovery itself | Needs attention, with a working operator exit | v0.1 |
| 3 | The provider succeeds but the reply is lost | Reconciliation or the same provider key prevents a second irreversible effect | v0.1 |
| 3 | An old worker reports after a new attempt or a cancellation | No stale overwrite; its provider evidence is kept and reconciled | v0.1 |
| 3 | Restore while provider state has moved past the backup | Dispatch waits until the gap is reconciled; identities stay stable | v0.1 |
| 3 | Retention runs while retries or redelivery are still possible | Dedup and obligation evidence survives; no unresolved work is erased | v0.1 |
| 4 | Restart a process after an external step completed | The step does not repeat; progress is correct | v0.1 |
| 4 | Race approval, expiry, revocation and execution | Only authorized transitions; no process stuck pending | v0.1 |
| 4 | Deploy while an old process is in flight | It continues, migrates, or blocks with a remedy | v0.1 |
| 5 | An agent proposes a valid-looking unauthorized command | Ordinary policy rejects it; no bypass path exists | v0.1 |
| 5 | Proposal input changes after approval, or the run exceeds its budget | Approval is void; execution is blocked | v0.1 |
| 5 | A paid call times out and usage arrives later | Settles once; never zero cost; no slot lost for good | v0.1 |
| 5 | A retrieved document or prompt tries to widen the agent's rights | Server-side capabilities unchanged | v0.1 |
| 6 | Source changes during a coalesced recompute | The change stays covered or dirty | v0.1 |
| 6 | Duplicate and out-of-order events reach a noncommutative consumer | Each applied once, in partition order | v0.1 |
| 6 | One ordered partition fails | Other partitions progress; the failed one is inspectable | v0.1 |
| 6 | A cross-stream backfill races live writes and new subjects, then cuts over | No overwrite, no missing subject, no side-effect replay | v0.1 |
| All | Break metrics and logging; separately, break mandatory audit | Diagnostics never abort valid work; an audit failure does | v0.1 |

Tiers. Domain tests are pure. Simulator tests cover outcome combinations, serialization and classification. Native tests prove component and nested-mutation behavior, scheduling, contention and deployment. A small end-to-end path runs the production composition. The kernel's fixture app is separate from the example app, test-only functions never ship in production, and every test owns its disposable backend.

Evidence. A run records the commit, installed layers, backend and dependency versions, configuration, dataset, command and result. A simulator pass is not native proof, and a link between source and test is not a passing run. A run with adjusted configuration states how it differs from production. Readiness is stated plainly as specified, implemented, tested under named conditions, or operationally accepted.

## First experiment

Build Layers 0 to 2 in a small, clean application: Orders and Inventory, complete order placement, one more lifecycle command, one essential summary, journal inspection and rebuild. Reuse the pure deciders and state machines where they fit, under the one-authority rule of decision 3. Leave the current app's infrastructure behind.

It passes when every Layer 0, 1 and 2 scenario passes on a native backend.

Measure orders of 1 line, 10 lines and the chosen maximum, without and with stock contention. Count top-level commits, function and component calls, documents read and written, and rows left behind, with healthy-path and retry costs reported separately. Semantics come first, speed second. Latency and throughput targets are product decisions made before the benchmark.

The cost targets from the commentary are one top-level commit per successful command, zero core projection jobs, O(N) business work allowed, one public command execution per business intent, no application-wide counter, and no queue recovery needed for essential reads.

The results feed the open question on component cost and the Layer 3 decisions.

## Open questions

- May a trivial context with no invariants of its own be plain tables in the parent behind lint rules, instead of a component? Decide after the experiment measures component call cost.
- Does the product need a record of refused commands anywhere, for security audit or agent proposals? That decides where decision 7's nested mutation is required.
- One document per stream as the default, and the largest order the placement command supports.
- Where the probe app and the experiment live. `lap/` holds only documents and is not a git repository.
- Whether the decisions move into SDP carriers later. The mapping is direct: ledger facts become constraints, decisions become decision carriers that list the do-nothing option, and scenarios become behavior rules with examples.
- The vocabulary clashes below.

## Vocabulary

Terms as used here, with clashes against today's platform glossary in convex-event-sourcing at `libar-platform/packages/CONTEXT.md`. Glossary edits stay with the owner.

- **CMS.** Command model state, the current state a command decides from.
- **Journal.** A context's store of its events.
- **Stream version.** The number of events in a stream. v0.1 says revision. Today's glossary chose stream version and avoids revision, and this document follows it.
- **Receipt.** Here, the stored outcome of a command for idempotency. Today's glossary uses receipt for a row that proves an effect happened. Pick one meaning before code names it.
- **Obligation.** The durable record of promised deferred work. v0.1 alternates between obligation and effect. Here, effect means only the change the work makes, and attempt means one try.
- **Generation.** Here, a numbered build of a read model. Today's glossary uses it for the attempt number of watched work. Pick one.
- **Operation.** The root accepted command or use case. Its ID ties together everything one request caused.
- **Baseline event.** An event holding migrated state, from which rebuild starts.
- **Do-nothing option.** The design that adds no mechanism and relies on Convex as it is.

## Existing systems

This design authorizes no deletion or migration of existing data. Keep the current implementation and its evidence as a baseline, and map each existing contract to the decision that continues, changes or retires it.

- A retained central journal stays behind an adapter, or moves by a verified one-way migration that keeps event identities, stream versions, tenant and context scope, and reader compatibility. No dual writes to old and new stores.
- Incomplete history stays audit-only, or gets a baseline event that starts a rebuildable epoch. Past business events are never invented to satisfy the rebuild law.
- An old queue or handler retires only after its accepted work is drained, migrated or settled. Its dispatch shim stays while vendor jobs refer to it.
- A read model moved into the command transaction needs one correct rebuild. Changing future writes alone does not repair it.
- A mechanism with no retained obligations and no consumer does not survive because a document named it.

## Notes on v0.1 and its commentary

- The commentary contains `:chatgpt-content-reference{...}` markers and a `sandbox:/mnt/data` link.
- The commentary's additions over the spec, the first-experiment table and the cost targets, are folded in above.
- v0.1's fact table in its section 2 lists nine facts chosen after the design. The fact ledger replaces it.
- The acceptance scenarios above replace v0.1's list of 38. Rows marked changed or new differ from it.

## Sources

S1 to S13 are v0.1's sources, checked by its author on 2026-09-29. S10, S14 and S15 were read again during the review the same day.

| Ref | Source | Used for |
| --- | --- | --- |
| S1 | https://docs.convex.dev/database/advanced/occ | Serializable mutations, optimistic concurrency |
| S2 | https://docs.convex.dev/components/understanding | Component isolation and transactional composition |
| S3 | https://docs.convex.dev/api/interfaces/server.GenericMutationCtx | Nested mutation execution |
| S4 | https://docs.convex.dev/components/authoring | Component API visibility, explicit identity, function handles |
| S5 | https://docs.convex.dev/realtime | Query subscriptions as state synchronization |
| S6 | https://docs.convex.dev/scheduling/scheduled-functions | Atomic scheduling, execution and error semantics, auth propagation |
| S7 | https://docs.convex.dev/functions/actions | External I/O and separate transactions |
| S8 | https://docs.convex.dev/database/backup-restore | What backups include and exclude |
| S9 | https://docs.convex.dev/production/state/limits | Document, transaction and scheduling limits |
| S10 | https://docs.convex.dev/understanding/best-practices | Helpers versus nested calls, partial rollback |
| S11 | https://www.convex.dev/components/workflow | Durable workflow execution |
| S12 | https://www.convex.dev/components/workpool | Concurrency-controlled work execution |
| S13 | https://docs.convex.dev/testing/convex-backend | Native integration testing |
| S14 | https://docs.convex.dev/client/react | Client mutation retries and single execution |
| S15 | https://docs.convex.dev/functions/mutation-functions | Ordered mutation queue per client |

The sources support the Convex facts, not the correctness or performance of this design, which nothing has run yet.
