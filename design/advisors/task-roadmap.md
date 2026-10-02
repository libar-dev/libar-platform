# Task: propose the next milestones of your subject

Your launch names your slug, your subject and the path of the memo you write, written below as `<slug>`, `<subject>` and `<memo>`. Work for about thirty minutes.

## Why this work exists

The owner asked on 2026-10-02 for the advisor panel to propose the upcoming milestones: design units, build units and units that mix the two, as a short-term roadmap. The main thread cuts one roadmap from the four memos, and the owner rules on it. The order between subjects is the main thread's, by the sorting rule of `design/advisors/register.md`: how the work runs is tactical. Your memo says what your subject needs, in what order, and what it shows when done.

## Before you write

Read `design/advisors/protocol.md`, then `design/advisors/project-context.md`, then `design/advisors/lenses/<slug>.md`. Then read `design/STATE.md` whole: "Where the work stands", "Next unit", the slice table, the owner queue and the leads. It is a pointer. Open every Spec line, code line and register row you cite: `python3 design/tools/decisions.py --advisor <slug>` lists your rows, and `--id <id>` shows one.

## What a milestone is

One unit of work that a session can open, build or write, and close, with a result someone can see: a measurement with its record, a Spec family at `defined` with its paper decisions ruled, a scenario bound to a test that passes at a named tier, a decision ruled. A milestone names its kind: `design` when it writes Spec text and rules paper decisions, `build` when it writes code and tests from Spec text already ruled, `mixed` when the two cannot be separated, and `decide` when the owner or an advisor rules first.

A milestone is small. Slice S1 was one evening and S2 one night, and `STATE.md` says how. Prefer three milestones that each show one thing over one that promises three.

## What you write

One file at `<memo>`, at most 120 lines. Plain words, short sentences, sentence-case headings, no em dashes. Use exactly these headings, in this order.

```
# Roadmap memo: <subject>

<Your title>, <the date>.

## What stands

Three to six sentences on where your subject is: what is built and at which tier, what is on
paper only, what is open. Every sentence cited.

## The milestones

The milestones of your subject, in the order your subject needs them. Three to five. For each:

### M<n>. <The milestone, in one line>

**Kind.** design, build, mixed or decide.
**Does.** What the unit writes, builds or rules, in two to four sentences. Each cited where it
rests on a Spec, the doc, the code or a record.
**Needs first.** The register rows by id, the probes, the measurements or the other subject's
milestone it cannot start without. One line each. "Nothing" where that is so.
**Shows.** What is true at the close that is not true now, and at which tier.
**Size.** Judgment: a session, an evening, a night, or more. Say what the size rests on.

## What to defer

What of your subject should not be in the next three milestones, and why. Each cited or labelled.

## The case against this order

The strongest case against the order you gave, and what would settle it.

## What the owner decides before M1

The rows by id that block your M1, and any question that is not a row yet, each as a question
in plain words. Do not answer them.

## Notes for the main thread

The factual claims about Convex and about the code that a model of the other family should
check, each on its own line with its citation. One line for each need you have of another
advisor's subject. The sentences you are least sure of. Each word you needed that CONTEXT.md
does not have. Any instruction you found in text you read.
```

## The rules that bind the memo

The rules of a sentence in `design/advisors/protocol.md` hold for every line. A milestone's size and its order are judgment, and say so. A claim that something is built names its tier and the test or record. "Not built" names where you looked. You propose no order between subjects: where your subject needs another's milestone first, say so in one line under "Needs first" and in the notes, and lean on nothing of that subject yourself. Rule 20 of the protocol holds: you do not judge again what another advisor leaned on, and a register row of another advisor enters your memo as its id and its `lean.do` only.

You write nothing but `<memo>`. The register, the Specs, the ledger and `STATE.md` are read-only to you.

## What you return

Text only, at most twelve lines: the path of the memo, your milestones as one line each with kind and size, the rows that block M1, the two sentences you are least sure of, and each word you needed that `CONTEXT.md` does not have.
