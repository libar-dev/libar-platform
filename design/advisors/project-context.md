# What this project holds, and where to look

For every advisor, read after `protocol.md`. This page names places and holds no count, no status and no result, so that it stays true between closes. Where a number matters, the place that prints it is named.

## What the platform is

The Convex transactional domain platform: a library with which a business operation is one Convex mutation that authorizes a command, decides it against current state, records its events, updates its read models and answers. It is built in seven layers, each usable before the next exists.

## The sources, in the order that wins

| Source | Where | What it proves |
|---|---|---|
| The doc | `docs/convex-transactional-domain-platform-decisions.md` | What the platform is. Its decisions are proposals until the owner rules, and only the owner edits it. |
| The numbering key | `design/README.md`, "The numbering key" | What `D7`, `Law 3`, `F13`, `Probe 6`, `Sc L2-4`, `OQ1` and `E-32` name. |
| The language | `CONTEXT.md` | One word for each concept, and the words to avoid. |
| The Specs | `design/specs/<family>/*.sdp.md` | Intended truth. A Spec says nothing about what is built. |
| The extension register | `design/README.md`, "The extension register" | Every claim the design makes beyond the doc, with the Specs that own it. |
| The code | `src/kernel`, `src/context`, `src/command`, `src/read-model`; the production composition in `example/`; the fixture composition in `fixture/`; the harness in `harness/` | What is written. |
| The tests | `tests/types`, `tests/pure`, `tests/simulator`, `tests/native` | What happens, at the tier of the directory: compiled, pure test, `convex-test`, native backend. |
| Evidence records | `evidence/*.json`, described by `evidence/README.md` | What one native run showed, with its commit, its versions and its backend. A record that says `"clean": false` backs no claim. |
| The pins | `package.json` for `convex`, `convex-helpers` and `convex-test`; `harness/backend-release.json` for the backend | The versions a measured fact holds on. |

## The pointers

These say where to look. They prove nothing about a Spec or about the code.

- `design/STATE.md`: where the work stands, what each unit built and showed, the tactical decisions, the owner's words with their dates, the leads.
- `design/SESSIONS.md`: how a session runs, who decides, what wins when sources disagree.
- `design/reviews/consensus-ledger.json`: the review findings, each with its status, its Specs and the unit that takes it. `python3 design/tools/check.py --slice S4` lists the findings of one unit.
- `design/decisions/register.json`: the open decisions. `design/advisors/register.md` says how to read it, and `python3 design/tools/decisions.py --advisor <your slug>` lists yours.
- `design/PLAN.md`: section 6 for how a Spec is written, section 9 for the Convex pages read with their day, section 11 for the ambiguities.
- `docs/modern-ts.md`: the owner's research on building and releasing the library. Where it differs from the doc, the doc wins.

## How to read the Specs

Through the graph, from the repository root: `npx sdp q '<recipe body>' --json`, with a body from `node_modules/@libar-dev/software-delivery-protocol/docs/agent-surface/recipes.md`. Always `npx sdp`, and `q` only.

| Recipe | What it answers |
|---|---|
| 3 | One Spec: its sections, relations and verifiers |
| 6 | Where a concept is: every Spec that carries `D7` or `staleVersion` |
| 20 | Every open question, by Spec, blocking ones first |
| 21 | What one Spec rests on |
| 4 | What a change to these files reaches |
| 2 | What is built: the Specs a code anchor satisfies |
| 23 | Search of the keyed Design entries |

Then open the file and cite the line. A graph answer is a pointer too.

## Convex

The installed package is `node_modules/convex`, at the version `package.json` pins. The documentation is at `docs.convex.dev`, and a page you cite carries the day you read it. The fact ledger is `design/specs/facts/`, one Spec for each fact with its status, and `probe-plan.sdp.md` says which probes ran and what stays open.

## The earlier platform

`~/dev-libar/convex-event-sourcing`, private and read-only. It yields Convex facts and recorded failures, each with its date and versions. Rule 8 of the protocol says how to use it.

## What a close checks on this page

Each path above exists, each directory under "The code" and "The tests" is still where the code and the tests are, and the recipe numbers still name those recipes in the pinned catalog.
