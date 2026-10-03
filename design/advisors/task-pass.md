# Task: read one capability's design from your lens

Your launch names your slug, a Pack and the path of the memo you write, written below as `<slug>`, `<pack>` and `<memo>`. Work for about thirty minutes.

## Why this work exists

A capability is designed in its Specs before anyone builds it. The owner asked on 2026-10-03 for designs of coming work to be first-class in the corpus and to be iterated from several perspectives before the work is committed to. `design/PLAN.md` 6.7 says how such a design sits in the graph: one maturity per Spec, a Pack that gathers what the capability rests on, pinned declarations that compile, entries cited by address. A pass is one reading of that design from one lens. It finds what the design leaves an implementer to guess, what it gets wrong, and what it cannot settle yet. The main thread rules on what you find, and the next pass reads the result.

## Before you read

Read `design/advisors/protocol.md`, then `design/advisors/project-context.md`, then `design/advisors/lenses/<slug>.md`. Then read the Pack through the graph, from the repository root, with bodies copied verbatim from `node_modules/@libar-dev/software-delivery-protocol/docs/agent-surface/recipes.md`:

- recipe 5, the Pack review backbone, with `<pack>`: the members, their rungs and bindings;
- recipe 20, the open questions, and recipe 21, the dependency footing, for each member that pins what the capability builds;
- recipe 24, the pinned declarations, filtered to the members, and `generated/pinned/` after `npm run sdp:build` has run, for the shapes as one module;
- the member Specs themselves, where a question turns on their text.

## What you look for

The questions of your lens, asked of this design: what a specialist of your field would want settled before the first line of code. `design/PLAN.md` 6.7 lists a few per lens; they are a start, not a limit. Keep to your lens. A question of another lens is one line in your return.

## The memo

One Markdown file at `<memo>`, at most fifteen findings, the most consequential first. Each finding is one short paragraph under a heading of a few words, and it says:

- **Where:** the entry address of the Design entry it concerns, `spec:<id>#design.<key>`, or the Spec id and the section when no entry holds it.
- **What:** the gap, the error or the open point, every sentence on its basis as `protocol.md` writes it.
- **Proposed:** one of four things. Exact text for a Spec, with the entry address it replaces or follows, in the words of `CONTEXT.md` and none of the work's. An open question for a Spec, with `[blocking]` or `[non-blocking]`. A row for the decision register, with the class you would give it. Or nothing, when the finding only informs.

## What you return

Text only, at most twelve lines: the path of the memo, the findings by kind of proposal, the three you are least sure of, every question you left to another lens, and each word you needed that `CONTEXT.md` does not have.
