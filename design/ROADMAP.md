# Roadmap: the next units

Written on 2026-10-02 by the main thread, from four advisor memos written the same day under `design/advisors/task-roadmap.md`. It is a work document: it orders units and names what each needs and shows, and it says nothing a Spec should say. The owner rules on it. The memos, the plants and the check are in the roadmap unit's folder, which the project notes name.

## How to read it

A unit is one session, as `SESSIONS.md` cuts them, on its own branch and through a pull request. Its kind is `decide` when the owner or an advisor rules first, `design` when it writes Spec text from rulings, `build` when it writes code and tests from Spec text already ruled, and `mixed` when the two cannot be separated. Units are grouped in rounds. The lanes of one round touch disjoint files and may run at once, each on its own branch; a round ends when its owner sitting or its blocking unit closes. Sizes are the advisors' judgment: an evening is what S1 took, a night what S2 took.

The slices of `STATE.md` keep their names. S3 is round 1's attribution and round 2's measurement. S4 is the paper of round 2 and the builds of rounds 3 and 4. S5 is round 5.

## The cut

| Round | Lane | Unit | Kind | Subject | Size | Needs first |
|---|---|---|---|---|---|---|
| 1 | a | Sitting one: forks for the rows that block S3 and S4, and the public-repository rows | decide | all four | an evening of forks, one check, one owner sitting | nothing |
| 1 | b | Attribute the 3N + 5 reads of `PlaceOrder` under controlled changes, with a kept record | build | convex | an evening | nothing |
| 1 | c | Confirm the thirty-three flagged fixes in the Spec text, family by family | design | product | an evening | nothing |
| 1 | d | Scout: does the pinned local backend take a snapshot import with replacement | build | operator, convex | an afternoon | nothing |
| 2 | a | The S3 measurement: six cells, Measurement records, the six targets, Sc L2-9's concurrency half | build | convex | a night | 1b, OD-046, OD-064 |
| 2 | b | S4 on paper: the per-entity generation lifecycle, the gate and the audit record, the operator entry contract | design | domain, operator | an evening | sitting one |
| 2 | c | `CancelOrder` and `release` in the example domain | mixed | domain | an evening | the owner's answer on allocations |
| 2 | d | Probe 6, before the rebuild is built on the component | build | convex | an evening to a night | OD-057's checked lean applied |
| 3 | a | The gate, the restore door, and a gate change as audit that fails closed | mixed | operator | an evening | 2b |
| 3 | b | The online rebuild of the order summary, Sc L2-5 at the native tier | build | domain | a night | 2b, 2d, 3a |
| 3 | c | The two harness reads and the fact rows no Spec carries | mixed | convex | a session plus an evening | nothing |
| 3 | d | Sitting two: the language, the pass sentence, and the S5 rows | decide | product, domain, operator | an evening of forks, one check, one owner sitting | nothing |
| 4 | a | A command's audit fails closed and its diagnostic never aborts, Sc ALL-1 | mixed | operator | an evening | 3a |
| 4 | b | Probe 7, as far as the local backend can take it, with the scheduled-argument boundary | mixed | operator, convex | an evening, unknown if the import fails | 1d, 3c |
| 4 | c | The history view's fold, its memory and its rollback, on paper | design | domain | an evening | 2c |
| 4 | d | The receipts sweep, one tenant per run | build | operator | under an evening | the tenant list from 2b |
| 4 | e | `ready` on the built Specs, by family | decide | product | a session, one owner unit | 1c, sitting two |
| 5 | a | Baselines, migration and the fold bound, Sc L2-7 at the native tier | mixed | domain | a night or more | OD-041 from sitting two, 3b |
| 5 | b | The restore procedure and the drill, Sc L2-8 | mixed | operator | unknown until 4b | 4b, 5a |
| 5 | c | The first adopter-facing cut: README, the example walkthrough, the package shape | mixed | product | a night | OD-047, OD-048, Sc L2-5 to L2-8 bound |

## Round 1: what blocks nothing

**1a. Sitting one.** One launch per advisor with `task-fork.md`: OD-046 (product), OD-064 (convex), OD-123 (domain) for S3; OD-025, OD-148, OD-150 (operator) and OD-068, OD-069 (domain) for S4; OD-047 and OD-048 (product), which block no unit and need no evidence. Ten forks. The questions below that are not rows yet become rows first, so that the sitting answers them too. A sol check of every fork's facts, the advisors' corrections, then one `owner` unit applies the owner's words. Sitting one is the first thing the planning thread opens, because every lane of round 2 but one waits on it.

**1b. Attribute the reads.** Three native tests on the production composition, each one change against the 10-line run, reading the usage of the top-level completion record; the run's record copied to `evidence/`; the two Spec entries of the first experiment rewritten with the attribution. The convex advisor's own sum from the code reaches 2N + 5, so one read per stock stream is unattributed, and the candidate is the adapter's replace of the stream row. OD-066 becomes decidable.

**1c. Confirm the flags.** A `review` unit scoped to the thirty-three `fixed` findings with `unreviewed: true` and not to the corpus: the eleven from S0 on the platform Specs against the harness that binds them, then the rest, which touch the kernel, context, command, application, facts and a few platform Specs. The flag goes, or a new finding is written. The eight `partially-fixed` flags stay with the slices that build their rest.

**1d. The import scout.** One afternoon, by astra: whether `npx convex import` with replacement runs against the pinned local backend, what it does to component tables and to `_scheduled_functions`, and what the two docs pages say of a local deployment. Its answer moves 4b forward or keeps it where it is.

Also in round 1, a commit of its own on the main machine: the native run records of `e76e587` and `645130f` copied into `evidence/`. They sit under the ignored `evidence/runs/` on the main machine, and no kept record backs the Layer 2 counts until they are copied.

## Round 2: after sitting one

**2a. The measurement.** The contention run at 2, 8 and 32 commands on one stock item, the `Measurement` record per run with the retry count read from the log fields the native harness Spec lists as observed, the comparison with the six targets, the local write rate stated beside any throughput, and the contention run bound to Sc L2-9 as OD-007's lean says. OD-063 and OD-064 get their local numbers.

**2b. S4 on paper.** One design unit, two Fable designers with disjoint subjects, Opus writers, a closer. The domain subject: the projection chosen by the version the generation row records (OD-014) and installation through a first rebuild (OD-010), both checked leans, which close the version check correction C1 left; the progress row (OD-071); the verify pass deleting a row whose DTO projects to null; the rulings of OD-068 and OD-069 applied. The operator subject: `AuditRecordInput` and the record an operator action writes, the gate's shapes, and the one operator entry contract written from the rulings on OD-148 and OD-025, so that every later operator function is written against one establishment rule. The tenant list's owner is ruled here too.

**2c. `CancelOrder` and `release`.** The second lifecycle event of the example: `cancel` and `release` on the deciders, the two events, the use case calling Orders first (OD-074), the summary's `cancelled` written from the DTO, which closes the gap the domain advisor found. The stock item's state holds `allocated` as one total today, so the owner's answer on per-order allocations comes first.

**2d. Probe 6.** The three examples OD-057's checked lean names, with `@convex-dev/migrations` pinned, on the fixture composition's read model. F17 becomes probed or E-40's split stands.

## Round 3

**3a. The gate and the door.** The gates table, `gateAllows`, `assertWritable` at step 7, close, resume and get for the `all` and tenant scopes, the read of `MAINTENANCE_MODE` before the gate document, and the audit table with `writeAudit` inside every close, resume and abort. At `convex-test`: a command in a closed tenant is refused and nothing is stored, and a close whose audit insert fails leaves the gate open. On the native backend: the environment switch refuses every write, and two writers race a close.

**3b. The online rebuild.** The rebuild's eight functions and the progress row, with the version-selected projection of 2b. A version 2 of the order summary built as generation 2 while `PlaceOrder` runs, a fence bump as the interrupt, verify, switch, intervening writes, rollback, verify again, switch back. Sc L2-5 on the native backend with a record.

**3c. The harness reads and the fact rows.** A read of `_scheduled_functions` through admin access, so that the "no job" assertions of Sc L2-2 and L2-3 close on the table and not on a window; three fact Specs written from the pinned package source and a probe on the pinned release, and not from the leads that point at them: the commit timestamp as OD-044's lean says, the time budget nested calls draw on, and the late byte check of `convex-helpers`; the scheduled-argument size discrepancy recorded on F13; one probe counting component calls per mutation on the pinned release. The native read of the deployed function list is deferred: OD-021's lean takes the committed generated api as the pinned list, and the main thread judges that compiled check sufficient until a scenario needs more.

**3d. Sitting two.** One fork page for the language: OD-009, OD-022, OD-029, OD-139 and OD-140 as a table, one word per row with what it costs a reader, with the words the advisors needed listed below, and the word OD-017 and OD-110 wait for. Beside it OD-008 with OD-006, OD-138 as one line, and the S5 rows OD-041, OD-042 and OD-114. Five rows may share one fork file; each row points at it.

## Round 4

**4a. Command audit and the diagnostic.** `audit` on the declaration, `writeAudit` at step 10, `emitDiagnostic` at the end of the mutation through a sink that swallows every error and counts it, the two injection points in the fixture composition only, and both examples of Sc ALL-1 bound. The Spec text first says which outcomes emit a record and where a duration comes from.

**4b. Probe 7.** One unit for both halves: the five states and the retention of `_scheduled_functions` confirmed on the pinned release, a scheduled argument grown until the backend refuses it, and, where 1d allows, a snapshot of the parent and the two context components imported into a fresh backend with what is there recorded. F12 and F16 move to probed or stay documented with the reason recorded. OD-081, OD-120 and OD-114 get the measurement their `settles` names; OD-115 waits for the Workpool and Workflow half, which comes before L3.

**4c. The history view on paper.** One row whatever the order across streams, fold memory beyond a deleted row, rollback of a paused view as a refusal or a re-closing of the sources, the cross-context row narrowed to D8's parent query, the aggregate write split on a key change. Four ledger findings fixed on paper and one pure determinism test. The build of the view waits for a view that needs it.

**4d. The receipts sweep.** One internal mutation per tenant over the expiry index, at most the bound, returning what it deleted and whether more remains, with the loop over tenants from 2b's ruling.

**4e. `ready` by family.** The fork for OD-024 lists the built Specs with their floors and their open questions and asks for `ready` by family: kernel and context first, then command, then application without the generation registry. A Spec with an unruled `owner` row stays `defined`.

## Round 5: S5

**5a. Baselines and migration.** OD-041's ruling applied, then `migrateToSchemaVersion`, step 3a, `writeBaseline`, the driver, and `rebuildStream` with `maxFoldEvents`, shown on a second state schema version of the order; the sweep under the pause and the reads of a cold stream ruled in the same text. Sc L2-7 on the native backend.

**5b. The restore procedure and the drill.** After Probe 7 has shown what a restore leaves. The four checks on the representative dataset, which needs `CancelOrder` and a generation stranded in `building`; the restore's batches get their runner. OD-042's three policies go to the owner once the drill has shown how long the checks take.

**5c. The adopter-facing cut.** The root README's first hour, an `example/README.md` that walks `PlaceOrder` from its declaration to the order summary, and the package kept private with nothing of the first-release list. No name, export or version is a contract yet.

## Deferred, with the trigger

- Layers 3 to 6: at their trigger, after Probe 7, as the doc and tactical decision 3 say. OD-050 to OD-054 and OD-056 stay waiting until an activation record names a consumer.
- Probe 3's quota half: once on a hosted deployment after 2a, OD-036.
- The build of the history view (Sc L2-6) and the aggregate form: at a view that needs them, OD-075. 4c gives them their rules first.
- Receipt tombstones, the derived mapping and `streamParts`, the import command: when a command needs them, OD-100, OD-113, OD-072.
- OD-092's `transactionLimits` probe: before any budget or `maxStreams` is raised; nothing in rounds 1 to 5 raises one.
- OD-035, the doc against the probed facts: after 2a, so one doc edit carries every number.
- OD-055 and OD-136: at a consumer of refusal records, and at 4a's build.
- Publication, a licence beyond OD-048's answer, the first-release list of `docs/modern-ts.md`: after the acceptance check passes with no missing scenario.

## Where the advisors differed, and what the main thread ruled

These are tactical: how the work runs. The owner can reopen any of them.

1. **S3 before S4.** The convex and domain advisors both put attribution of the reads before any code on the command path, and the convex advisor puts attribution before the measurement, because a per-line number nobody can explain is a reading and not a cost line. Ruled so: 1b is an evening with no blocker, and 2a runs beside the S4 paper once sitting one has ruled OD-046 and OD-064.
2. **Probe 7 first, or after the harness reads.** The operator advisor would run Probe 7 first if the local backend takes a snapshot import; the convex advisor puts it after the scheduler read. Ruled: the import scout in round 1 decides. If the import runs locally, 4b moves to round 2 with the scheduler read pulled forward; if not, it stays.
3. **The flags before `ready`.** The product advisor's own lean, against its own case for `ready` first: a `ready` Spec is not taken back by an edit, and most of the thirty-three flags sit on the built Specs, twenty-nine by the check's join of the ledger to the Specs with a code anchor. Ruled so. `STATE.md`'s guidance to confirm a flag when its subject is touched stands for the eight `partially-fixed` flags; a review scoped to the flags is not a corpus cycle.
4. **One page for the language.** Five term rows share one fork file. The register's field holds a path, and five rows may hold the same one.
5. **The size of a sitting.** Ten forks in sitting one and about nine rows in sitting two. The owner said on 2026-10-02 "I will need help with all owner decisions", and twenty rows in one sitting is where help ends.
6. **The operator entries while OD-148 is open.** The operator advisor asks whether 3a may build the entries as internal functions that take the actor as an argument. Ruled: 3a waits for sitting one, which rules OD-148, so the question does not arise; 2b writes the contract from the ruling.
7. **OD-021.** The committed generated api is the pinned list of Sc L2-9's deployed-functions observation, and the native read is deferred. The `_scheduled_functions` read is not deferred.

## Questions for the owner that are not rows yet

Each becomes a row before sitting one, so that a fork carries it.

- Does the stock item's state grow to hold per-order allocations for `release`, or does the example keep totals only, which E-46 leaves to the owner? (domain)
- Does the order allocation history view stay in the first experiment, when it is not an essential read and is the one view that needs the write pause? (domain)
- Is Sc L2-9 read as parity with a hosted release, which no native example can show, or as the local observation that is bound? (convex, OD-007's case against)
- Is 100 lines the largest order `PlaceOrder` promises, or only the size the run measures at? This is OD-046 and OD-064 in plain words. (convex, product)

## Findings beyond the roadmap

For the ledger or the leads, by the unit that takes them.

- The order summary's status validator admits `cancelled` while the order DTO admits only `placed` and no event sets it. 2c closes it. (domain)
- `@convex-dev/migrations` is not pinned; the one `@convex-dev` dependency is the lint plugin. 2d adds the pin. (convex)
- OD-048's `reason` cites `package.json:215` for a licence under `files`; that line is in `docs/modern-ts.md`, and `package.json` has no `files`. The register unit corrects the row. (product)
- The ledger's `files` fields mix `specs/...` and `design/specs/...` prefixes. Polish. (product)
- Lead 19 of `STATE.md` is stale: the README names every `_generated` directory under both compositions. Dropped at this close. (product)
- `CONTEXT.md` names three fixture names while the fixture also has `reference` and the `yard` context. Sitting two. (product)
- No harness or script member exports or imports a snapshot. 1d and 4b. (operator)

## Words the advisors needed that `CONTEXT.md` lacks

For sitting two, beside OD-009 and OD-022.

- Measurement: measurement record against evidence record and run record, attribution, contention, controlled change, local backend against hosted deployment.
- Read models and history: backfill as a mode and a path, first activation, verify pass, switch, rollback, retired generation, marker, history view and history projection, a migration as a `BaselineMigration`, sweep, tombstone, release of an allocation, fold bound.
- Operations: gate, door, drill, audit record, diagnostic, maintenance job, operator entry, restore as a procedure.
- Product: adopter, release of a package, package, licence, activation record, acceptance check, verifier, build tier.

## The check

The facts of the four memos were checked by `gpt-6.1-sol` at medium on 2026-10-02, in ten minutes, on copies that each carried one planted false citation. It read 291 claims: 228 held, 39 did not, 24 it could not check, and it listed 74 facts stated without a label, most of which hold. All four plants were caught. Of the real misses, most are citation lines that do not resolve in a Spec shorter than the line cited, and the rest are sentences that say more than their source: `applyProjection` skips a missing row rather than writing every generation, `classifyReceipt` throws only on an unexpired tombstone, `establishActor` also returns null, the register has twenty-one product rows of the owner's and not sixteen, and the history projection's Spec line names `AllocationReleased` and not `OrderCancelled`. None changes a milestone; three changed a sentence of this file. The memos keep their text, and the check's report stands beside them in the unit's folder.
