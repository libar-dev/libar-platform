# Session protocol

A session is one Claude Code conversation with Fable 5.1 as the main thread. It does one unit of work and leaves the Specs, the code, `README.md`, the ledger and `STATE.md` agreeing.

The main thread orchestrates. It rules on every finding, writes or approves every Spec sentence, and owns the check and the commit. It delegates reading, checking and bounded building. The design is finished by building it: the doc says detail follows the build, and three review rounds on paper did not converge.

## What wins when sources disagree

1. `docs/convex-transactional-domain-platform-decisions.md`, "the doc", on what the platform is.
2. The Software Delivery Protocol on form. Its CLI, recipe catalog and authoring skill come with the package `package.json` pins.
3. `PLAN.md` on IDs, layout, conventions and the review rubric (section 7).
4. `README.md` is the index. It follows the Specs.
5. `docs/modern-ts.md` advises on packaging, build, test tiers and release. `STATE.md` says what to take on day one, what waits for a first release and what to leave.

Code never overrules a Spec by existing. When code and a Spec disagree, the main thread rules which one is wrong, and a Spec changes only by that ruling.

## Who decides

Only the owner states `ready`, settles an E-number or an open question, or edits the doc.

The owner ruled on 2026-10-01 that the session takes tactical decisions on its own recommendation, and that decisions about the platform's design stay open until the owner takes them up. A tactical decision is about how the work runs: tooling, order, layout, who does what. A platform decision changes what a Spec promises. For a platform decision the session keeps the provisional reading in the Spec, records the question there, adds it to the owner queue in `STATE.md` and carries on. When unsure which kind it is, treat it as a platform decision.

## Who does what

| Work | Who | Effort |
|---|---|---|
| Orchestration, rulings, every Spec sentence, the check, commits | Fable 5.1, the main thread | high |
| Read-only scout before a unit; reviews that run things | `gpt-6-astra` | high |
| Bounded building from a Spec; mechanical edits from an exact text; the mechanical review lane | `gpt-6.1-sol` | medium |
| Review of balance and of how a reader will take the text | Claude agent, Opus 5.5 | default |
| The design of a solution before an implementer writes it: interfaces, names, shapes, exact text | Claude agent, Fable 5.1 | default |
| Whole-branch review before a hand-over | `gpt-6-astra` | xhigh |

GPT capacity is the abundant side, so reading, checking and building go there. Claude agents are the scarce side: start one only for a role in the table. Design judgment and the project's vocabulary stay with Claude. The owner ruled three things on 2026-10-01. A Fable agent, not the main thread inside a brief, designs a solution before any implementer writes it, whichever model implements. Taste review goes to a Claude model only, and solution design to Fable only. And a job is sized to its model: sol takes what an Opus agent would take, astra what a Fable agent would, in width and in depth. The mechanics of reaching GPT models, briefing each family and calibrating a reviewer are in the orchestration guide, and this project's commands, brief fragments and job log are in its notes file. `AGENTS.md` names both.

Four rules from the stop of 2026-09-30, when ten parallel Fable agents hit the usage limit and one left 109 unreported edits:

- One unit per session.
- One write lane. A second writer shares the tree only when the two briefs split the files and each names the other's files as forbidden.
- The ledger is written ahead: each finding and each status before the next begins.
- Every delegated job's report is saved to a file the moment it arrives.

## Open

1. Read `STATE.md`.
2. Run `npm ci` if `node_modules` is missing, then `python3 design/tools/check.py`. It prints `OK` and the summary lines `STATE.md` records, the corpus digest and the Protocol pin included.
3. If a line differs, find out whether the corpus or the pin moved. A moved corpus makes the unit `recover`. A moved pin makes it `adopt`. Otherwise take the unit `STATE.md` names, unless the owner asks for another.

## Units

### slice

One slice of the build, as `STATE.md` cuts them. `python3 design/tools/check.py --slice S1` lists the findings it takes.

1. **Scout.** One read-only astra job reports, per finding of the slice: the Spec that owns the concept, every other place that restates it, found by searching the whole corpus for each name and signature, and each conflict with the doc. Its report is a list of leads.
2. **Settle.** For each ledger finding and each scout lead, look for what would refute it, then trace it to the scenario it breaks. Rule one of three: fix on paper now, let the build decide and say what the build must show, or the owner. A `fix` field in the ledger is a lead; five were found wrong on 2026-10-01.
3. **Author.** Change the Spec that owns the concept, then every Spec that restates it. A Spec that names another in prose declares the relation. Fix what the slice cannot be built without and leave the rest open with the note that the build decides. Set each finding's `status` and `note` before starting the next.
4. **Design.** A Fable agent reads the Specs the slice builds and writes one design file: interfaces, names, shapes, the order of work and exact text where text matters. It changes no file in the repository. The main thread rules on the design before anyone builds from it.
5. **Build.** One sol job per Spec, or one job for several, applying the design. The job writes code and tests, binds each example it realizes to its test, changes no Spec and no stated readiness, and lists everything the design did not say that it had to decide. A GPT job cannot resolve a host, listen on a local port or reach Docker, so the main thread runs installs, codegen and the native tier and hands the output back.
6. **Commit, then review a frozen copy.** Three lanes read the commit, each with one criterion. Sol reads every changed line, test and pinned value. Astra runs the code against the Spec and looks for consequences elsewhere. An Opus agent asks whether the change added mechanism the scenario does not need and how a reader will misread it. A number in a Claude finding is re-run before anyone acts on it.
7. **Rule on each gap.** Code wrong becomes one numbered fold-in job, designed first when it reshapes an interface. Spec wrong becomes a Spec edit by the main thread and a ledger entry. A platform decision goes to the owner queue with its provisional reading.
8. **Review the fixes.** One more read-only pass over the last fold-in. A fix is new work.

Done when the slice's tests pass at the tier each claims, the check prints `OK`, every finding the slice took has a status other than `open` or a note saying what the build still has to show, and every gap is ruled.

Name the tier behind every claim: compiled, pure test, `convex-test`, native backend. A pass at one tier proves nothing at the next.

### review

One lens over a scope, on paper. The session writes the ledger and `STATE.md` and edits no Spec.

| Lens | What it judges | Rubric items in `PLAN.md` 7 | First read by |
|---|---|---|---|
| `fidelity` | Every claim traces to the doc. Every claim beyond it is marked and registered. Nothing overrules the doc. | 1 to 6 | Claude |
| `convex` | Every Convex claim holds on current Convex, against the docs page or package source, with the read date. | 22 to 36 | astra, then Claude |
| `sdp` | One concept has one name, one signature and one owner across all Specs. | 7 to 17 | astra, then Claude |
| `architecture` | Each mechanism survives an attempt to refute it with a cheaper Convex-native design. Each scenario walks through and passes. | decision method rules 2, 3 and 5; item 40 | Claude |
| `completeness` | An engineer can build Layers 0 to 2 without guessing. `README.md` is accurate. Prose is plain. | 18 to 21, 37 to 40 | astra for buildability, Claude for the rest |

1. Take the lens and scope from `STATE.md`. Delta scope is every Spec that `git diff --name-only <approval commit>..HEAD -- design/specs` lists, plus each Spec those relate to and each Spec the mention audit (recipe 22) shows naming them.
2. The first read is blind to earlier verdicts and to the ledger. Only then confirm each ledger item of the lens that carries `unreviewed: true`, in the Spec text, and remove the flag. A fix that is wrong becomes a new finding.
3. The main thread settles every finding a GPT read returns before it enters the ledger, with `status: "open"` and the fields the ledger already has.
4. Record the verdict under this round's `verdicts`, with `lens`, `approve`, `summary`, `counts`, the `scope` and the `commit` read. The lens approves when it found no blocker and no major. A GPT read supports an approval only after that reviewer has caught a planted defect in a Spec on the same brief.

Severity. A blocker contradicts the doc or documented Convex behavior so that a scenario cannot pass. A major makes an implementer guess, fails at runtime, or rules on something silently. A minor is a stale sentence, an unrecorded cost or polish.

### fix

Paper only, for findings no slice will build soon: Layer 3 and later, and polish. Steps 1 to 3 of `slice`, then the check. `fixed` gets `unreviewed: true`. `rejected` says why the finding is wrong. `owner` means the fix needs a ruling. A new extension takes the next free E-number of its package's range (`PLAN.md` 10), the three marks of `PLAN.md` 6.5 and a register row.

### adopt

For a new Protocol version. Change the pin in `package.json`, run the check, apply what the version changes to the corpus, and write what the adoption found into `docs/sdp-feedback.md` for the Protocol's maintainers.

### recover

For a session that was cut off. `git diff` shows what changed. Confirm each `open` or `unreviewed` ledger item the change touches, finish or revert each half-done edit, set the statuses, then close.

### owner

The owner rules. The session applies each ruling at the Spec that owns the question, updates the register, and lists the rulings in the commit message with the owner's words. This is the only unit that writes `ready`.

## Close

1. `python3 design/tools/check.py` prints `OK`.
2. Rewrite `STATE.md` under its existing headings, with the check's summary lines copied in. It describes the present. Git holds the history.
3. Add each delegated job to the run log in the project notes: model, effort, scope, time, outcome.
4. Commit as `design: <unit> <scope>` or `build: <slice> <scope>`, on the unit's branch, push it and open a pull request. `STATE.md` says who merges.

## Consensus

Consensus holds for Layers 0 to 2 when the first experiment passes on a native backend and each of the five lenses has `approve` as its latest verdict covering `HEAD`. `STATE.md` then names `owner` as the next unit. Layers 3 to 6 are written from what the experiment shows and reach consensus the same way afterwards.

## Handing over inside a unit

A build slice is too long for one conversation. The main thread hands over to a fresh main thread at a seam, before its own context gets in the way: after a commit, with no delegated job running and every report saved.

1. Reach the seam. Wait for or stop every delegated job. A job that dies with the conversation leaves no report, and the Codex job index does not follow a restarted conversation: read the job's log under the plugin's state directory.
2. Commit what is in the tree on the unit's branch, as work in progress if it is not reviewed, and say so in the message.
3. Write the handover note beside the unit's reports, in the folder the project notes name. It says what is committed, what each tier showed and at which commit, which findings are ruled and where the rulings are, what is drafted and not applied, the next steps in order, and what waits for the owner. It lists every instruction the owner gave during the conversation, in the owner's words.
4. Put a short "In progress" block at the top of `STATE.md` that names the unit, the seam and the note. The rest of `STATE.md` waits for the close.
5. Start the next main thread in a fresh conversation in the repository, Fable 5.1 at high effort, and check both in its status line before prompting it. The prompt names the unit, the note, and the files to read first. A cleared conversation is required: a main thread that inherits a summary of this one inherits its weight.
6. The next main thread reads `AGENTS.md`, `STATE.md`, this file and the note, runs the check, and confirms with `git status` and `git log` that the tree is what the note says before it does anything else.

## When a session runs short

The ledger is at most one finding behind. Stop, write `STATE.md` with what is done and what is not, and let the next session open with `recover`. Hand over as above when there is still room to write the note.
