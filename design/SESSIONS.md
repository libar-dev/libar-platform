# Session protocol for the design corpus

A session is one Claude Code conversation with Fable 5.1 as the main-thread model. It does one unit of work, in the main thread, and leaves the Specs, `README.md`, the ledger and `STATE.md` agreeing. The main thread does all the reading, reviewing and editing itself. A session starts no subagent and no workflow.

The reason is the stop of 2026-09-30. A workflow of ten Fable agents per round hit the account's usage limit mid-round, one fixer had made 109 edits and reported none, and the next session went to finding out what it had done. Two rules below come from that: one unit per session, and the write-ahead ledger.

## What wins when sources disagree

1. `docs/convex-transactional-domain-platform-decisions.md`, "the doc", on what the platform is.
2. The Software Delivery Protocol on form. Its CLI path is in `README.md` under "How to read".
3. `PLAN.md` on IDs, layout, conventions and the review rubric (section 7).
4. `README.md` is the index. It follows the Specs.
5. `docs/modern-ts.md` advises on packaging, build, test tiers and release, and on nothing else. `STATE.md` lists where it conflicts with the doc.

Only the owner states `ready`, settles an E-number or an open question, or edits the doc.

## Open

1. Read `STATE.md`.
2. Re-measure. `python3 design/tools/check.py` prints `OK` and the same summary lines `STATE.md` records, the corpus digest included. A carried verdict is a claim until this step repeats it.
3. If the check fails or a line differs, the corpus changed outside a closed session and the unit is `recover`. Otherwise take the unit `STATE.md` names as next, unless the owner asks for another.

## Units

### review

One lens per session. The session writes the ledger and `STATE.md` and edits no Spec.

| Lens | What it judges | Rubric items in `PLAN.md` 7 |
|---|---|---|
| `fidelity` | Every claim traces to the doc. Every claim beyond it is marked `[extension]` and registered. Nothing overrules the doc. Layers 3 to 6 stay at the depth the doc supports. | 1 to 6 |
| `convex` | Every Convex claim holds on current Convex: transactions and retries, limits, components, indexes, scheduling, Workflow and Workpool, auth, pagination. | 22 to 36 |
| `sdp` | The carrier is used as SDP and the plan say. One concept has one name, one signature and one owner across all Specs. | 7 to 17 |
| `architecture` | Each mechanism survives an attempt to refute it with a cheaper Convex-native design. Each of the 43 scenarios walks through the design and passes. The first experiment can be run from the Specs. | decision method rules 2, 3 and 5; item 40 |
| `completeness` | Every component is designed at the promised depth. An engineer can build Layers 0 to 2 without guessing. `README.md` is accurate. Prose is plain. | 18 to 21, 37 to 40 |

1. Take the lens and the scope from `STATE.md`. Full scope is every Spec. Delta scope is every Spec that `git diff --name-only <approval commit>..HEAD -- design/specs` lists, plus each Spec those relate to.
2. Read every Spec in scope against the lens. The `convex` lens checks each claim against the current docs page or component README and cites the page with the read date. Memory is not evidence.
3. Confirm each ledger item of this lens that carries `unreviewed: true` in the Spec text, then remove the flag. A fix that is wrong becomes a new finding.
4. Append each finding to the ledger the moment it is found, with `status: "open"`. Use the fields the ledger already has: `round`, `id` as `r<round>-<lens>-<slug>`, `lens`, `severity`, `files`, `issue` with its evidence, `fix`, `status`, `note`.
5. Record the verdict under this round's `verdicts` in the ledger's `rounds`, with the fields the earlier rounds use, `lens`, `approve`, `summary` and `counts` as blocker, major, minor, plus the `scope` and the `commit` or corpus digest that was read. The lens approves when it found no blocker and no major.

Severity. A blocker contradicts the doc or documented Convex behavior so that a scenario cannot pass. A major makes an implementer guess, fails at runtime, or rules on something silently. A minor is a stale sentence, an unrecorded cost or polish.

Done when every Spec in scope is read, the summary answers every rubric item of the lens, every finding is in the ledger and the verdict is recorded.

### fix

The session edits Specs and records no verdict. The lens that raised a finding confirms the fix in a later session.

1. Take the open findings `STATE.md` names.
2. For each finding, change the Spec that owns the concept, then every Spec that repeats it. Update `README.md` where an ID, a count, the scenario table, the extension register or an open question changed.
3. Write ahead: set the finding's `status` and `note` in the ledger before starting the next finding. `fixed` gets `unreviewed: true`. `rejected` says why the finding is wrong. `owner` means the fix needs a ruling, and the Spec carries the question with its provisional reading.
4. A new extension takes the next free E-number of its package's range (`PLAN.md` 10), the three marks of `PLAN.md` 6.5 and a register row.

Done when no taken finding is `open` and the check prints `OK`.

### recover

For a session that was cut off. On a committed tree `git diff` shows what changed; otherwise the file times do. Confirm each `open` or `unreviewed` ledger item the change touches in the Spec text, finish or revert each half-done edit, set the statuses, then close.

### owner

The owner rules on an E-number, an open question, an item of `PLAN.md` 11, a probe result or a readiness. The session applies each ruling at the Spec that owns the question, updates the register and the open-question table, and lists the rulings in the commit message with the owner's words. This is the only unit that writes `ready`.

## Close

1. `python3 design/tools/check.py` prints `OK`.
2. Rewrite `STATE.md` under its existing headings, with the check's summary lines copied in. It describes the present. Git holds the history.
3. Commit once, on the branch `STATE.md` names, as `design: <unit> <lens or scope>, round <n>`, if `STATE.md` says the owner allows session commits. If it does not, ask the owner once and leave the tree uncommitted.

## Consensus

Consensus holds when each of the five lenses has `approve` as its latest verdict and that verdict covers `HEAD`: the lens read the full scope at `HEAD`, or read it earlier and has delta-reviewed every Spec change since. `STATE.md` then names `owner` as the next unit.

## When a session runs short

The ledger is at most one finding behind, because every finding and every status is written before the next begins. Stop, write `STATE.md` with what is done and what is not, and let the next session open with `recover`.

A full-scope review reads about 920 KB of Specs. That is one session. A fix unit that cannot finish leaves the rest `open` and says so in `STATE.md`.
