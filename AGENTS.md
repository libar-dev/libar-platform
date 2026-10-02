# libar-platform

The Convex transactional domain platform. `docs/` holds the inputs. `design/` holds the design as a Software Delivery Protocol corpus of Specs. The code built from the design sits beside them: `harness/`, `fixture/` and `tests/`.

## Which reader you are

- **You run the session.** Read `design/STATE.md`, then follow `design/SESSIONS.md`.
- **You were handed a brief.** The brief is your task and its limits. Change only the files it names.

## Rules for every reader

- `docs/convex-transactional-domain-platform-decisions.md`, "the doc", says what the platform is. Its decisions are proposals until the owner rules. Only the owner states `ready` on a Spec, settles an open question or edits the doc.
- A Spec is intended truth. Report code that disagrees with a Spec as a gap, and the main thread rules which side changes.
- Read the corpus through its graph. Run `npm ci` once, then, from the repository root, `npx sdp q '<recipe body>' --json` with a body from `node_modules/@libar-dev/software-delivery-protocol/docs/agent-surface/recipes.md`. Always `npx sdp`: a bare `sdp` on macOS is an unrelated tool.
- Before you write or edit a Spec, read `design/PLAN.md` section 6 and `node_modules/@libar-dev/software-delivery-protocol/.agents/skills/sdp-authoring/SKILL.md`.
- `python3 design/tools/check.py` prints `OK` when the Specs, the README and the ledger agree. Run it before you say they do.
- Name the tier behind a claim about behavior: compiled, pure test, `convex-test`, or native backend.
- The earlier platform, in the `convex-event-sourcing` repository, is evidence about Convex and about what failed. Take a fact from it with its date and versions. Take none of its designs or working habits.
- `design/reviews/r3-*.jsonl` are records of a finished review round and keep their text.
- Prose uses plain words, sentence-case headings and no em dashes.

## The language

`CONTEXT.md` is the platform's ubiquitous language: one word for each concept, with the words it replaces. Read it before you name anything or write a sentence about the platform: a type, a table, an event, an error code, a Spec bullet, a scenario step.

It sorts words three ways, and the sorting is the rule:

- **Domain words** say what the platform is: command, event, context, receipt. Code names and Specs are written in them.
- **Design words** say how the platform is specified and proven: layer, probe, scenario, tier. They appear in Specs and name nothing in the code.
- **Work words** say when and by whom something was done: slice, session, fold-in, a date, "built so far". They are true for a while and then stale, so they live in `design/STATE.md`, the review ledger, commit messages and reports.

A word you need that is missing, or one word used for two things, is a gap in the language: report it. The owner rules on a term.

## On the owner's machine

- How one Claude thread works with Claude and GPT agents: `~/dev-libar-supporting-context/gpt-models/gpt-models-from-the-claude-main-thread.md`.
- This project's commands for a brief, its job log and the reports gathered so far: `~/dev-libar-supporting-context/gpt-models/gpt-models-project-notes/application-platform.md`.
