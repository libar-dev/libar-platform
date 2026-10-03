---
id: spec:platform.vocabulary
kind: model
altitude: feature
readiness: defined
relations:
  refines: spec:platform.transactional-domain-platform
---
# Platform vocabulary

Feature · Detail: full transcription · Traces: Vocabulary, D2, D3, D4, D6, D8, D9, D11, D13, OQ6.

`CONTEXT.md` is the platform's language and this model follows it: where the two differ, `CONTEXT.md`'s word wins and this list is corrected. The doc fixes nine terms and names two clashes with today's glossary. This model carries those nine, the words the doc uses without defining them separately, and the terms the other packages need so that every family names one concept with one word. Where a Convex term and a doc term differ, the doc's word names the design concept and the Convex word names the mechanism: an obligation is the record, a scheduled function is the dispatch. Stream version, never revision. Obligation for the record, effect for the change it makes, attempt for one try. Receipt for the stored idempotency outcome. Generation for a numbered read-model build.

The two clashes are answered: a row that proves an effect happened is completion evidence, and the attempt number of watched work is the attempt.

## Intent

- outcome: One word per concept across every package of the corpus, with the doc's meaning where the doc fixes one and `CONTEXT.md`'s word where the two glossary clashes were answered (Vocabulary, OQ6)
- value: Specs, code and tests name the same things the same way, and a reviewer can reject a synonym for a locked term by pointing at one list (Vocabulary)
- risk: A word used for two things is a gap in the language; a reviewer reports it against `CONTEXT.md`, and the owner rules on the term (OQ6)

### Open questions

- [non-blocking] OQ6, receipt: this design uses receipt for the stored outcome of a command for idempotency, while today's glossary uses receipt for a row that proves an effect happened; the owner answered OQ6 with receipt for the stored outcome of a command and completion evidence for the row that proves an effect happened (OQ6, Vocabulary)
- [non-blocking] OQ6, generation: this design uses generation for a numbered build of a read model, while today's glossary uses it for the attempt number of watched work; the owner answered OQ6 with generation for a numbered build of a read model and attempt for one try at an obligation (OQ6, Vocabulary)

## Model

- **CMS** — Command model state, the current state a command decides from (Vocabulary).
- **journal** — A context's store of its events (Vocabulary).
- **stream** — One subject's history: the events with one `tenantId`, `contextId`, `streamType` and `streamId`, ordered by stream version (D2).
- **stream version** — The number of events in a stream; v0.1 said revision, today's glossary chose stream version and avoids revision, and this design follows it (Vocabulary).
- **event** — A recorded fact in a stream's history, carried in the fifteen-field envelope that D2 fixes (D2).
- **envelope** — The fifteen fields every event carries: identity, ownership scope, position in the stream, historical contract, operation, correlation, cause, actor, times and payload (D2).
- **baseline event** — An event holding migrated state, from which rebuild starts; earlier events stay as readable history (Vocabulary, D5).
- **command** — A caller's request to the parent to carry out one business operation, with one declaration and exactly one outcome; a stream command is the part addressed to one stream, which that stream's decider decides against current state, loading current state and applying only new events (D3, D10).
- **entry** — A function the parent registers for a caller: a public command, an internal command, a parent query or an operator entry (D7, D19).
- **parent query** — A read the parent answers to a caller, authorized in the parent, relaying a context query or reading a read model (D8, D11).
- **context query** — A read a context answers to the parent, returning a DTO (D8).
- **query refusal** — The refusal of a parent query, in a rejection's wire shape with the name of the entry that refused; it is not an outcome and nothing is recorded (D7, Law 5).
- **decider** — The pure rules of one stream type: `decide`, `evolve` and the initial state, reading no database, network, scheduler, environment or ambient auth (D3).
- **fold** — Computing the next state as `fold(evolve, state, newEvents)`; the one authority for state (D3).
- **outcome** — One of applied, business failure, rejection or technical failure (D4).
- **applied** — The outcome where events were recorded and state changed (D4).
- **business failure** — The outcome where something meaningful happened and belongs in history, such as `ReservationDeclined`; it commits like a success (D4).
- **rejection** — The outcome where the request is understood and refused; nothing commits (D4).
- **technical failure** — An unexpected throw; everything rolls back and nothing is stored as a business outcome (D4).
- **transient refusal** — A retryable error for rate or capacity, never a stored rejection (D4).
- **context** — A bounded context, realized as one Convex component that owns its CMS, its journal and its stream metadata (D2).
- **parent** — The application deployment that mounts the context components, authenticates and authorizes, runs use cases, and owns receipts and access grants (D2, D11).
- **use case** — A business operation in the parent that calls one or more contexts in one transaction and has one receipt and one outcome (D10).
- **operation** — The root accepted command or use case; its ID ties together everything one request caused (Vocabulary).
- **receipt** — The stored outcome of a command for idempotency: outcome, operation ID, affected IDs and stream versions, never the full result (Vocabulary, D6).
- **request key** — The caller-supplied part of an idempotency key; the server combines it with tenant, caller namespace and command type (D6, Law 4).
- **fingerprint** — The digest over business input and its contract version that a receipt stores, so the same key with different input is a conflict (D6).
- **caller namespace** — The server-assigned namespace of a caller, one of the closed union public, service, worker, agent and system that `spec:command.actor-and-scope` pins under E-6, which a public caller cannot choose (D6, D11, E-6).
- **tenant scope** — The tenant a record, command or query names; an absent tenant is never a wildcard (D11).
- **actor** — The server-established kind, identity and delegation reference of whoever caused a command: human, service, agent, reviewer or operator (D2, D11).
- **grant** — Authoritative access data the parent reads in the transaction, never a read model that updates later (D11).
- **read model** — A stored, queryable shape updated inside the command from committed state (D8).
- **projection** — The named, versioned, deterministic logic that maintains a read model; live update and rebuild share it (D8).
- **DTO** — The deliberate shape a context query returns; the context's private schema stays private (D8).
- **generation** — A numbered build of a read model (Vocabulary, D9).
- **installation** — Making a read model exist in a deployment: its declaration and its first rebuild (D9).
- **backfill** — The part of a rebuild that writes a generation's rows from its sources (D9).
- **verification** — The part of a rebuild that checks a generation's rows against its sources and corrects them (D9).
- **pass** — One traversal of a rebuild over its sources or its rows: a backfill, a verification, a purge or a fill (D9).
- **switch** — Making a verified generation the one readers see (D9).
- **rollback** — Making a retired generation the one readers see again (D9).
- **retired generation** — A generation readers no longer see, kept until it is purged (D9).
- **purge** — Deleting a retired generation's rows (D9).
- **fence** — The number a generation's batches carry so that a stale batch writes no read-model row and schedules nothing (D9).
- **progress row** — The row that holds where a rebuild stands, read by its batches and by no command (D9).
- **tenant list** — The parent's list of tenants, which a rebuild and a sweep walk (D11, D19).
- **backup archive** — The exported file of a deployment's table data at one moment, which a restore imports; a snapshot is a transaction's view of the database, never the archive (D19).
- **stated operator** — The name an administrator states at an operator entry; it records who said they acted and establishes no actor (D19, D11).
- **write pause** — The maintenance gate under which a read model that depends on history across several streams rebuilds; every writer in scope reads it (D9).
- **obligation** — The durable record of promised deferred work; one promise, committed with the business change (Vocabulary, D13).
- **effect** — The change a piece of deferred work makes, as distinct from the obligation that records the promise (Vocabulary, D13).
- **attempt** — One try at fulfilling an obligation, numbered and fenced by an active attempt ID (Vocabulary, D13).
- **effect key** — The key unique per tenant and logical effect that identifies an obligation (D13).
- **dispatch** — The scheduled function or Workpool job that carries out an attempt; its ID is execution metadata, never evidence of fulfillment (D13).
- **lease** — For an external call, the marker of execution ownership; it proves nothing about provider cancellation (D13).
- **completion evidence** — The record that proves an effect happened; today's glossary calls this a receipt (D13, OQ6).
- **needs attention** — The obligation state for exhausted, uncertain, revoked or unsupported work, always with an operator exit (D13).
- **sweeper** — The one bounded batch per obligation module that recovers failed or missing dispatches and leaves a legitimate backlog alone (D13).
- **repetition policy** — An external effect's declaration of how a repeated attempt stays safe: reuse the provider key, reconcile first, or accept duplicates with bounded retries (D14).
- **retry owner** — The one module that owns retry policy for a piece of work; the obligation module unless ownership is passed deliberately (D15, Law 12).
- **process** — A Workflow-backed operation that spans time, external systems or human decisions, with a business process record independent of the engine's step names (D16).
- **proposal** — The structured output of agent reasoning that policy checks and the ordinary command boundary executes (D17).
- **layer** — One of the seven numbered steps of capability, each usable before the next exists (Thesis).
- **profile** — A grouping of layers: transactional, durable, workflow or agent (Thesis).
- **trigger** — The concrete need that activates a Layer 3 to 6 capability; a possible future need is not one (D13, D18).
- **do-nothing option** — The design that adds no mechanism and relies on Convex as it is (Vocabulary).
- **probe** — One small test on a native backend that turns an assumed fact into a probed one (Fact ledger).

## Verification — reviewed

- A reviewer confirms that no Spec in the corpus uses revision for stream version, uses receipt for completion evidence, or uses generation for an attempt number.
- A reviewer confirms that every package's pack manifest names this Spec in `modelRefs`.
