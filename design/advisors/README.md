# The advisor panel

Four advisors that sort the platform's open decisions, decide the ones an agent decides better than the owner would, and put the rest in front of the owner as forks with a lean. The owner asked for it on 2026-10-02: "I will need help with all owner decisions. We should have a way of trakcing/filtering them. Tactical things and thing where capable agent can make better decision vs. myself, should be made by agent."

The open decisions are the rows of `design/decisions/register.json`. `register.md` holds the three classes, the sorting rule, the rule that gives a row its advisor, the fields and what `python3 design/tools/decisions.py` answers.

## Three layers

An advisor is three layers, kept apart so that a change to one leaves the other two alone.

| Layer | File | Changes when |
|---|---|---|
| The lens: the questions a field asks of any decision, its hazards, its reading list | `lenses/<slug>.md` | The field's questions get sharper |
| The protocol: how an advisor stands on the corpus, what a lean is, the limits | `protocol.md`, with `task-sort.md` and `task-fork.md` | The way of working changes |
| The project: what the corpus holds and where to look | `project-context.md` | A close moves a path |

| Advisor | Slug | Lens | Definition |
|---|---|---|---|
| The Convex specialist | `convex` | What Convex gives natively, its limits and costs, the cheaper native design | `.claude/agents/advisor-convex.md` |
| The domain architect | `domain` | Invariants, consistency boundaries, history, migration, recovery of meaning | `.claude/agents/advisor-domain.md` |
| The operator's advisor | `operator` | Running, restoring and repairing it, authority and tenancy, what fails at night | `.claude/agents/advisor-operator.md` |
| The product advisor | `product` | Who adopts the library and why, scope, what to cut, naming, release, licence | `.claude/agents/advisor-product.md` |

A definition holds three paths and nothing else. A fifth advisor is one lens file, one definition and one row of the table in `register.md`.

## How the main thread runs a sort

One launch for each advisor. The four run at once, because each writes its own patch and nothing else. `<folder>` is where the unit keeps its patches and memos, outside the repository.

A Claude agent:

```
Agent(subagent_type: "advisor-convex",
      prompt: "Your task is design/advisors/task-sort.md. Your slug is convex. Write your patch to <folder>/sort-convex.json.")
```

A session that began before the definitions existed does not have these agent types. It launches `fable-xhigh` with the protocol, the project context and the lens named in the prompt, in that order.

An advisor is a Fable agent: a sort and a lean are open questions, and design judgment stays with Claude. A GPT model does the check below.

The main thread merges each patch with `python3 design/tools/decisions.py apply <patch>` and commits the register.

## How the main thread runs a fork

`python3 design/tools/decisions.py --owner --before <unit>` lists what the owner must decide first. One launch for each fork, or one for a few forks of the same advisor, with `design/advisors/task-fork.md`, the ids and a patch path. Forks of different advisors run at once: each writes `design/decisions/forks/<id>.md` and its own patch.

## How the main thread runs a roadmap

The owner asked on 2026-10-02 for the panel to propose the upcoming milestones as a short-term roadmap. The task is `task-roadmap.md`, and the aggregated result is `design/ROADMAP.md`, a work document the main thread cuts from the four memos and the owner rules on.

One launch for each advisor, the four at once, each with a disjoint subject, because the owner ruled on 2026-10-02 that one agent decides one thing. The subjects of the first run: measurement and the Convex facts; the domain design and the domain build; the operator's parts; scope, the cut and what the owner decides. The order between subjects is the main thread's, as a tactical decision, and the task says so.

```
Agent(subagent_type: "advisor-domain",
      prompt: "Your task is design/advisors/task-roadmap.md. Your slug is domain. Your subject is: <the subject>. Write your memo to <folder>/roadmap-domain.md.")
```

Then, in this order:

1. The memos are copied to `<folder>/check-copy/`, and the main thread plants one false citation in each copy and records the plants in `<folder>/plants.md`, as tactical decision 31 of `STATE.md` asks for a review copy.
2. One `gpt:codex` job, `gpt-6.1-sol` at medium with the fast tier, checks the copies: every cited claim held, not held or not checked, every unlabelled fact listed. Its brief is `<folder>/check-brief.md`, and its report stays in its job directory under `~/.codex-jobs`.
3. While the check runs, the main thread writes `design/ROADMAP.md`: the cut as one table, the rounds, what is deferred with its trigger, where the advisors differed and what was ruled, the questions that are not rows yet, the findings beyond the roadmap, and the words the advisors needed that `CONTEXT.md` lacks.
4. The claims the check marked not held are corrected in the roadmap, or the advisor is continued with the check's findings where the memo must change. The plants caught go into `plants.md` and the project notes.
5. The unit closes as any unit does: the check prints `OK`, `STATE.md` points at the roadmap, the commit goes up through a pull request.

The next run is lighter, by the owner's words of 2026-10-02, quoted in tactical decision 37 of `STATE.md`. One Fable advisor and one astra advisor are launched for input, on the subjects where the roadmap is in doubt; astra runs as a `gpt:codex` job whose brief carries the protocol, the lens and the task by path, at high effort. The product advisor, a Fable agent, cuts the roadmap as its product manager, with the same task file and the same check. The main thread rules on the tactical questions and asks the owner only for the critical forks. Forks are drafted by `gpt-6.1-sol` from the register's leans and the Spec lines they cite, read by an Opus agent for balance, and an advisor rewrites one only when the owner names the row: Fable is spent on the main thread and on the design of a slice on paper.

What the first run showed, on 2026-10-02. Four advisors took five to six and a half minutes each, at 186 to 231 thousand tokens, and each returned a memo of 76 to 86 lines in the task's shape. The disjoint subjects held: no advisor leaned on another's decision, and the needs between subjects came back as one-line requests, as the task asks. Two advisors put the same case against the order, S3 before S4, which is the main thread's to rule. Every advisor listed the words it lacked; the union is in the roadmap. The memos state far fewer unlabelled facts than the first sort did: the task repeats the rules of a sentence, and that appears to be enough. The sol check took ten minutes on the fast tier for 291 claims and caught all four plants; its real findings were line citations past the end of a Spec, which an advisor can avoid by opening the line, and sentences that said more than their source.

## The check

Before the owner sees a fork, and before a `delegated` lean becomes a ruling, a model of the other family opens every citation the lean rests on and marks each claim held, not held or not checked. For a Fable advisor that is `gpt-6.1-sol` at medium, or `gpt-6-astra` where a claim needs something run. The advisor corrects what did not hold, on its own thread. The main thread then sets `checkedBy` with a patch. A roadmap memo is checked the same way, on a copy with a plant.

## How a decided row gets back into the Specs and `STATE.md`

- **`tactical`.** The session writes the numbered line in `STATE.md` and a patch that sets the row `decided`, by `session`, with that number in `ruling`.
- **`delegated`.** The main thread turns `lean.changes` into exact rulings, and a writer applies them to the Specs as any ruling is applied. The Spec states the reading as a rule or a Design entry and names no advisor and no date. An open question that is ruled leaves the Spec's open questions. An extension keeps its three marks, because the claim is still one the doc does not make. The row becomes `decided`, by `advisor:<slug>`. At the close `STATE.md` takes the tool's summary and the line count of `--decided --by advisor` since the last close.
- **`owner`.** In an `owner` unit. The session writes the owner's words and their date into the fork and into the row's `ruling`, and applies the ruling at the Spec that owns the question. Where the ruling changes the doc, the owner edits the doc.
- **Reopened.** The owner names an id. A patch sets the row to `owner` and `sorted`, an advisor writes its fork, and the Specs keep the ruling as the provisional reading.

A unit that adds, removes or rewords an open question of a Spec, an item for the owner or an E-number changes the row in the same commit.

## What is deliberately not built yet

- No tool checks an advisor's sentences against their citations. A model does.
- No reply stage between advisors and no summary page. The one memo of the whole panel is the roadmap, cut by the main thread and not by the advisors.
- No run folders. A patch lives outside the repository, and git is the history of the register.
- No check that the register and the Specs' open questions still agree. The rule above stands in for it.
- The ledger's findings and the leads of `STATE.md` are not rows. A finding that needs the owner becomes a row by hand.
- No advisor remembers an earlier launch. What it should know is in a file.
