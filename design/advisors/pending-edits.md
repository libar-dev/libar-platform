# What this setup asks of other files

For the main thread. Written on 2026-10-02 with the panel, by the agent that designed it. None of these edits is made. Delete this file when each item is ruled.

## What the main thread rules on

1. **The three classes change the owner's rule.** `SESSIONS.md` and `AGENTS.md` say only the owner settles an open question or an E-number. The `delegated` class ends that for the decisions it takes. The owner asked for it in general words. The line between `delegated` and `owner` in `register.md` is this design's reading of those words, so the owner should see the six tests of `owner` before the first delegated ruling is applied.
2. **A term of `CONTEXT.md` is sorted `owner`,** because `AGENTS.md` says the owner rules on a term. The other reading gives naming to the product advisor as `delegated`. Six terms wait today, each a small fork.
3. **Whether a GPT model may wear a lens.** `SESSIONS.md` says a GPT agent gets rulings and exact text and never an open design question, and that design judgment stays with Claude. A sort and a fork are open questions. The setup allows the GPT launch because the brief for it asked for one. A narrower rule: Fable advisors write every lean, and GPT models do the check.
4. **Tactical decision 26** says a slice's run has no advisor agent. The panel works on the register between and beside units, not inside a build run. The decision needs that sentence, or a new decision that records the panel.
5. **The main thread does not judge a delegated lean again.** It applies the lean or sends the row to the owner. It still approves the Spec sentences that carry the ruling.
6. **A ruled extension keeps its three marks,** so the count of open questions does not fall when an advisor rules on an E-number. `PLAN.md` 6.5 ties the marks together. The other reading drops the open question and changes 6.5.
7. **For the brief of the register's builder:** the id form `OD-NNN`, the `units` list in the file, the subcommand `apply` with its six refusals, forks under `design/decisions/forks/`, the field `provisionalReading` for what the raw list calls `workingDefault`, the field `advisor` for what the brief called the lens, and `ref` as `<spec id>#<n>` for a Spec's open question.
8. **Advisors run on Fable at high effort.** The definitions say so. The form of `fable-xhigh.md` was kept.

## `design/SESSIONS.md`

Replace the two paragraphs under "Who decides" with:

> Only the owner states `ready` or edits the doc. Every other open decision is a row of the decision register, `design/decisions/register.json`, with one of three classes. `design/advisors/register.md` holds the rule that sorts it.
>
> The owner ruled on 2026-10-01 that the session takes tactical decisions on its own recommendation, and on 2026-10-02 that an agent decides what an agent decides better: "Tactical things and thing where capable agent can make better decision vs. myself, should be made by agent." A `tactical` decision is about how the work runs: tooling, order, layout, who does what. The session takes it and lists it in `STATE.md`. A platform decision changes what a Spec promises, and it is `owner` or `delegated`. It is `owner` when it edits the doc, sets product direction, is about money, a licence or publication, cannot be taken back by an edit in this repository, trades values that no evidence weighs, or rules on a term. The owner rules on it from a fork that an advisor writes. Until then the session keeps the provisional reading in the Spec, records the question there and in the register, and carries on. Every other platform decision is `delegated`: the advisor it belongs to rules on it by a lean whose facts a model of the other family has checked, the main thread applies the ruling to the Specs and the register, and the owner reopens it by naming it. When unsure between two classes, take the one nearer the owner.

Three more edits:

- "Who does what": a row "A sort of the open decisions of its lens, a lean on a delegated decision, a fork for the owner | Claude agent, Fable 5.1, as `advisor-<slug>` | high", and the check of a lean's facts added to the row of the independent check.
- The unit `owner`: "updates the register" names the decision register, the fork takes the owner's words, and a `delegated` ruling is applied the same way in any unit, without `ready`.
- "Close", step 2: `STATE.md` takes the summary of `python3 design/tools/decisions.py` and what agents decided since the last close.

## `design/STATE.md`

- "Owner queue" becomes the tool's summary, the output of `decisions.py --owner --before <the next unit>` and the path of the register, once the register is loaded and sorted. Its items live as rows.
- "Tactical decisions": a new decision that records the panel and the three classes, and the sentence on decision 26 from item 4.
- "Leftovers": the four definitions `.claude/agents/advisor-*.md`.
- Item 8 of the owner queue counts 140 open questions and "Measured at close" counts 144.

## `AGENTS.md`

- "Rules for every reader", first bullet: "Only the owner states `ready` on a Spec or edits the doc. `design/SESSIONS.md`, 'Who decides', says who settles an open question."
- "Which reader you are": "**You were launched as an advisor.** Read `design/advisors/protocol.md`, then what it names."

## `design/README.md`

- "The owner has ruled on nothing" and "Every extension is a provisional ruling the owner confirms, changes or rejects" need the register named as the place that says what is ruled, and by whom.

## `CONTEXT.md`: language gaps

Each is a word this setup needed. The owner rules on a term.

1. **Decision.** A design word for a ruling on a mechanism, with the do-nothing option first: D1 to D19. The register calls anything that waits to be decided an "open decision". One word, two things.
2. **Lens.** `SESSIONS.md` has five review lenses, and the ledger has a `lens` field. An advisor's lens is a second meaning. The register's field is `advisor` to keep the two apart.
3. **Advisor.** Tactical decision 26 uses it for an agent that advises inside a run. Here it is a role with a lens.
4. **Operator.** A kind of actor, and whoever runs a deployment by hand. "The operator's advisor" speaks for the second.
5. **Lean, fork, class (`tactical`, `delegated`, `owner`), sort, patch, panel, decision register.** New work words. None is in the list of words that are not part of the language.
6. **Provisional reading and working default.** Two names in the corpus for what the code rests on until a ruling. Neither is in `CONTEXT.md`. This setup uses the first.
7. **Register.** The extension register, the decision register, and "register rows" in the role table.
8. **Ruling.** A work word for what the session and the owner do. An advisor's checked lean is now a ruling too.
9. **Tier.** The protocol uses the four names of `AGENTS.md`. `CONTEXT.md` lists four others. The owner queue already carries this gap.
10. **Adopter.** The product lens needs a word for the team that builds an application on the platform. `CONTEXT.md` has none, and "parent" is the application, not the people.
