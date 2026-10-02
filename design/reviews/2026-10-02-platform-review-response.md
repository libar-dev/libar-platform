# Response to the platform review of 2026-10-02

Written by the main thread on 2026-10-02, on `fix/platform-review`, which starts at `slice/s2`. It rules on each finding of `2026-10-02-platform-review.md`, says what this unit builds, and orders the units after it. A platform decision among the rulings is a provisional reading until the owner rules. The main thread has not read the Specs: a designer who finds a Spec, the doc or a measured Convex fact against a ruling says so in its short list with a counter-proposal.

## What the review found, by class

| Class | Findings | What happens |
|---|---|---|
| New, in what is built | CORE-01, CORE-02, CORE-03, CORE-04, APPL-11, FOUND-01 | This unit: Spec, code and tests |
| New, in what is not built | APPL-12, DUR-01 to DUR-08 | A Claude agent checks each against the Spec text. What holds enters the ledger, at S5 for APPL-12 and at L3 for the rest. No Spec changes now |
| Known, already in the ledger | APPL-01 to APPL-10, CORE-05 to CORE-08, FOUND-02, FOUND-03, the seventeen durable items | No second record. The review's counterexample goes into the note of the item it matches. The item whose fix text is stale is corrected |
| Leads | Pagination across a generation switch, two paused rebuilds on one source, `getOrder` without a subject, first activation over existing history | `STATE.md`, Leads and owner queue. The last three are there already |

## Rulings for this unit

R1 CORE-01, the receipt conflict. Holding a request key gives no authority. A conflict answer and an unsupported-version answer say that the key is taken and nothing about the stored receipt: no operation ID, no result, no subject. This is the default reading. The designer may propose showing the stored operation ID to an actor who is authorized for the stored receipt's subject, only if the doc requires the ID on a conflict and the receipt row already holds what that check needs. Proof: two actors, two subjects, one shared key, at the `convex-test` tier, and the public wire result on the native backend.

R2 CORE-02, the closed code list. The outer boundary validates every rejection the same way, whether it arrives bare or already tagged: the code is a platform code or one the command declares, the command name is the running command's, and the details are within their bound. A rejection that fails any of the three is answered as the boundary already answers an undeclared bare code. The exported helper keeps its name. Proof: a table of pure cases and one registered command.

R3 CORE-03, the size of an event. Make the arithmetic's assumption true: every envelope field a caller can set has a byte bound checked where the command enters, so that a stored event has a derived maximum, and the fold, query and migration arithmetic cite that maximum. The designer derives the numbers from the doc's limits and from what `getConvexSize` measures. No deployment holds history, so an event past the bound has one path: an explicit refusal that names the field. Proof: the exact boundary values and multibyte text in pure or `convex-test` cases. A native run over history of the maximum size waits for the unit that builds rebuild.

R4 CORE-04. Taken as sol built it in `2e20b29`: `start === undefined` means no baseline. It goes through this unit's review with the rest.

R5 APPL-11, what the acceptance example claims. The bound step is renamed to the path it runs. The whole experiment gets its own acceptance check: a list of the doc's required scenarios, each with its composition, tier and verifier, read against the results of a run, failing when a required scenario is absent or failing. It is small: a manifest and one check, built from what the graph and the run record already hold where they can supply it. Its own test removes one required scenario and shows the check fail. The check reports the rows that have no verifier yet as missing and does not pass until they exist. Which rows are built so far is not written into any Spec.

R6 FOUND-01. Each harness file that carries implementation gets a code anchor to the native harness Spec if the Protocol allows several anchors to satisfy one Spec. If it does not, the gap goes to `docs/sdp-feedback.md` and `SESSIONS.md` says that a file with unknown coverage is reviewed against the Spec that owns its directory.

R7 The review's reproductions stay as its record. Each finding fixed here gets a regression test under `tests/` that states the right behavior, fails on `2e20b29` and passes after the fix.

R8 Words. `CONTEXT.md` is the language. No Spec sentence, code name, test name or comment names a slice, a date, a finding ID or what is built so far.

R9 Where a pinned declaration does not compile, two Specs disagree or a Spec is silent, build the nearest thing that works and list it. Guess nothing silently.

## The team for this unit

The owner on 2026-10-02: GPT agents are an essential and complementary part of the team, not supplemental workers, and the project builds its own knowledge of how to use them. The models are Fable 5.1, Opus 5.5, `gpt-6-astra` and `gpt-6.1-sol`. This unit tries the roles below. `SESSIONS.md` takes what holds at the close.

| Work | Who | Why this family |
|---|---|---|
| Rulings, approval of every Spec sentence, the gate, the commit | Fable, the main thread | One place for judgment |
| Design of the behavior: Spec entries, names, bounds, proof obligations. Two designers, disjoint subjects | Fable agents | Design and the language stay with Claude |
| The proof: regression tests written from the ruled Spec text, shown to fail on the code before the fix | astra, high | The family that found the defects owns the evidence. The test author never sees the fix |
| The fix, from the same Spec text | sol, medium | Exact designs applied literally. The builder never sees the tests |
| Spec text and ledger records applied from exact rulings | sol, medium | Literal application is its strength |
| The harness and acceptance work | Opus agent | It runs the native tier and wrote the harness |
| An independent check of a GPT finding before it enters the ledger | Opus agent | A finding is settled by the other family |
| Merge of proof and fix, every tier on a clean tree | Opus agent | One integrator |
| Review of the unit on a frozen copy: behavior and mutations | astra, xhigh | As before |
| Review of the unit: every changed line | sol, medium, on the Claude lines. An Opus agent on the sol lines | The reader is not of the writer's family |

What the unit measures, for the project notes: how many of the proof's tests pass at the first merge and what each disagreement was (a Spec gap, a wrong test or a wrong fix); the review's findings on sol's lines against the earlier Opus builds; how many of the review's findings held when checked; and whether each reviewer catches one defect planted in a Spec of its frozen copy.

## The units after this one

| Order | Unit | What it builds | What the review adds | GPT's part |
|---|---|---|---|---|
| 1 | Owner decisions | Nothing | The four decisions below | None |
| 2 | S3, measurement | Where the `3N + 5` reads come from; a new command, a duplicate, a conflict, a rejection, a failed second context and engine retries; shared and unrelated contention | Explain before changing the design. Keep local and hosted claims apart | astra runs the controlled comparisons on the native backend and writes the attribution. sol reads the record code |
| 3 | S4, one rebuild path | The per-entity online rebuild through completion: enumeration, progress kept apart from the row commands read, projection chosen by generation version, interruption and resume, absence checks, cutover, rollback, lists across a switch. Probe 6 | APPL-01, 05, 06, 07 and 10 are its paper decisions. Aggregate and history read models (APPL-02, 03, 04) are left out and their generic promises narrowed | astra turns each counterexample of the review into a failing model test before the designer's rule becomes Spec text. sol checks the slice's ledger items against the current text before the rulings |
| 4 | S5, lifecycle and recovery | `CancelOrder` and release, history, baseline migration, restore, audit and diagnostic outcomes, the receipts sweep | CORE-05 to CORE-08, APPL-08, 09 and 12 as one procedure, with snapshots taken in the middle of a migration | The same two parts |
| 5 | L3, on its trigger | One thin local reaction under Probe 7, then one external effect with its failure matrix | DUR-01 to DUR-08 and the seventeen known items | The same two parts |

## What the owner decides

1. Whether `slice/s2` and this unit go to `main`.
2. The maximum order size and the latency and throughput targets, before S3.
3. Which of `CONTEXT.md` and `spec:platform.vocabulary` leads.
4. Before S4: first activation only over empty sources, or installation through rebuild; and how a changed projection reaches a live read model.
5. The provisional readings R1 to R3 and R5 above.
6. The review's report and inventory carry paths of the owner's machine, and the repository is public.
