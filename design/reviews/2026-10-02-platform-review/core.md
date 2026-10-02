# Kernel, context and command review

Reviewed repository `dd3185a` on 2026-10-02. Scope: every Spec in `design/specs/kernel`, `design/specs/context` and `design/specs/command`, both owning packs, all code in `src/kernel`, `src/context` and `src/command`, and fixture integrations and tests needed to follow their contracts. The source and Spec pass preceded ledger comparison. No implementation, Spec or ledger was changed. A temporary repository test file was removed; the repeatable reproductions were later archived beside this report.

## Findings at a glance

1. CORE-01, major, new: an actor with a grant only for subject A can disclose subject B's receipt operation ID by reusing its key with changed input A. Confirmed with convex-test.
2. CORE-02, major, new contract inconsistency: already tagged rejections bypass the declared-code check and may retain a different command name. Confirmed by a pure function test.
3. CORE-03, major, new budget defect: valid diagnostic metadata makes stored envelopes larger than the 17 KiB assumed by future fold and migration bounds. Accepted large envelopes confirmed with convex-test; the future read-limit consequence is arithmetic, not native proof.
4. CORE-04, minor, new: the generic kernel rebuild helper discards an explicitly supplied null baseline state. Confirmed by a pure function test; the Spec repeats the same faulty expression.
5. CORE-05, major, existing: get/list convert an old-schema state using the new mapper during the baseline migration window. Existing open ledger item; settle before implementing migrations.
6. CORE-06, major, existing: baseline sweep, pause and read-model rules do not compose into a complete migration procedure. Existing open ledger items; the build must close them together.
7. CORE-07, major, existing with additional example: byOperation collects without a bound, and a baseline migration deliberately puts all its batches under one operation ID. Existing batch-budget umbrella; diagnosis must page.
8. CORE-08, minor, existing: tombstone retention cannot be implemented from the declared receipt row and Retention alone. Existing partially fixed ledger item, not a new complaint about unimplemented scope.

No blocker established in this scope. The implemented transaction path has substantial evidence and clear boundaries. I recommend fixing the new disclosure gap and reconciling the error-boundary promise before more command callers are added. Bound envelopes before committing more history that the forthcoming rebuild contract assumes it can read. Migration, retention and recovery require one coherent implementation cut, not separate paper fixes.

## Evidence and limits

The main thread owns baseline checks and the native run. This report does not claim to have rerun them. The main thread reported check, typecheck, lint, format and 307 tests in 40 files passing; that report is separate from my targeted evidence.

I ran four targeted checks twice. The reviewer ran `/private/tmp/core-review-repros.test.ts` with an external configuration. The archived copies are `core-repros.test.ts` and `core-repros.config.mts` beside this report. Run `npx vitest run --config design/reviews/2026-10-02-platform-review/core-repros.config.mts` from the repository root. All four passed, meaning they reproduced the behavior described here. Two exercise convex-test 0.0.60 with the real fixture composition and Convex 1.46.0. Two exercise pure functions, though the same Vitest process supplies their environment. They are not native backend evidence. The external configuration uses no evidence reporter and leaves the repository unchanged.

Graph reads used recipe 3 for all 42 Specs and recipe 5 for both packs, adapted only to iterate the scoped IDs. Saved output: `core-spec-graph.json` and `core-pack-graph.json` beside this report. Both packs have no unresolved members and all 42 Specs state `defined`. Kernel and context has 19 members and eight implementation bindings; command has 23 members and seven. A graph binding proves where to inspect, not that behavior passes. In particular, `context.journal.rebuild-from-baseline` has no executable verifier binding.

## Confirmed defects and contradictions

### CORE-01: changed-input receipt conflict discloses another subject's operation

Severity: major. Status: new. Evidence tier: convex-test.

Evidence: `src/command/pipeline.ts:135` authorizes against `decl.permission.subjectFrom(input)`. At `src/command/pipeline.ts:183` to `188`, the conflict answer includes the existing receipt's operation ID. The other-version branch does the same at `src/command/pipeline.ts:172` to `180`. The receipt key deliberately excludes actor and subject. The fixture supplies subject-scoped document policies in `fixture/convex/depotCommands.ts:26` and `:101`. The governing rule is authorization before any stored-outcome disclosure, `design/specs/command/tenancy-and-authority.sdp.md:48`; its revoked-retry example explicitly expects no operation ID in a denied answer.

Reproduction: grant Bob document B, grant Alice document A, and let Bob create B under request key `shared-key`. Alice's ordinary create of B is forbidden. Alice then creates A with `shared-key`. Her grant for A passes, but she receives `idempotencyConflict` with Bob's operation ID. No grant for B was checked. The same issue affects unsupported-version metadata; that branch is source inspection rather than a second executed reproduction.

Consequence: subject restrictions protect the executor but do not protect receipt metadata on a conflicting key. This is a same-tenant disclosure, not a cross-tenant data read, and it exposes an operation pointer rather than the full original input or result. The request key is not specified as an authorization secret. This matters even when callers usually use UUIDs.

Recommended action: keep the required four-part key. Make conflict and unsupported-version replies omit stored-operation metadata unless disclosure of the existing receipt has been authorized. The cheapest safe behavior is a generic conflict/version error; if a product needs the pointer, record or reconstruct sufficient authorization scope and check it. Decide that contract explicitly rather than inferring authorization from the newly supplied input.

Proof of fix: add the two-actor, two-subject scenario at convex-test tier, including the unsupported-version branch. Assert that B remains forbidden, the conflict carries no B operation ID or affected/version data, and neither state nor receipt changes. Add a native public-entry version to establish wire behavior on the pinned backend. Preserve same-input authorized replay and normal changed-input conflict behavior.

Ledger comparison: no matching subject-scoped conflict-disclosure item was found. Existing same-key-two-tenants and revoked-then-retried examples cover different cases.

### CORE-02: tagged errors bypass the closed rejection-code contract

Severity: major under the rubric's contradictory/buildability rule. Status: new. Evidence tier: pure test for the helper behavior; no existing production command was found emitting this shape incorrectly.

Evidence: `design/specs/command/outcome-boundary.sdp.md:58` says a code outside platform codes and the declaration's rejections is a technical failure by definition. Its `fnNormalizeThrown` at `:76` instead passes any error carrying `kind` unchanged. Implementation matches the latter: `src/command/outcome-boundary.ts:94` excludes tagged errors from validation and `:112` rethrows them. `reject` accepts an open string code through the default generic and is publicly exported. `classifyThrown` at `:122` accepts every string rejection code fitting the wire shape.

Reproduction: call exported `reject({code:'notDeclared', commandType:'SomeOtherCommand', message:'x'})`, then pass the thrown value to `normalizeThrown(error, 'CreateDocument', [])`. `classifyThrown` still answers `rejection` with `notDeclared` and `SomeOtherCommand`. A directly constructed tagged ConvexError also bypasses the details-size check. The repository test at `tests/pure/command.test.ts` explicitly preserves already-tagged errors, so broader baseline passes cannot detect this contradiction.

Consequence: an integration can compile and send an undeclared rejection to a client despite the per-command closure promise. Later refusal-recording and obligation classification would have no way to distinguish it from a declared refusal. This is not a rollback defect: the error still throws and the transaction still rolls back.

Recommended action: make the outer boundary validate both bare and already-tagged rejection shapes against the current declaration, including details size and command identity. Preserve plain technical throws and the separate transient shape. Alternatively narrow the promise and restrict tagged rejection construction to platform internals, but the current exported API does not establish that restriction. The main thread must rule which promise changes.

Proof of fix: pure tests for allowed and undeclared codes in both shapes, wrong command identity, oversized tagged details, malformed tagged data, and unchanged technical errors; one convex-test registered command test whose executor calls the helper incorrectly. Native crossing need not be rerun until this changes the existing public wire behavior.

Ledger comparison: `r3-sdp-carry-or-reject-throw-shape` is related but narrower. It fixed a helper that omitted commandType by requiring the bare shape. It did not resolve the contradiction in already-tagged validation.

### CORE-03: envelope size is unbounded where fold arithmetic assumes a small envelope

Severity: major design budget defect. Status: new, related to earlier budget work. Evidence tier: convex-test acceptance and measured returned event; arithmetic for future rebuild/migration effects.

Evidence: `src/command/declaration.ts:103` accepts correlationId as an unrestricted string. Pipeline parse bounds tenant, request key, command name and business input, but not correlationId; `src/command/pipeline.ts:216` copies it unchanged. `src/context/journal.ts:201` copies it onto every inserted event. Only payload bytes are bounded. `design/specs/context/event-envelope.sdp.md` explicitly limits the envelope itself only by Convex's structural ceilings. In contrast, `design/specs/context/journal.sdp.md:97` assumes 16 KiB payload plus about 1 KiB envelope for a 600-event fold, and `:108` estimates migration tail reads at 17 KiB per event. `design/specs/context/queries.sdp.md:93` repeats this as events of at most 17 KiB.

Reproduction: the public CreateDocument command accepts a 32,768-character ASCII correlation ID and applies. A direct sanctioned fixture context call with the same value returns its actual inserted event envelope, whose Convex size exceeds 32,768 bytes even though the business payload is small. The external repro asserts both. This is legal input to the current API, not corrupted storage.

Consequence: 600 such events exceed 18.75 MiB from the correlation IDs alone. A small stream can accumulate that history through separately valid commands. The future 600-event rebuild and first-stream migration exception would then attempt more than the stated 16 MiB ceiling, even before payloads, baseline or saved state. Large stream IDs, delegation references or actor identity fields make the same assumption unsafe. Current writes still roll back safely if a per-call or backend limit is exceeded; the defect concerns the promised later bounded read and migration behavior.

Recommended action: define and enforce a whole ordinary-event byte budget, or enforce budgets on every envelope field and use the resulting maximum in fold arithmetic. Validate caller metadata before context execution. If preserving existing large envelopes is required, rebuilding must use measured byte budgets and resumable work rather than a count-only estimate. A size cap added later cannot repair already stored history.

Proof of fix: boundary tests with exact-at-limit and one-byte-over envelope metadata, multibyte strings, and large actor/delegation fields. At the native backend tier, build a stream with the largest permitted full envelopes and show its maximum allowed fold and a history-reading migration stay within the declared limits or return the documented budget refusal.

Ledger comparison: `r1-convex-fold-budget-headroom` is marked fixed by lowering the count from 1,000 to 600 and assuming about 1 KiB envelope. It never established a bound on that envelope. `r3-completeness-budgets-declared-never-measured` and `r3-convex-remaining-batches-bounded-in-documents-only` are related, but neither records this accepted-metadata counterexample. Treat it as a new residual defect in the earlier arithmetic fix.

### CORE-04: null cannot be used as an explicit baseline start

Severity: minor. Status: new. Evidence tier: pure test.

Evidence: `src/kernel/decider.ts:59` uses `start ?? decider.initial()`. The same expression is pinned in `design/specs/kernel/decider-contract.sdp.md:59`, while `design/specs/kernel/initial-state.sdp.md:44` says a baseline rebuild starts from the state the baseline holds. S is unconstrained, and null is a valid Convex state value.

Reproduction: a decider with `S = number | null`, initial state 42, no tail events and explicit start null returns 42. The existing falsy-start test checks 0, not null.

Consequence: a valid nullable state cannot survive a baseline rebuild. Existing object-shaped example deciders do not hit it, and no current native baseline implementation is claimed.

Recommended action: distinguish an absent start argument from an explicit null, or constrain and document state types so null is forbidden. The smaller change is an undefined check, with a deliberate decision about explicitly passed undefined if S itself allows it. Update both code and the expression in the Spec through the normal ruling process.

Proof of fix: pure tests for omitted start, null, 0 and a normal state object, including an assertion that initial is never called for an explicit null start.

Ledger comparison: no matching item found.

## Existing design issues that should steer the build

### CORE-05: old-schema state is exposed by current DTO mappers

Severity: major. Status: existing `r3-architecture-reads-of-streams-awaiting-baseline`, open for S5. Evidence: source and Spec inspection, not a new runtime result.

`design/specs/context/queries.sdp.md:71` and `:72` call the current toDto after load/enumeration. `src/context/journal.ts:116` rejects only data newer than code; `src/context/queries.ts:71` and `:105` map older state without conversion. Commands presently refuse older state, explicitly and honestly, while the future adapter promises migration on load.

A meaning change such as renaming or changing units in saved fields lets a cold stream's get/list throw or compute incorrect values until the sweep reaches it. Backfill and verify consume those same DTOs. Choose a query-compatible migration strategy before implementing the writer: pure in-memory conversion with explicit history bounds, temporary refusal, or compatible DTO readers. Test get/list before and after each migration ordering, with no write from the query and an unchanged result meaning. This is a known open design requirement, not evidence that the already limited implementation claims migration support.

### CORE-06: migration writers, pauses and read-model maintenance need one procedure

Severity: major. Status: existing cluster. Evidence: Spec inspection.

`design/specs/context/journal.sdp.md:40` recommends a maintenance window or tenant write pause and says read-model versions stay behind until another command or verification. At `:109`, the driver defers while the tenant/source gate is closed. At `:112`, the migration window says no writer is paused. The driver directly calls the component maintenance mutation and never routes returned state through live read-model maintenance. A meaning change may affect DTO values, not only the source version. A cold read model can consequently remain incorrect after its source migrated, until an explicit repair reaches it.

Deduplicate with `r3-fidelity-baseline-sweep-and-the-pause-contradict`, `r3-architecture-restore-and-baseline-migration-disagree`, and `r3-completeness-baseline-driver-unpinned`; the version-bump consequence itself is already recorded as fixed in `r2-architecture-baseline-event-bumps-stream-version`.

Recommended action: define who may write under the migration gate, how active/building read models reach the new meaning, how progress survives interruption, and what completion proves. Do not add another schema stamp that makes the data appear migrated before those effects finish. Native proof should cover sweep-first and command-first orderings plus a cold source whose read-model value changes, interruption/restart, a held write pause, and concurrent writers. The current L2-7 example covers state/history equality but bypasses the driver and does not establish read-model correctness.

### CORE-07: an operation query is not necessarily a bounded transaction query

Severity: major. Status: existing umbrella with a concrete migration case. Evidence: Spec inspection and size arithmetic.

`design/specs/context/queries.sdp.md:81` ranges by_operation and collects every full envelope. `design/specs/context/journal.sdp.md:106` deliberately assigns every baseline event of a migration run the same operation ID, and `:109` runs that migration over arbitrarily many batches. Per-call write bounds therefore do not bound a byOperation result. For example, a 100-stream migration with roughly 256 KiB baselines exceeds 25 MiB under one operation ID even though every batch individually fits.

Recommended action: paginate operation history with byte and row bounds, or give diagnosis a resumable summary query that does not return full event payloads. The receipt-check caller also needs a bounded interface. Test a multi-batch migration whose total event data exceeds one transaction's budget and prove every page is reachable with no loss or duplicated coverage.

Ledger match: `r3-convex-remaining-batches-bounded-in-documents-only` already reports the receipt-check/byOperation read budget problem. Add the multi-batch migration case to that item's proof obligation instead of opening a second generic unbounded-query finding.

### CORE-08: future receipt compaction has no durable retention policy to read

Severity: minor in the ledger, a build prerequisite when retention is implemented. Status: existing `r3-sdp-insert-receipt-cannot-compute-expiry`, partially fixed. Evidence: Spec inspection.

The receipt row in `design/specs/command/receipt-table.sdp.md:45` has no afterExpiry or irreversible field. `fnSweep` at `:59` receives tenant, now and limit but must distinguish deletion from compaction. `design/specs/command/command-declaration.sdp.md` rejects a standing registry except for the conditional dispatcher, and its Retention union has no finite tombstone horizon even though receipt-table allows one.

Store the historical retention decision on the receipt, or declare a compatible lookup mechanism with upgrade semantics; do not silently apply today's declaration to old irreversible operations. Test mixed retention policies, a declaration change during the retry window, a compacted duplicate, and expired sweep batches. The current implementation only supports deletion and explicitly errors on an unexpired tombstone, which is an honest implementation boundary rather than this review's new defect.

## Strong aspects and important non-findings

- The core transaction arrangement follows the intended ownership. The kernel folds events; the adapter is the production writer of current state and journal; component calls remain inside the parent's command mutation; thrown failures propagate. Existing native scenario sources test failures after append, after state save and after a successful component return.
- Authority is established once by the parent, grants are read in the transaction, receipt lookup comes after authorization, and admission comes after duplicate recognition. The disclosure issue above is about conflicting subject scope, not the order of these steps.
- The expected-version distinction is clear. Creation at version zero gets entityExists, stale reviewed versions reject before decide, and ordinary contention relies on OCC. Tests contain positive controls that prove the decider would fail if reached, rather than merely asserting a rejection message.
- Canonical input hashing uses Convex's value encoding and stable object-key ordering. Tests cover int64, bytes, nonfinite numbers, -0 and omitted undefined members. Thin replay returns explicitly use a distinct result-null union member.
- The adapter checks event payload validators, event count, invariants, row budget, journal tail consistency, aggregate write size and return size. Those are real protections. The metadata issue does not invalidate them; it invalidates a different future count-to-byte assumption.
- Get/list use tenant-leading indexes and a shared pagination cap that drops caller-supplied maxima. Public component functions are the correct mechanism for parent reachability, not evidence of public client access. I did not flag them as unauthenticated endpoints.
- A .filter on already bounded grant results is an in-memory filter, not an unindexed database query. No generic checklist finding is warranted there. The administrative revokeGrant helper remains an unbounded collect, but no healthy current command path uses it; a future high-volume grant repair should be paged rather than counted as a present command-path failure.
- Per-operation grouping in the fixture merges stock lines before planning, rejects invalid quantities before aggregation and claims a unique reference before creating its document. It preserves the one-call-per-context contract.
- No evidence in this review supports rewriting the architecture around a command bus, saga, generic dispatcher or central journal. The new defects fit at existing boundaries.

## Deliberate missing implementation

These are inventory, not fresh defects: derived state mapping and streamParts; baseline migration registration, writer, driver and rebuildStream; history/rebuild/byOperation query definers; irreversible tombstones and receipt sweep; pipeline gate, audit and diagnostics; conditional refusal dispatcher and higher-layer authority modes. Existing fields such as baselineVersion or Authority types do not prove those workflows are implemented. In particular, Journal.history is configuration today, not runtime rebuild enforcement.

A Spec binding to src/context/journal should not be read as an implementation claim for every future journal workflow. The only unbound example among this scope's examples is journal.rebuild-from-baseline. The declared scenarios and the existing tests leave the migration seam visibly unfinished.

## Coverage inventory

Every file below was reviewed for its specified contract, implementation relationship and verification claim. Paths are relative to the repository root. Verifier labels mean graph bindings were inspected, not that this reviewer reran their tier.

### Kernel

- `design/specs/kernel/decider-contract.sdp.md`: contract; contract/source review; no direct executable verifier binding.
- `design/specs/kernel/domain-kernel.evaluate-twice.sdp.md`: example; executable binding: tests/pure/domain-kernel.evaluate-twice.test.ts.
- `design/specs/kernel/domain-kernel.incremental-then-rebuild.sdp.md`: example; executable binding: tests/pure/domain-kernel.incremental-then-rebuild.test.ts.
- `design/specs/kernel/domain-kernel.sdp.md`: behavior; contract/source review; no direct executable verifier binding.
- `design/specs/kernel/initial-state.sdp.md`: decision; contract/source review; no direct executable verifier binding.
- `design/specs/kernel/outcome-model.sdp.md`: rule; contract/source review; no direct executable verifier binding.
- `design/specs/kernel/state-document-mapping.sdp.md`: decision; contract/source review; no direct executable verifier binding.

### Context

- `design/specs/context/batch-shaped-api.sdp.md`: rule; contract/source review; no direct executable verifier binding.
- `design/specs/context/context-component.competing-commands.sdp.md`: example; executable binding: tests/native/context-component.competing-commands.test.ts.
- `design/specs/context/context-component.competing-unique-value.sdp.md`: example; executable binding: tests/native/context-component.competing-unique-value.test.ts.
- `design/specs/context/context-component.invalid-transition.sdp.md`: example; executable binding: tests/native/context-component.invalid-transition.test.ts.
- `design/specs/context/context-component.sdp.md`: behavior; contract/source review; no direct executable verifier binding.
- `design/specs/context/context-component.stale-version-rejected.sdp.md`: example; executable binding: tests/native/context-component.stale-version-rejected.test.ts.
- `design/specs/context/event-envelope.sdp.md`: contract; contract/source review; no direct executable verifier binding.
- `design/specs/context/journal.rebuild-from-baseline.sdp.md`: example; contract/source review; no direct executable verifier binding.
- `design/specs/context/journal.sdp.md`: behavior; contract/source review; no direct executable verifier binding.
- `design/specs/context/persistence-adapter.sdp.md`: contract; contract/source review; no direct executable verifier binding.
- `design/specs/context/queries.sdp.md`: contract; contract/source review; no direct executable verifier binding.
- `design/specs/context/tables.sdp.md`: contract; contract/source review; no direct executable verifier binding.

### Command

- `design/specs/command/actor-and-scope.sdp.md`: contract; contract/source review; no direct executable verifier binding.
- `design/specs/command/command-declaration.broken-argument-contract-fails-build.sdp.md`: example; executable binding: tests/types/command-declaration.broken-argument-contract-fails-build.test-d.ts.
- `design/specs/command/command-declaration.renamed-handler-fails-build.sdp.md`: example; executable binding: tests/types/command-declaration.renamed-handler-fails-build.test-d.ts.
- `design/specs/command/command-declaration.sdp.md`: contract; contract/source review; no direct executable verifier binding.
- `design/specs/command/command-pipeline.failure-after-journal-append.sdp.md`: example; executable binding: tests/native/command-pipeline.failure-after-journal-append.test.ts.
- `design/specs/command/command-pipeline.failure-after-state-write.sdp.md`: example; executable binding: tests/native/command-pipeline.failure-after-state-write.test.ts.
- `design/specs/command/command-pipeline.failure-before-receipt.sdp.md`: example; executable binding: tests/native/command-pipeline.failure-before-receipt.test.ts.
- `design/specs/command/command-pipeline.sdp.md`: workflow; contract/source review; no direct executable verifier binding.
- `design/specs/command/idempotency-and-receipts.capacity-refusal-then-retry.sdp.md`: example; executable binding: tests/native/idempotency-and-receipts.capacity-refusal-then-retry.test.ts.
- `design/specs/command/idempotency-and-receipts.concurrent-non-ui-calls.sdp.md`: example; executable binding: tests/native/idempotency-and-receipts.concurrent-non-ui-calls.test.ts.
- `design/specs/command/idempotency-and-receipts.key-reuse-changed-input.sdp.md`: example; executable binding: tests/native/idempotency-and-receipts.key-reuse-changed-input.test.ts.
- `design/specs/command/idempotency-and-receipts.rate-refusal-then-retry.sdp.md`: example; executable binding: tests/native/idempotency-and-receipts.rate-refusal-then-retry.test.ts.
- `design/specs/command/idempotency-and-receipts.retry-after-lost-response.sdp.md`: example; executable binding: tests/native/idempotency-and-receipts.retry-after-lost-response.test.ts.
- `design/specs/command/idempotency-and-receipts.sdp.md`: behavior; contract/source review; no direct executable verifier binding.
- `design/specs/command/idempotency-and-receipts.ui-double-submit.sdp.md`: example; executable binding: tests/native/idempotency-and-receipts.ui-double-submit.test.ts.
- `design/specs/command/outcome-boundary.rejected-then-retried-after-change.sdp.md`: example; executable binding: tests/native/outcome-boundary.rejected-then-retried-after-change.test.ts.
- `design/specs/command/outcome-boundary.sdp.md`: contract; contract/source review; no direct executable verifier binding.
- `design/specs/command/receipt-table.sdp.md`: contract; contract/source review; no direct executable verifier binding.
- `design/specs/command/tenancy-and-authority.client-claims-agent-namespace.sdp.md`: example; executable binding: tests/native/tenancy-and-authority.client-claims-agent-namespace.test.ts.
- `design/specs/command/tenancy-and-authority.client-claims-system-namespace.sdp.md`: example; executable binding: tests/native/tenancy-and-authority.client-claims-system-namespace.test.ts.
- `design/specs/command/tenancy-and-authority.revoked-then-retried.sdp.md`: example; executable binding: tests/native/tenancy-and-authority.revoked-then-retried.test.ts.
- `design/specs/command/tenancy-and-authority.same-key-two-tenants.sdp.md`: example; executable binding: tests/native/tenancy-and-authority.same-key-two-tenants.test.ts.
- `design/specs/command/tenancy-and-authority.sdp.md`: behavior; contract/source review; no direct executable verifier binding.

Both owning packs were read and queried: `design/specs/kernel-and-context.pack.sdp.md` and `design/specs/command-pipeline.pack.sdp.md`. All 42 scoped Specs resolve and are members of their expected pack. Supporting rules reviewed: CONTEXT.md; AGENTS.md; design/SESSIONS.md; PLAN authoring conventions and review rubric; governing decisions D1-D12 and the twelve laws. The Convex reviewer checklist was applied selectively, with its generic suggestions checked against component reachability and actual query mechanics.
