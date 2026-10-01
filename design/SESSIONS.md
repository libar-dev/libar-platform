# Session protocol

A session is one Claude Code conversation with Fable 5.1 as the main thread. It does one unit of work and leaves the Specs, the code, `README.md`, the ledger and `STATE.md` agreeing.

The main thread coordinates. It rules on every finding, approves every Spec sentence, and owns the check, the push and the merge. It delegates reading, checking, building and the writing of Spec text from its rulings, and it keeps its own context small: a job answers it in a few lines and leaves its report in a file. The design is finished by building it: the doc says detail follows the build, and three review rounds on paper did not converge.

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
| Coordination, rulings, approval of every Spec sentence, the check, the push and the merge | Fable 5.1, the main thread | high |
| The design of a solution's key abstractions before an implementer writes it: interfaces as stubs, names, shapes, and exact text only where a reader sees it | Claude agent, Fable 5.1 | default |
| Building from a Spec, integrating parallel builders, folding in ruled findings, and applying ruled Spec and ledger edits | Claude agent, Opus 5.5, usually inside one Workflow run | default |
| Read-only scout before a unit; the behavior review lane, which runs things | `gpt-6-astra` | high |
| The mechanical review lane: every changed line, test and pinned value | `gpt-6.1-sol` | medium |
| Whole-branch review before a hand-over or a close | `gpt-6-astra` | xhigh |
| Review of balance and of how a reader will take the text | Claude agent, Opus 5.5 | default |

Claude models write and GPT models review. The owner ruled it on 2026-10-01, after slice S0 had tried both: Opus 5.5 is the primary coder, and GPT reviews run on frozen copies beside the write lanes, where they cost no time. Design judgment and the project's vocabulary stay with Claude. Three earlier rulings of the same day stand. A Fable agent, not the main thread inside a brief, designs a solution before any implementer writes it. Taste review goes to a Claude model only, and solution design to Fable only. And a job is sized to its model: sol takes what an Opus agent would take, astra what a Fable agent would, in width and in depth. A GPT job is started with the launcher the orchestration guide describes, not through a forwarding agent, and its session id is kept so that a job that dies can be resumed. The mechanics, the briefing of each family and the calibration of a reviewer are in the orchestration guide, and this project's commands, brief fragments and job log are in its notes file. `AGENTS.md` names both.

Four rules from the stop of 2026-09-30, when ten parallel Fable agents hit the usage limit and one left 109 unreported edits:

- One unit per session.
- One write lane per tree. A second writer gets its own git worktree and files the first does not touch, and an integrator agent or the main thread merges its branch. Two writers share one tree only when the two briefs split the files and each names the other's files as forbidden, and then nothing is committed or checked until both are done.
- The ledger is written ahead: each finding and each status before the next begins.
- Every delegated job's report is saved to a file the moment it arrives.

## Open

1. Read `STATE.md`. It is the whole required reading. The orchestration guide and the project notes that `AGENTS.md` names are reference: open the section you need when you start a GPT job, and nothing else of them. Do not read the Specs, the doc or earlier reports as a way of opening: a builder reads the Specs it builds, and a ruling reads the lines it rules on.
2. Run `npm ci` if `node_modules` is missing, then `python3 design/tools/check.py`. It prints `OK` and the summary lines `STATE.md` records, the corpus digest and the Protocol pin included.
3. If a line differs, find out whether the corpus or the pin moved. A moved corpus makes the unit `recover`. A moved pin makes it `adopt`. Otherwise take the unit `STATE.md` names, unless the owner asks for another.

## Units

### slice

One slice of the build, as `STATE.md` cuts them. `python3 design/tools/check.py --slice S2` lists the findings a slice takes. Slice S1 was built this way in one evening, and the owner asked for it to stay the default: most of a thread's work is new design and code, and the main thread coordinates with as little of its own context as it can.

1. **Rule first, in one page.** The main thread writes its rulings on the slice's paper decisions and its thin cut (what the slice builds and what it leaves out) into one rulings file. A platform decision gets its provisional reading there and a line in the owner queue. This file goes into every builder's prompt. The main thread does not read the Specs of the slice to do this: `STATE.md` names the decisions.
2. **Build as a workflow.** One Workflow run of Opus agents builds the slice from the Specs' `## Design` entries: packages that share files run in sequence in the main tree, each committing its own package as unreviewed work; packages that do not, such as groups of scenario tests, run in parallel, one git worktree and one branch each; one integrator merges, runs every tier including the whole native tier on a clean tree, and writes one list of what needs a ruling. Each agent returns a short structured answer and writes its long report to a file. An agent builds the nearest thing that compiles where a Spec does not, and lists it; it never edits a Spec outside what its prompt allows. Scenario agents may rebind their own example Specs and add the sibling examples the ledger asks for, and they quote every changed line.
3. **Scouts are optional and run beside the build.** A read-only GPT job that compiles the pinned declarations, checks the Convex claims on the pinned backend, or inventories a finding's restatements costs the thread nothing if its report goes to the builders by path. The main thread reads a verdict line from it, never the report.
4. **Rule on the integrator's list.** Code wrong becomes one numbered fold-in for an Opus agent. Spec wrong or silent becomes a list of exact rulings that an Opus agent applies to the Specs and the ledger, the main thread approving them through the one review that follows. A Spec names no slice and says nothing about what is built so far: that lives in `STATE.md`, the ledger and the code anchors.
5. **One review of the slice, on frozen copies, beside the fold-in.** Astra at xhigh runs the whole branch against the doc's rows and the Specs and tries mutations. Sol at medium reads every changed line, split in halves when the diff is large. Each brief asks for a first section of at most fifteen one-line findings on a path a healthy run or an ordinary failure takes; the main thread reads that section and the titles, and rules by class.
6. **One fold-in, one read of the fold-in, then stop.** Tactical decision 19 in `STATE.md` says when: what is left goes to Leads.

A Fable design agent comes before the build only for something the Specs do not already pin as signatures. When it does, it proposes `## Design` entries and gets a time bound of about half an hour.

Done when the slice's tests pass at the tier each claims, the check prints `OK`, every finding the slice took has a status other than `open` or has moved to the slice that builds its subject with a note saying what that build must show, and every gap is ruled.

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
4. Commit as `design: <unit> <scope>` or `build: <slice> <scope>`, on the unit's branch, and push it. CI runs on every push. While the owner's mandate of 2026-10-01 holds, the session fast-forwards `main` to the branch once CI is green on the last commit, at the close and at any seam where the branch is green, and opens no pull request: the owner found on 2026-10-01 that a pull request per unit slows the design and build cycles at this stage. `STATE.md` says whether both still hold.

## Consensus

Consensus holds for Layers 0 to 2 when the first experiment passes on a native backend and each of the five lenses has `approve` as its latest verdict covering `HEAD`. `STATE.md` then names `owner` as the next unit. Layers 3 to 6 are written from what the experiment shows and reach consensus the same way afterwards.

## Handing over inside a unit

A build slice is too long for one conversation. The main thread hands over to a fresh main thread at a seam, before its own context gets in the way: after a commit, with no delegated job running and every report saved.

1. Reach the seam. Wait for or stop every delegated job. A Claude agent dies with the conversation and leaves no report. A GPT job started with the launcher survives it, and its report, events and session id are in the job directory the notes name.
2. Commit what is in the tree on the unit's branch, as work in progress if it is not reviewed, and say so in the message.
3. Write the handover note beside the unit's reports, in the folder the project notes name. It says what is committed, what each tier showed and at which commit, which findings are ruled and where the rulings are, what is drafted and not applied, the next steps in order, and what waits for the owner. It lists every instruction the owner gave during the conversation, in the owner's words.
4. Put a short "In progress" block at the top of `STATE.md` that names the unit, the seam and the note. The rest of `STATE.md` waits for the close.
5. Start the next main thread from this one, over cmux. Two panes of one workspace take turns: the thread that hands over goes idle, and the other pane carries the work until it hands back. `cmux identify --json` names this pane, and the owner or `cmux list-panes` names the other. Read the other pane with `cmux read-screen --surface <ref>` and make sure of three things before prompting it. Claude Code is running there in the repository; if it is not, start it with `cmux send`. The conversation is clear, with an empty context in its status line; if it is not, send `/clear`. A cleared conversation is required: a main thread that inherits a summary of this one inherits its weight. The model is Fable 5.1 at high effort, as its banner and status line show. Then send the prompt as one paragraph with `cmux send --surface <ref>`, because a newline submits, submit it with `cmux send-key --surface <ref> enter`, and read the screen once more to see that it started. The prompt names the unit, the note, and the files to read first.
6. The next main thread reads `STATE.md` and the note, runs the check, and confirms with `git status` and `git log` that the tree is what the note says before it does anything else. A note is one page: what is committed, what runs, what is ruled and where, the next steps, and the owner's instructions in the owner's words.

## When a session runs short

The ledger is at most one finding behind. Stop, write `STATE.md` with what is done and what is not, and let the next session open with `recover`. Hand over as above when there is still room to write the note.
