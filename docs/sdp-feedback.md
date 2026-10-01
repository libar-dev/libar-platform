# Feedback to the Software Delivery Protocol from this corpus

A running file, addressed to the Protocol's maintainers. Each `adopt` unit and each slice that learns something about the Protocol adds a dated section at the top. The first report, with its eight proposals, is [`sdp-development-from-application-platform.md`](sdp-development-from-application-platform.md).

Every number here was measured on this corpus on the date of its section. Re-run before relying on one.

## 2026-10-01, slice S0, the first build on the Protocol at `5993da7`

### A Spec with designed stubs is a maturity the Protocol cannot state

The owner's direction during this slice: the Protocol should support Specs at any level of maturity, and that includes a Spec whose key abstractions are designed as stubs. The earlier generation of this tooling, architect, did that, and the Protocol is its successor.

What happened here. Before a build job, a design agent decides the key abstractions of a Spec: the exported interface of a module, the shape of a record, the names. The slice's first design brief was this corpus's own mistake: it asked for a design that left the implementer nothing to decide, with no bound, and the agent wrote toward a long design file outside the repository and then prototyped the code, for about an hour. What the mistake showed is that the corpus had no home for the output of a design pass. A Spec that can hold the stubs is what bounds a design pass: the design is done when the Spec's key abstractions are stated as stubs, and the implementer writes the rest.

What the Protocol offers today, and where it stops:

1. **Readiness has no rung for it.** The rungs are `idea`, `scoped`, `defined` and `ready`, and they describe the intent. A Spec at `defined` with no design and a Spec at `defined` whose interfaces are settled look the same in the graph, so the build backlog cannot tell which Specs an implementer can start on.
2. **A stub in code reads as `implemented`.** The only binding from code to a Spec is a `codeAnchor` with `satisfies`, and the Protocol's `CONTEXT.md` defines `implemented` as one or more `satisfies` edges that resolve to the Spec, and the drift alarm as `implemented` without `ready`. A file of signatures with no bodies would claim the Spec is realized, and on a Spec below `ready` it would raise the drift alarm. There is no anchor, or flag on an anchor, that says "this is the designed surface, not the implementation".
3. **A stub in the Spec is one line of prose.** A `## Design` entry is `key: value` on one physical line, and fenced code is refused there. This corpus has 792 Design entries, counted as the bullets under every `## Design` heading on 2026-10-01, and 653 of them hold inline code; a multi-member interface on one line is hard to read and to review. Nothing checks a Design entry's signature against the exported one, so the two drift apart without a finding. Authored order for Design entries, already asked for below, matters more once the entries are stubs a reader walks in order.

The owner's proposal for item 3: the Markdown carrier would accept a `ts` fenced block in a Spec, holding the design of its key contracts: the interfaces, types and function signatures a reader would otherwise find squeezed into one-line Design entries. Today the carrier accepts two fences, `gwt-vocabulary` under `## Example space` and `gwt` on an example, and refuses every other.

What that leaves for the maintainers to decide:

- Where the block is lawful: under `## Design`, under `## Contract`, or both, and whether one block per Spec or one per named contract.
- Whether the graph reads it. Read as data, each declared name could be an entry that entry search (recipe 23) finds, and a later check could compare a stub with the exported signature of the code anchored to the Spec. Read as content only, it is still what a reviewer and an implementer need.
- How a Spec with such a block shows in the graph, which is items 1 and 2: a `designed` fact or rung that the build backlog can filter on, and a code binding for a stub file that does not derive `implemented`.

What this corpus does until then: the design agent proposes `## Design` entries and rules for the Specs a slice builds, signatures only, one line each, and the main thread writes them into the Spec. Stub files in code carry no anchor until they have bodies. If the carrier comes to accept a `ts` block, the Design entries that are declarations move into blocks, and the design pass writes its stubs there.

### What the build learned about binding an example to a test

Slice S0 bound eighteen examples to native tests with `bindExample` from the Vitest adapter. Seven things came up. The first two were read in `dist/adapters/vitest.js` of the pinned package, the others met during the build on 2026-10-01.

1. **A step is bound by its exact text.** `planExample` looks a step up as `bindings[step.text]`. When a review rewords a Then, the test stops compiling, because the contract's step type changed, and a run that skips the compiler fails with `bindings[step.text] is not a function`. That is the right alarm when the meaning changed. It is noise when the wording was polished and the meaning stayed. This corpus now changes an example's steps and its test in the same commit. A stable key per step, beside its text, would let prose be reworded without touching the test, and the adapter could then say "no binding for step <key>" in place of the type error.
2. **`bindExample`'s `after` runs only when every step passed.** The adapter awaits the plan and then `after`, with no `finally`. A test that owns a process cannot clean up there: a failed step would leave the process running. The harness registers its cleanup with Vitest's `onTestFinished` before the first await, and `after` is unused. A `finally` around the plan, or a sentence in the adapter's documentation, would make this plain.
3. **A test binds only to a Spec under the same root.** The corpus root was `design/`. The tests are outside it, so the root moved to the repository root, and `check.py` and every `sdp` call moved with it.
4. **A parent with no example space gets no registrar.** The harness Spec and the fact Specs have examples and no `## Example space`. Their tests import the example's step contract from `generated/contracts/` and call `bindExample`. That works, and it means `sdp build` has to run before the compiler: `npm run typecheck` and every test command here start with it.
5. **`specTest`'s `verifies` takes one `ref`.** A test that covers two examples needs two anchors. That fits one test per example, which is how every native test here is written, and is worth a line in the authoring skill.

6. **The slice built code for a day before any of it carried a `codeAnchor`.** The tests were anchored from the first build, because `bindExample` needs the contract. Nothing asked for the other half, so the graph showed the harness Spec with verifiers and no implementation, the drift alarm (recipe 2) returned nothing, and recipe 4 answered `coverageUnknown` for every harness file. A side read of the corpus found it at the close. One anchor on the harness kept validate at 0 warnings and made recipe 2 list the Spec as built and not `ready`, which is this project's queue of Specs waiting for the owner. A warning for "a Spec whose examples are bound and that no code satisfies" would have asked at the right moment.
7. **The build backlog reads stated `ready`.** Here the owner states `ready` after a slice passes, so recipe 1 stays empty for the whole build. The same question at `defined` with a clear floor is a short local body and gave 80 Specs. A parameter for the rung would make recipe 1 serve both ways of working.

One more, about evidence. Twice in this slice a reviewer's mutation showed a bound test that passed while proving less than its example said: of twenty mutations run on a native backend, nine left their test green, three on the first build and six on the second. The binding says which test claims an example. It cannot say whether the test would fail if the example were false. A corpus that leans on `verified` needs mutation runs beside it, and the Protocol's documentation could say so where it defines the term.

## 2026-10-01, adopting pull request 26 at `5993da7`

The corpus now depends on the Protocol at commit `5993da7b8f61ce00853b790cd9ffb428842b66d0`, the head of `feature/adopter-driven-hardening`.

### What blocks an adopter

1. **A dependency on the commit hash installs no CLI.** The pull request says the adopter can depend on the branch by commit hash. `npm install "github:libar-dev/software-delivery-protocol#5993da7…"` succeeds and installs `CONTEXT.md`, `docs/`, `specs/`, `.agents/` and `package.json`, with no `dist/` and no `node_modules/.bin/sdp`. `dist/` is ignored by git and the package has no `prepare` script, so nothing builds it on install. This corpus works around it: a clean clone at the commit, `npm ci`, `npm run build`, `npm pack`, and the tarball committed under `vendor/` as a `file:` dependency. A `prepare` script that runs the build would make the hash usable. So would a published prerelease.

2. **The CLI cannot say which engine it is.** `sdp --version` prints the usage text. The package version is `0.0.0` at every commit, and `graph.json` carries `schemaVersion` and nothing about the engine. This corpus was pinned to a sibling checkout's `dist/` until today. When the unbound-example change landed there, the corpus's own check failed with not one Spec changed: 54 expected warnings became 0. An adopter could not tell the tool moving from the corpus moving. The check now prints the dependency string from `package.json`. A `--version` that prints the package version and the commit it was built from would let any adopter record what produced a result.

### What worked, against the acceptance tests in plan 39

| Proposal | Test | Result |
|---|---|---|
| P2 | Unicode angle brackets become real ones and validate stays clean | 496 characters on 114 lines of 29 Specs replaced, every one inside an inline code span. `sdp validate design`: 0 errors, 0 warnings |
| P4 | Validate prints no warning on a corpus with no test anchors | 0 warnings, down from 54 |
| P3 | The assumed facts state `scoped`, and readiness divergence names a dependent that states `ready` | F14, F15 and F17 state `scoped` behind a blocking question that names the probe. They have 11 distinct `constrainedBy` dependents. On a scratch copy, stating `ready` on one of them makes recipe 7 return that Spec |
| P5 | The census sentence and the open-question table come from commands | Both hand-kept registers are deleted from the README. `sdp census` gives the counts. Recipe 20 gives 129 questions on 67 Specs, 12 of them blocking |

The authoring skill's section on what is not settled was applied as written, in two places. Nine deferred Specs each carry a blocking question that names the trigger. Three assumed facts each carry a blocking question that names the probe. Both were one-word edits to questions the corpus already had, and the corpus's own rule that a blocking question forces `scoped` agreed with the floor without a change.

Five checks left this corpus's check script because the Protocol now covers them: one warning per example, the README's warning count, the census sentence, the open-question tally and the open-question table.

### Smaller things

- **Recipe bodies are only in a Markdown file.** A script that wants recipe 20 has to cut the fenced block out of `recipes.md`. One file per body beside the catalog would let an adopter run `sdp q "$(cat …/20-open-question-register.js)"`. That adds no query verb, so it stays inside the agent-front-door ruling.
- **Recipe 22 on this corpus:** 153 mentions, 112 pairs, 34 backed, 78 unbacked, none unresolved. Of the 78, 28 are declared from the target's side and 50 from neither. The `declaredByTarget` column is what makes the list usable: it separates a parent naming its child from a relation nobody declared. Whether the 50 are missing relations or plain pointers is not known yet. The slices will say, one family at a time, and the answer bears on what the checked-mentions decision should warn about.
- **The derived step contracts are a head start.** `validate` writes 71 contract modules under `generated/contracts/`, one per example and per example space. The first tests in this repository will bind to them.

### Still wanted from the open questions on the pull request

- Authored order for `design` entries (`spec:extraction.open-section-order`). The Design Review still shows this corpus's pinned declarations alphabetized inside a JSON block, which is how a reviewer reads its 762 keyed Design entries today.
- Checked mentions (`spec:decisions.checked-mentions`). One concept stated in two Specs that disagree is still this corpus's largest class of defect, and the validator cannot see it.
