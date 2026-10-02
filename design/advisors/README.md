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

One launch for each advisor. The four run at once, because each writes its own patch and nothing else. `<folder>` is where the unit keeps its reports, outside the repository.

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

## The check

Before the owner sees a fork, and before a `delegated` lean becomes a ruling, a model of the other family opens every citation the lean rests on and marks each claim held, not held or not checked. For a Fable advisor that is `gpt-6.1-sol` at medium, or `gpt-6-astra` where a claim needs something run. The advisor corrects what did not hold, on its own thread. The main thread then sets `checkedBy` with a patch.

## How a decided row gets back into the Specs and `STATE.md`

- **`tactical`.** The session writes the numbered line in `STATE.md` and a patch that sets the row `decided`, by `session`, with that number in `ruling`.
- **`delegated`.** The main thread turns `lean.changes` into exact rulings, and a writer applies them to the Specs as any ruling is applied. The Spec states the reading as a rule or a Design entry and names no advisor and no date. An open question that is ruled leaves the Spec's open questions. An extension keeps its three marks, because the claim is still one the doc does not make. The row becomes `decided`, by `advisor:<slug>`. At the close `STATE.md` takes the tool's summary and the line count of `--decided --by advisor` since the last close.
- **`owner`.** In an `owner` unit. The session writes the owner's words and their date into the fork and into the row's `ruling`, and applies the ruling at the Spec that owns the question. Where the ruling changes the doc, the owner edits the doc.
- **Reopened.** The owner names an id. A patch sets the row to `owner` and `sorted`, an advisor writes its fork, and the Specs keep the ruling as the provisional reading.

A unit that adds, removes or rewords an open question of a Spec, an item for the owner or an E-number changes the row in the same commit.

## What is deliberately not built yet

- No tool checks an advisor's sentences against their citations. A model does.
- No reply stage between advisors, no memo of the whole panel and no summary page.
- No run folders. A patch lives outside the repository, and git is the history of the register.
- No check that the register and the Specs' open questions still agree. The rule above stands in for it.
- The ledger's findings and the leads of `STATE.md` are not rows. A finding that needs the owner becomes a row by hand.
- No advisor remembers an earlier launch. What it should know is in a file.
