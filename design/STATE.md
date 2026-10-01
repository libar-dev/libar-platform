# State of the design corpus

Written on 2026-10-01 at the close of a `review` session, round 3, lens `architecture`. `SESSIONS.md` says how to use this file. Every close rewrites it.

## Measured at close

```
168 specs · 5 packs · 0 anchors → 173 nodes · 881 edges (0 errors, 0 warnings)
validate: 0 errors · 54 warnings; readiness divergence: []
open questions: 67 Specs, 129 questions; extensions registered: 48
ledger: 136 findings, {'fixed': 113, 'open': 21, 'partially-fixed': 2}
corpus digest: 46c29d3e812a6819
```

The owner allows session commits: on 2026-10-01 the owner gave the session the decision on when a commit is needed. The branch is `design-corpus`, cut from `main` at `abfa444`. Its first commit carries everything written since then, the corpus through review round 2, the recovery and this review, because none of it had been committed before.

This session edited no Spec. It changed the ledger and this file. The Specs are the ones the review read, at digest `84253b0d4b3af9e1` before the ledger changed.

## Where the review stands

No lens has approved. Rounds 1 and 2 were full-scope reads by five agents in a workflow. Round 3 runs one lens per session in the main thread.

| Lens | Round 1 | Round 2 | Round 3 | Latest verdict |
|---|---|---|---|---|
| `fidelity` | 0 blocker, 4 major, 5 minor | 0, 3, 5 | not yet run | not approved |
| `convex` | 1, 2, 4 | 0, 3, 2 | not yet run | not approved |
| `sdp` | 0, 7, 11 | 0, 5, 9 | not yet run | not approved |
| `architecture` | 0, 4, 14 | 0, 7, 4 | 0, 10, 11 | not approved |
| `completeness` | 0, 7, 8 | 0, 3, 7 | not yet run | not approved |

Round 3 `architecture` read all 168 Specs. Its 21 findings are `open` in the ledger under ids that start `r3-architecture-`. None needs an owner ruling.

The ten majors, by where they sit:

- Read models and rebuild. One projection writes every generation, so a changed projection rewrites the active generation in place and a rollback is written by the new code. The history view's fold is fed in a different order live than on the backfill, and deleting its row loses the fold's memory. The history backfill's cursor names no source and its verify step cannot pass a stream whose last event keys to no row. A rollback of a history view runs with the sources open and drops events. A cross-context current-state row still has no write form.
- Baseline migration. `get` and `list` return DTOs built from state of the old meaning while the sweep runs. A restore cannot be accepted for a backup taken in a migration window, and its read-model check fails after any sweep.
- Tenancy. The rebuild, the restore, the baseline driver and the receipt sweep iterate a tenant list that no Spec defines.
- Obligations. A lease is not cleared when an attempt leaves `running`, so the operator's reconcile and cancel are refused for up to 35 minutes.
- Acceptance. The native tier has no stated way to interrupt a batch chain or move time, and the examples need both.

The eleven round-2 `architecture` fixes were checked in the text. Ten are confirmed and no longer carry `unreviewed`. One, `r2-architecture-history-and-cross-context-projection-has-no-input`, is now `partially-fixed`: the history form was added, the cross-context form was not, and a round-3 finding carries the rest. The other `partially-fixed` item is the round-1 minor whose remaining part was rejected with a reason.

37 round-2 fixes still carry `unreviewed: true`: 14 for `sdp`, 10 for `completeness`, 8 for `fidelity`, 5 for `convex`.

## Next unit

`review`, round 3, lens `sdp`, full scope. Then `convex`, `fidelity`, `completeness`, one session each.

After the four reviews, `fix` sessions take the open findings. The 21 `architecture` findings split into five fix units that touch different Specs:

1. Read models and rebuild: the five majors above and the minors on the history view's live cost, the one-stream batch and rollback of deleted subjects. Scope `specs/application/` projection-contract, rebuild, generation-registry, write-pause, read-models, the L2-5 and L2-6 examples, and `specs/command/` command-declaration and command-pipeline step 9.
2. Baseline migration against reads and restore: two majors and the write-bound minor. Scope `specs/context/` journal, queries, persistence-adapter and `specs/application/restore`.
3. Tenant list and the example domain: one major, one minor. Scope `specs/command/actor-and-scope` or tenancy-and-authority, then every Spec that iterates tenants, and orders-inventory-example.
4. Obligations and effects: the lease major and five minors. Scope `specs/obligations/` and `specs/effects/`.
5. Acceptance contract and the audit option: one major, one minor. Scope `specs/platform/acceptance-contract`, `specs/operations/baseline-operations` and the examples that interrupt or move time.

Round 4 can be delta scope for any lens that approved in round 3. `architecture` did not, so its round 4 is full scope or, if the owner prefers, the Specs the fix units changed plus what they relate to.

## Leads for round 3

These are not findings. A reviewer confirms or drops each.

1. 52 Specs changed after the round-2 reviewers read them. `architecture` has now read them all; the other four lenses have not. Read these first: `application/` first-experiment, generation-registry, orders-inventory-example, parent-use-cases, projection-contract, read-models, rebuild and its three examples, restore and its example, write-pause; `command/` actor-and-scope, command-declaration and its example, command-pipeline, the ui-double-submit example, outcome-boundary, tenancy-and-authority; `context/` batch-shaped-api, context-component, event-envelope, journal and its example, persistence-adapter, queries, tables; `kernel/` decider-contract, domain-kernel, outcome-model, state-document-mapping; `obligations/` do-nothing-check, fan-out-and-chains, lifecycle-transitions, local-reaction-wrapper, obligation-module, operator-operations, record-contract, retention-and-restore and its restore-behind-provider example, sweeper; `effects/` claim-call-settle, external-effects and its late-evidence example; `constraints/events-stay-small`; `facts/probe-plan`; `platform/` acceptance-contract, existing-systems; `processes/` approvals, start-checkout-example; `agents/budget-accounting`.
2. The history view is the newest mechanism and now carries three `architecture` majors. The other lenses should read `HistoryProjection`, the `events` on the adapter's `streams` entry, the rebuild's history batches and the `source:` scopes with that in mind.
3. `convex`. Convex lets a component declare typed environment variables that the installing app supplies, `defineComponent(name, { env })` and `app.use(component, { env })` (docs.convex.dev/components/authoring, read 2026-10-01). The corpus rules that no component function reads an environment variable. That stays a valid design rule, but F11's narrative and `context-component` should not read as if Convex forbade it.
4. `convex`. `EffectHandler` declares `runtime: "convex" | "node"` and the lease differs by runtime, but `callProvider` and `reconcileAttempt` are one registered action each, `claimStep6` schedules them without reading the runtime, and the static `EffectRegistry` is 'imported by the actions'. A handler that needs Node APIs has to live in a `"use node"` module with its own action, which a default-runtime module cannot import. Check the actions and runtimes pages.
5. `convex`. `MAINTENANCE_MODE` and `OBLIGATIONS_DISPATCH` are read with `process.env` inside mutations, and the restore relies on a change taking effect for the next function run without a deploy. Check the environment variables page for that and for what a change does to running subscriptions.
6. `sdp`. Three places where one concept has two shapes. The adapter's `aggregation` bullet lists a `streams` entry as `{ dto, version, appended, created }` while `typeStreamDto` also has `events`. The queries contract's `parentPassThrough` builds the actor by hand as `{ kind: "human", id }` while the pipeline uses `establishActor`, which can also return a service actor. `scopesOfUseCase` emits a `read-model:` scope and the batches pass one, but `closeGate` takes only a tenant, a source or `all`, so nothing can close it.
7. `completeness`. `DiagnosticRecord.outcome` lists `rejection`, `technicalFailure` and `transientRefusal`, but the only emitter is the pipeline's step 11, which runs on success. `receipts.sweep` runs per tenant and no Spec says what schedules it; this joins the tenant-list finding.
8. `fidelity`. The corpus puts a receipt on every derived command because D6 lists workers. On the local path the wrapper's fence and its one atomic commit already give one execution, so the receipt's read, insert and seven-day row repeat a guarantee. The corpus follows the doc. Whether the doc should exempt the local wrapper is the owner's question, listed below.

## Inputs

The doc is `docs/convex-transactional-domain-platform-decisions.md`, committed and unchanged since `abfa444`. It spent a day at the repository root and is back in `docs/`; `README.md` and `PLAN.md` point there.

`docs/modern-ts.md` arrived on 2026-10-01. It is a research report on building and shipping the TypeScript library, written against the doc. No Spec cites it. The read of 2026-10-01:

- Its architecture half restates the doc and adds nothing. Where the two differ, the doc wins.
- Its engineering half covers ground the corpus does not: package boundaries and subpaths, module format, `tsconfig`, the build tool, a test catalogue, the CI matrix, publishing, and a compatibility policy that treats error codes, persisted handler keys and event schemas as contracts. Use it when the first experiment's repository is laid out (OQ4) and when the build tier of E-14 and the test tiers get their tooling.
- Its claims on the Convex component template, TypeScript 7, npm trusted publishing and tsup's end of maintenance check out against their sources, read 2026-10-01.
- Three things in it are wrong or missing. The dates it gives as end of life for Node 18 and Node 20 are those lines' last release dates; both are end of life, so its conclusion stands. It never mentions tsdown, the replacement tsup's own README names. Its six citations of the doc are broken placeholders, and each code block carries a stray language label above it.
- Do not copy its repository blueprint. It puts journal, streams, receipts and obligations into one component, which is the central store D2 rejects, and it puts receipts and obligations inside a component, where D2 and E-50 put them in the parent.
- Smaller conflicts, all resolved for the corpus: its error codes and obligation statuses are spelled differently, and its actor kinds leave out the reviewer of D11.
- Its Node 18 and CommonJS baseline came from the prompt it was given, not from the doc. The owner decides.

One Convex page was read this session: audit logging (docs.convex.dev/production/integrations/audit-logging, 2026-10-01). `log.audit(params)` blocks the commit on log persistence, needs an Enterprise plan and a dedicated deployment, emits on failed mutations and possibly on retries, and delivers to an S3 bucket. It is the evidence for `r3-architecture-audit-do-nothing-option-unrecorded`.

## Owner queue

Nothing here blocks a review or fix session.

1. Answered on 2026-10-01: the session decides when to commit, on `design-corpus`. Whether and when that branch merges to `main` stays with the owner.
2. The 129 open questions in `README.md`, the twelve ambiguities of `PLAN.md` 11, and three product decisions listed in `README.md`.
3. The seven probes. None has run.
4. From `docs/modern-ts.md`: ESM only or dual ESM and CommonJS; the Node floor; whether package and release design becomes a sixth pack in the corpus or stays outside it.
5. From this review: whether D6's receipt requirement for workers should exempt a derived command issued inside the local reaction wrapper, where the obligation's fence already gives one execution. The corpus keeps the receipt until the doc says otherwise.

## Leftovers

- `.claude/agents/fable-xhigh.md` is an agent definition from the first session. The protocol uses no subagent, so nothing needs it.
- `design/generated/gen-a.py` is a throwaway generator in a gitignored directory.
