# Transactional domain platform

The language of a platform on which a business operation is one transaction: a command is authorized, decided against current state, recorded as events and answered, all or nothing. These are the words for what the platform is. Words for how it is designed and proven, and words for the work of building it, are listed apart at the end, because they must not leak into the first group. This file leads: `spec:platform.vocabulary` follows it, and the doc keeps its authority over what the platform decides.

## Language

### Contexts and the parent

**Context**:
A bounded context: one part of the business with its own language, which owns its current state and its history and changes them only through its own context operations.
_Avoid_: component (how Convex realizes a context), module, service, domain

**Parent**:
The application that mounts the contexts, establishes who is calling, and carries out commands across them.
_Avoid_: app, host, deployment, orchestrator

**Context operation**:
One of the sanctioned ways a context's state changes, taking a list of items so that a use case calls each context once.
_Avoid_: operation (alone), endpoint, handler, context command

**Use case**:
The parent's carrying out of one command across one or more contexts, with one outcome.
_Avoid_: workflow, saga, orchestration, executor (the code's name for the function)

**Entry**:
A function the parent registers for a caller: a public command, an internal command, a parent query or an operator entry.
_Avoid_: endpoint, handler, function (alone)

### Commands and outcomes

**Command**:
A caller's request to the parent to carry out one business operation. It has one declaration and ends in exactly one outcome.
_Avoid_: request, action, mutation, call, intent

**Stream command**:
The part of a command addressed to one stream, which that stream's decider decides.
_Avoid_: command (alone, for this meaning), message

**Operation**:
One accepted execution of a command. Its ID ties together everything that execution caused.
_Avoid_: transaction, request, run

**Decider**:
The pure rules of one stream type: how a stream command is decided against current state, and how each event changes that state.
_Avoid_: aggregate, handler, reducer, domain service

**Outcome**:
How a command ends: applied, business failure, rejection or technical failure.
_Avoid_: result (the value a command returns), status, success flag

**Applied**:
The outcome in which events were recorded and state changed.
_Avoid_: success, ok, accepted

**Business failure**:
The outcome in which something meaningful happened that belongs in history, such as a declined reservation. It is recorded like an applied command.
_Avoid_: failure, error, declined command

**Rejection**:
The outcome in which the command is understood and refused, and nothing is recorded.
_Avoid_: error, validation failure, refusal, denial

**Technical failure**:
The outcome in which something unexpected broke, and nothing is recorded as a business outcome.
_Avoid_: exception, crash, error, rejection

**Transient refusal**:
A refusal for rate or capacity that the caller may retry. It is not an outcome and is never recorded.
_Avoid_: rate limit error, throttling, rejection

### State and history

**Subject**:
The business thing whose history a stream holds, such as one order.
_Avoid_: entity, aggregate, record, document, row

**Stream**:
One subject's history: its events in order.
_Avoid_: log, aggregate, timeline

**Stream type**:
The kind of subject a stream is about, with one decider.
_Avoid_: aggregate type, entity type, table

**Stream version**:
The number of events in a stream.
_Avoid_: revision, sequence number, position, offset

**Event**:
A recorded fact in a subject's history.
_Avoid_: message, notification, change, update

**Envelope**:
What every event carries beside its own facts: its identity, its owner, its place in the stream, the operation and the cause that produced it, the actor, and when.
_Avoid_: metadata, header

**Journal**:
A context's store of its events.
_Avoid_: event store, event log, audit log

**Current state**:
The state a stream command is decided against, kept beside the journal and always equal to the fold of the stream's events. The doc abbreviates it CMS, command model state.
_Avoid_: snapshot, aggregate, model, cache

**Fold**:
Computing the next state from the current state and the new events. It is the only source of state.
_Avoid_: apply, reduce, patch, state update

**Rebuild**:
Recomputing stored state from the history that should produce it: a stream's current state from its events, or a read model from its sources.
_Avoid_: replay, resync, reprocess

**Baseline event**:
An event that holds migrated state, from which a rebuild starts when the meaning of earlier events has changed. Earlier events stay readable.
_Avoid_: snapshot, checkpoint

### Who may do what

**Tenant**:
The customer organization that owns a record. Every record, command and query names one.
_Avoid_: organization, workspace, account, customer

**Tenant scope**:
The tenant a command or query names. An absent tenant is never a wildcard.
_Avoid_: scope (alone), tenancy

**Actor**:
The server-established identity that caused a command: a human, a service, an agent, a reviewer or an operator.
_Avoid_: user, caller, principal, identity

**Stated operator**:
The name an administrator states when calling an operator entry. It records who said they acted and establishes no actor; an actor of kind operator is one the server establishes, which no entry does.
_Avoid_: operator (alone, for this meaning), actor (for a stated name)

**Grant**:
An authoritative statement that an actor holds a permission in a tenant, read in the same transaction as the command it authorizes.
_Avoid_: role, ACL, access rule

**Permission**:
What a grant allows and a command requires.
_Avoid_: right, capability, scope

**Caller namespace**:
The server-assigned class of a caller: public, service, worker, agent or system. A caller cannot choose it.
_Avoid_: channel, source, origin

### Retries

**Request key**:
What a caller supplies to say "this is the same command as before".
_Avoid_: idempotency key (the key the server builds from it), nonce, dedupe ID

**Fingerprint**:
A digest of a command's business input, by which the same request key with different input is recognized as a conflict.
_Avoid_: hash, checksum

**Receipt**:
The stored outcome of an operation, kept so that a retried command is answered and not carried out again.
_Avoid_: result cache, log entry, completion evidence (a different thing)

**Duplicate**:
A retried command recognized by its receipt and answered from it.
_Avoid_: replay, repeat, retry (what the caller does)

### Reads

**Parent query**:
A read the parent answers to a caller, authorized in the parent, relaying a context query or reading a read model.
_Avoid_: query (alone), endpoint, read (alone)

**Context query**:
A read a context answers to the parent, returning a DTO and never a document.
_Avoid_: query (alone), getter

**Query refusal**:
The refusal of a parent query, in the same wire shape as a rejection, naming the entry that refused. It is not an outcome, and nothing is recorded.
_Avoid_: rejection (for a query), error, denial

**Read model**:
A stored shape made for reading, updated inside the command from the state that command committed.
_Avoid_: view (alone), cache, table, projection (the logic, not the data)

**Projection**:
The named, versioned rules that maintain a read model, shared by the command and by a rebuild.
_Avoid_: read model (the data), handler, subscriber

**Generation**:
One numbered build of a read model.
_Avoid_: version, attempt

**Installation**:
Making a read model exist in a deployment: its declaration and its first rebuild.
_Avoid_: activation, first activation, setup

**Backfill**:
The part of a rebuild that writes a generation's rows from its sources.
_Avoid_: rebuild (for this part alone), replay, import

**Verification**:
The part of a rebuild that checks a generation's rows against its sources and corrects them.
_Avoid_: validation, reconciliation, audit

**Pass**:
One traversal of a rebuild over its sources or its rows: a backfill, a verification, a purge or a fill. The verb passes and a pass condition belong to scenarios, and a test's outcome is a test result.
_Avoid_: run, iteration, round

**Switch**:
Making a verified generation the one readers see, in one write.
_Avoid_: cutover, promotion, activation

**Rollback**:
Making a retired generation the one readers see again.
_Avoid_: revert, undo, downgrade

**Retired generation**:
A generation readers no longer see, kept until it is purged.
_Avoid_: old generation, previous version, inactive

**Purge**:
Deleting a retired generation's rows.
_Avoid_: cleanup, garbage collection, drop

**Fence**:
The number a generation's batches carry so that a batch from before an interruption writes nothing.
_Avoid_: epoch, token, lease

**Progress row**:
The row that holds where a rebuild stands, read by its batches and by no command.
_Avoid_: checkpoint, cursor row, status row

**Tenant list**:
The parent's list of its tenants, which a rebuild and a sweep walk one tenant at a time.
_Avoid_: tenant table, registry, directory

**Write pause**:
A stretch during which commands that write the sources of a read model are refused, so that the read model can be rebuilt from a consistent cut.
_Avoid_: lock, maintenance mode, freeze

### Backups

**Backup archive**:
The exported file of a deployment's table data at one moment, which a restore imports.
_Avoid_: snapshot (a transaction's view of the database), export, dump, backup (alone, for the file)

**Restore**:
The procedure that imports a backup archive under matching code and proves the invariants hold before any writer runs.
_Avoid_: import (one step of it), recovery, rollback

### Deferred work

**Obligation**:
The recorded promise of work that must happen after the command, made in the same transaction as the business change.
_Avoid_: job, task, outbox entry, effect

**Effect**:
The change a piece of deferred work makes in the world.
_Avoid_: obligation, side effect, job

**Attempt**:
One try at fulfilling an obligation.
_Avoid_: retry, run, generation

**Completion evidence**:
The record that proves an effect happened.
_Avoid_: receipt, callback, status

**Needs attention**:
The state of an obligation that cannot proceed without a person.
_Avoid_: failed, dead letter, stuck

## Design language

Words for how the platform is specified and proven. They are lasting and may appear in a Spec. They do not name things inside the platform, so no type, table, event or error code is named after them.

- **Layer**: one of the seven steps of capability, each usable before the next exists.
- **Profile**: a group of layers an application takes together: transactional, durable, workflow or agent.
- **Trigger**: the concrete need that activates a later capability. A possible future need is not one.
- **Law**: one of the twelve rules every decision is reviewed against.
- **Decision**: a ruling on a mechanism, with the do-nothing option as its first alternative.
- **Do-nothing option**: the design that adds no mechanism and relies on Convex as it is.
- **Fact**: something the design relies on Convex to do, marked documented, probed or assumed.
- **Probe**: one small test on a real backend that turns an assumed fact into a probed one.
- **Scenario**: a row of the doc's acceptance table, a situation with a pass condition that the platform must meet; a case is one example of a row.
- **Tier**: the kind of test that can prove a scenario: compiled, pure test, convex-test or native backend.
- **Target**: where a native backend test runs, the local backend or a hosted deployment, recorded apart from the tier and the composition.
- **Composition**: an application assembled from the platform for a purpose: the production composition, or the fixture composition that exists only to prove scenarios.
- **Verifier**: a test bound to an example, which proves it when it passes at the example's tier on its composition.
- **Acceptance check**: the check that reads from the graph every scenario the first experiment requires and from one run's record whether each passed.
- **Test result**: what one run of a verifier leaves in the run record: passed, failed or skipped.
- **Run record**: the harness's record of one run of the test projects, with the commit, the pins, the target and every test result; a restore's own record is a restore run.
- **Measurement record**: a run record's entry that holds a measured cost or time with its pins and its target.
- **Local backend**: the pinned backend process the harness starts and disposes of for a test.
- **Hosted deployment**: a Convex Cloud deployment the harness targets with a deploy key.
- **Deploy key**: a hosted deployment's credential, scoped to the actions a run needs.
- **Admin key**: the local backend's credential.
- **Usage reading**: what a hosted deployment's usage report says for a window; a difference of two readings is one run's own only when no other run overlapped it.
- **Stated plan**: the Convex plan a hosted run records as the owner stated it, never read from billing.
- **Kept dataset**: the data a hosted deployment carries from one run to the next on purpose.
- **Planting record**: the row a run writes beside a schedule it planted, so that a later run can tell a retained schedule from a lost one.
- **Execution**: one run of a function by the backend, the unit the function log counts.
- **OCC rerun**: an execution the engine repeats after a write conflict; neither an attempt nor a retry by the caller.
- **Contention**: several commands at once on one stream.
- **Controlled change**: one difference against a reference run, so that a cost is attributed to a line.

## Words that are not part of the language

Words about the work of building the platform: when something was done, in what order, and by whom. They are true for a while and then stale. They belong in `design/STATE.md`, the review ledger, commit messages and reports. They never appear in a Spec, in a name in the code (a type, a function, a table, an event type, an error code), or in a scenario's text.

- **When and in what order**: slice (S0, S1, ...), unit, session, phase, round, milestone, sprint, a date or a weekday, "today", "now", "currently", "so far", a commit.
- **How far along**: built, not built yet, pending, to do, "waits for", "decides later", unreviewed, work in progress.
- **Steps of the work**: scout, build, fold-in, review round, handover, close, run (as in "Friday's run"; what a run leaves behind for the design is an evidence record).
- **Notes of the work**: finding, lead, ruling, owner queue.
- **Who did the work**: thread, builder, integrator, the owner of the repository.

Three words exist on both sides and mean different things:

- **Agent**: in the language, a kind of actor whose proposals the parent checks. In the work, a model that writes or reviews code. Only the first is a domain term.
- **Reviewer** and **operator**: in the language, kinds of actor, and apart from them the stated operator. In the work, whoever reviews a change or runs a deployment by hand.
- **Operation**: in the language, one accepted execution of a command. In the work, nothing: "an operation of the session" is a step.

Fixture names such as depot, document and stock are the fixture composition's own small domain. They are not platform language either.
