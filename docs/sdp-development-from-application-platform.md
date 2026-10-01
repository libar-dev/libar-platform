# SDP development, driven by the application-platform design corpus

Written 2026-10-01. One reader's analysis of one adopter. Every number here was measured that day and the commands are in the text or in appendix B, so each can be run again.

| Input | State when read |
|---|---|
| Adopter | `application-platform`, branch `design-corpus`, commit `f44cad4`: 168 Specs, 5 packs, 919,333 bytes of carriers under `design/specs/` |
| Review ledger | `design/reviews/consensus-ledger.json` at `f44cad4`: 136 findings over three rounds. All counts by class use this snapshot |
| Round 3, other lenses | Four lenses were writing `design/reviews/r3-*.jsonl` while I worked. Round 3 closed at commit `a5afbde`, which takes the ledger to 231 findings. I read those files last at 07:57 and report them separately |
| SDP | `software-delivery-protocol` at `25d24f2`, graph schema `0.5.0`, CLI at `dist/cli/sdp.js` |

Below, "the doc" is `docs/convex-transactional-domain-platform-decisions.md`, "the plan" is `design/PLAN.md`, and Spec paths under `specs/` belong to the repository the sentence names.

## 1. Summary

### The corpus

The corpus is a design with no code. It transcribes the doc into 56 foundation Specs (19 decisions, 12 laws, 17 facts and the rest), then designs Layers 0 to 3 in full and Layers 4 to 6 as rules and scenarios. Five work packages wrote it, four of them in parallel. An integration pass joined them, and five review lenses read it for three rounds. It holds 3,000 bullets. 762 of them are keyed Design entries in 50 Specs, and those entries are where the TypeScript types, Convex tables, function signatures, step sequences and numeric limits live.

That last fact is why this corpus is a useful driver. SDP's own corpus has 161 Markdown carriers and 758 bullets, and four of its Specs have a Design section, the largest with five keyed entries. SDP's own corpus has one `constrainedBy` edge. This one has 292. The adopter uses hard the parts of SDP that SDP itself has barely used.

### What SDP gave that worked

- **Validate was the merge contract for five parallel packages.** The plan told each package that the only tolerated error was `conformance/referential-integrity` naming a Spec another package had yet to write (plan, section 3.3). The merged corpus has 881 edges and none dangles. No review finding in three rounds is about a broken relation.
- **The closed section grammar made template conformance a non-issue.** 22 decisions, 25 constraints and 2 models all have the same shape because the carrier refuses anything else. Of 136 findings, one is about a missing template part (`r2-sdp-layer4-6-rules-missing-deferred-design-bullet`), and that part was the adopter's own convention.
- **Stated readiness stayed honest.** Recipe 7 returns `[]`. The floor let 12 examples state `defined` under parents that state `scoped`, which the plan relied on. No finding disputes a stated rung.
- **Typed relations turned the source document into a queryable base.** Every law is the target of at least 5 dependency edges from outside its own family, and every one of the doc's decisions of at least 1, measured with one `q` body. "Which designs rest on fact F14" returns 5 Specs.
- **Point-per-example did real work.** The doc has 43 scenario rows and 9 of them enumerate cases. The law split them into 54 examples and exposed four cases the plan had missed (`design/README.md`, "ID changes"). 42 examples bind points in 17 example spaces and validate checks every step against its parent's vocabulary.
- **Refusals are loud.** Every carrier rule the adopter tripped over produced an error with a file and a line. Nothing was dropped in silence, which is why the plan could list the rules after one round of probing.
- **It is fast.** `validate` takes 0.36 s on the whole corpus, `view` 0.40 s, `q` 0.28 s. The authoring loop was never the bottleneck.
- **`q` was enough for every register I tried to derive.** The open-question tally, the extension register and the prose-mention check in this report each took one body of ten lines or fewer.

### The directions that matter most

1. **Make references between Specs checkable below the Spec level.** 53 of the 136 findings, and 23 of the 56 majors and blockers, are one concept stated in two or more Specs that disagree. Validate saw none of them. Round 3's `sdp` lens closed with 38 findings, and 35 are of the same kind. SDP's rule that promotion is exclusive stops this at the level of a Spec. Nothing stops it at the level of an entry.
2. **Let the `ready` floor see every dependency.** The floor reads `dependsOn` and `refines`. 380 of this corpus's 492 dependency edges are `constrainedBy` or `decidedBy`. Eleven Specs rest on facts the corpus itself marks as assumed, and the floor would let all eleven state `ready`.
3. **Close the on-ramp gap.** The default carrier's body grammar is written down only in parser source. Four conventions the adopter invented have a ruled home in SDP that the adopter did not find. Three hand-kept README indexes can be derived today.
4. **Stop warning about honest states, and render Design entries in the order they were written.** All 54 warnings in the corpus are the same one. The Design Review prints a ten-step sequence as step 1, step 10, step 2.
5. **Later, give contract content a typed home and a derived module.** SDP already names this as a deferral. This corpus is the first evidence of what the section must hold.

## 2. Evidence

### 2.1 Where the review effort went

I read all 136 findings and gave each one primary class. The classes and the assignment are mine. Appendix A lists every id so the assignment can be checked.

| Class | What it is | Findings | Major or blocker | Could a protocol-level check help |
|---|---|---:|---:|---|
| T1 | One concept defined in two Specs with different names, fields or values | 12 | 7 | Narrows. A single owner per entry plus checked references |
| T2 | A use that does not match its declaration: a call passes a field the validator lacks, a type is referenced and never declared | 25 | 10 | Narrows. A compile of the declared signatures catches the name-level part |
| T3 | Two Specs state one step sequence or one list of state transitions differently | 16 | 6 | Narrows. Same mechanism as T1 |
| N | A numeric bound whose arithmetic fails, or one bound with two values | 21 | 9 | Only the "two values" part, 3 findings |
| X | An example the parent's design cannot run | 5 | 2 | No |
| C | A claim beyond the source with no marker, or a claim with no source | 10 | 2 | No. A tool cannot tell that a bullet says more than the doc |
| E | The text names a Spec, law or fact and the Spec declares no relation to it | 2 | 0 | Yes |
| R | A Spec rests on an assumed fact and does not say so | 1 | 0 | Yes, through the floor |
| I | A hand-kept README row or count is stale | 4 | 0 | Yes. Derive it |
| P | An adopter template part is missing | 1 | 0 | No. Adopter convention |
| K | The design contradicts documented Convex behavior | 7 | 4 | No |
| J | Architecture judgment: a failure mode, a cheaper design, a missing mechanism | 32 | 16 | No |

T1, T2, T3 and N together are 74 findings and 32 of the 56 majors and blockers. J and K are 39. The rest is 23.

Three more observations from the same data.

- The mechanical classes do not go away. T1 to T3 had 31 findings in round 1 and 19 in round 2, and several of round 2's name a round 1 fix as their cause, such as `r2-sdp-assert-writable-allow-generation-leftover` and `r2-sdp-declaration-helpers-omit-correlation-id`. `r3-sdp-streams-entry-listed-without-events` says it in one sentence: "The round-2 history-view fix added `events` to the type and left these two sentences at the earlier shape."
- By my grouping, 21 defects were reported more than once, mostly by different lenses. They account for 50 findings, so 29 findings are repeats. The `entityExists` conflict appears four times.
- The `sdp` lens spent its time on what validate cannot see. Of its 32 findings in rounds 1 and 2, five are about SDP form. In round 3, three of 38 are. Its round 3 verdict says every rubric item about SDP form holds and the one about consistency does not: "no type, validator or table is defined twice with different text. The majors are signatures that do not meet" (`design/reviews/r3-sdp.jsonl`).

This report was asked to look for eight defect classes by name. One concept defined twice is T1. A signature that differs between two Specs is T2. A step sequence numbered differently is T3. A numeric bound that contradicts another Spec is N. An example the parent cannot satisfy is X. A claim with no citation is C. A readiness stated over an unsettled assumption is R, with one finding, and section 2.5 shows the larger problem behind it. A table index no query uses has no finding in the committed ledger. Round 3 has one near it, `r3-sdp-index-does-not-carry-the-stated-query`.

### 2.2 One concept, several statements

What the adopter needed was one owner for each type, signature, limit and step, and a way for other Specs to refer to it.

What it did instead was restate. The plan's rubric item 13 asks for "one type per concept" and reviewers enforce it by reading. After round 2 the Specs carry a prose convention for it. The phrases "never redefined" and "never restated" appear 11 times, as in `design/specs/kernel/decider-contract.sdp.md`, where the entry reads "typeRejection: reused from `spec:kernel.outcome-model`, never redefined". Those references are prose. Nothing resolves them.

What it cost, measured on the corpus as it stands after three rounds:

- `limitStreamsPerCall` is a Design key in three Specs (`batch-shaped-api`, `context-component`, `persistence-adapter`), each restating the rule with a different worked number. `limitOrderLines` is in three. 41 Design keys recur across Specs. Most of the 41 are generic names such as `step1` or `transactionBoundary`. The ones that matter restate a limit, a type or an error code.
- Nine type names appear in pinned signatures and are declared by no Spec: `Journal` (12 uses in 5 Specs), `GetArgs`, `ListArgs`, `HistoryArgs`, `WriteBaselineArgs`, `WriteBaselineResult`, `DiagnosticSink`, `AuditRecordInput`, `BatchCursor`. I found them with a regular expression over inline code. Round 3 reviewers found two of the nine by reading: `r3-sdp-rebuild-query-typed-with-get-args` and `r3-completeness-audit-record-fields-have-no-source`.
- Specs name other Specs in prose 153 times, 112 distinct pairs. All resolve. 78 of the pairs have no declared relation, across 42 Specs. `persistence-adapter` takes a type and three functions from `spec:context.journal` and names it twice, and declares no relation to it. So `g.blastRadius(["specs/context/journal.sdp.md"])` lists 18 at-risk nodes and the adapter is not one of them. Round 3's first `sdp` finding, `r3-sdp-appended-envelopes-have-no-carrier`, is a signature mismatch between exactly those two Specs, and `r3-sdp-contracts-compose-without-depends-on` reports the missing edge and its effect: "a query for what depends on a contract misses its consumers".
- The pipeline's steps are plain Workflow bullets with "Step 1" to "Step 11" written into the text, and "Step 5" is used twice. Nine other Specs refer to "the pipeline's step N" 23 times. SDP sees an ordered list of strings.

The session protocol states the fix procedure as "change the Spec that owns the concept, then every Spec that repeats it" (`design/SESSIONS.md`). Finding every Spec that repeats it is a text search today.

### 2.3 The Design section carries the design, and nothing checks it

SDP's typing law leaves Design open: "unsettled design and ui surfaces remain open bags" (SDP `specs/model/spec-sections.sdp.md`). The parser accepts optional paragraphs and then `- lowerCamelKey: value` bullets with unique keys (`mapOpen` in `src/extract/markdown-body-owner-sections.ts`).

The adopter built a notation on top (plan, section 6.3). A key prefix names the entry's role and the value is one line of inline code followed by prose.

| Key prefix | Entries |
|---|---:|
| `limit` | 96 |
| `fn` | 95 |
| `type` | 94 |
| `index` | 55 |
| `step` | 45 |
| `validator` | 35 |
| other | 342 |

SDP stores each value as a string. It does not know that `typeStreamResult` declares `StreamResult`, that `fnExecute` uses it, or that `step3a` comes after `step3`.

SDP has already said where this is heading. `specs/validation/kind-evidence.sdp.md` in SDP: "The `contract` row stands on the behavior row as a named deferral: when a dedicated contract section lands, the typing law pulls it in and this row repoints to it." The carrier ruling records that the contract kind was "parked honestly at `idea`" in the exhibit that chose Markdown (SDP `plans/16-carrier-ruling.md`). This corpus has 17 contract Specs.

### 2.4 The carrier rules that bit

The plan's section 6.2 lists fifteen rules and opens with: "Validate enforces these. They were each tried against the CLI on 2026-09-30; the probe corpora are not kept, the findings are." I ran fifteen probes again in a scratch directory outside both repositories. All of the plan's claims that I tested hold.

| Probe | Result from `sdp validate` |
|---|---|
| `Promise<AppendResult>` inside backticks in a Design entry | error, `raw HTML is unsupported` |
| The same with `⟨ ⟩` | accepted |
| A table under Design | error, `nested or unsupported Markdown structure` |
| A `ts` fence under Design | error, `fences must be exact gwt or gwt-vocabulary fences` |
| A bullet wrapped onto an indented second line | error, `nested or unsupported Markdown structure` |
| `- Applied: the command committed` under Contract | error, `property "Applied" is not accepted` |
| A plain bullet under Design | error, `open section keys must be lower-camel ASCII` |
| `### Tables` under Design | error, `open sections do not accept an H3 or fence` |
| An ordered list under Contract | error |
| A second `statement` under Constraints | error, `field "statement" is authored more than once` |
| A paragraph after the first Design bullet | error, `prose after structured content has no owner` |
| `spec:probe.does-not-exist` named in a Contract bullet | accepted, no finding |

What each rule cost:

- **Generics.** The HTML guard is one regular expression applied to the whole line (`isHtml` in SDP `src/extract/markdown-body-content.ts`, and `narrative` in `src/extract/markdown-body.ts`). It does not skip code spans. The corpus has 248 `⟨` characters in 29 Specs. The plan's own reason for the notation is "so a reader can paste it into `schema.ts`", and a signature with Unicode brackets cannot be pasted.
- **One bullet, one line.** The mean bullet is 224 characters. 27 lines are longer than 1,000 and the longest is 2,370 (`design/specs/context/journal.sdp.md`). The plan adds "Never run Prettier or another Markdown formatter over `.sdp.md` files." No finding in the ledger comes from this rule, so I count it as a reading and diff cost and no more.
- **No fences, no tables.** Every table schema and multi-member type is one line of inline code. `validatorOperationOutcome` in `persistence-adapter` is one such line.
- **One constraint per Spec.** The TypeScript shape is an array (`ConstraintSection[]` in SDP `src/model/sections.ts`) and the Markdown carrier accepts one entry. `events-stay-small` needed two targets after round 2 and wrote them as one string joined by a semicolon.
- **The keyed-bullet rule.** In Rule and Contract a bullet that starts with one word and a colon is read as a key and refused. Authors rephrase.

One absence matters more than any of these. SDP has no document that states the Markdown body grammar. I searched SDP's `docs/`, `.agents/`, `specs/`, `README.md`, `AGENTS.md` and `CONTEXT.md` for the grammar's own words ("lower-camel", "nested or unsupported", "plain bullets", "keyed bullet") and for "HTML" under `specs/`. No hits. The Gherkin carrier, which is optional and covers two kinds, has `specs/carrier/gherkin-authoring.sdp.md` and thirteen example children that pin its refusals. The Markdown carrier, the default for all eight kinds, has a one-rule Spec. Section 6.2 of the plan is the Spec SDP is missing, written by an adopter from probes.

### 2.5 Readiness cannot see what a Spec rests on

The doc keeps a fact ledger with a status per row: documented, rechecked, probed or assumed. The plan maps each fact to a `constraint` Spec and writes the status into `target` as `evidence.status:assumed`, "so the graph answers 'which designs rest on an assumption'" (plan, section 3.2).

It does answer that, because the adopter's string can be compared. Three facts are assumed. Eleven Specs point `constrainedBy` at them. All eleven state `defined`, and all eleven derive `ready`. So do the three assumed facts themselves. 60 Specs that carry an open question derive `ready`.

Two things in SDP produce this.

- The `ready` clause reads two relation types. `dependsOnAndRefinesTargetsAreDefined` in SDP `src/validate/readiness-floor.ts` skips every edge that is not `dependsOn` or `refines`. SDP's own model calls the other two dependencies: "`constrainedBy` and `decidedBy` preserve separately queryable intents that a generic `dependsOn` edge would flatten" (SDP `specs/model/relations.sdp.md`). In this corpus the edge counts are `constrainedBy` 292, `decidedBy` 88, `dependsOn` 112.
- "Machine-readable target" means a non-empty string. `constraintTargetsAreMachineReadable` checks `isNonEmptyString`. SDP's own two targets use two notations (`latency.p95.lt:250ms` and `sha256(tree@run1) == sha256(tree@run2)`). So `evidence.status:assumed` passes the `defined` floor as a complete constraint.

The adopter's guard is policy. `check.py` fails if any Spec states `ready`, and the review rubric's item 21 asks reviewers to check that each Spec names its assumed facts. One finding came from that (`r1-sdp-assumed-facts-not-named-in-intent`), and round 3 adds `r3-sdp-intent-citations-without-constrained-by` with eight Specs.

### 2.6 Conventions the adopter invented that SDP already has a home for

This is the finding I did not expect. Four of the adopter's conventions duplicate something SDP has ruled on, and the adopter did not find the ruling.

| The adopter needed | It invented | SDP's ruled home | Where SDP says so |
|---|---|---|---|
| A deferral with a trigger | A `[deferred]` marker, a `deferred:` Design key, a narrative line and a stated `scoped`. The nine such Specs derive `defined` or `ready`, so the floor does not know they are deferred | A blocking open question that names the trigger. The floor then caps the Spec at `scoped` by itself | `specs/decisions/planning-truths-placement.sdp.md`: "Re-entry triggers are the deferred Spec's own blocking open questions plus `dependsOn` for a true precondition." |
| A ruling beyond the source that the owner must confirm | An `[extension]` marker, an E-number, an open question, a README register row, and a check that the register is closed both ways. 48 extensions | A `decision` Spec below `ready`, with `decidedBy` from the Specs it shapes. The plan's own section 3.2 has this row. The corpus used it three times | `specs/decisions/decision-readiness-posture.sdp.md`: "A decision Spec states `ready` when its complete record is registry-ratified." |
| "Probed" as a status of a fact | The string `evidence.status:probed` in `target`, and seven probes as bullets of one workflow Spec | A probe is an `example` that `verifies` its fact. Once a test anchor binds it the fact earns `has-verifier`, which is derived and never authored | `specs/validation/authored-honesty.sdp.md`, `CONTEXT.md` under delivery facts |
| Counts of Specs by kind and readiness | A census sentence in README and two checks that keep it true | `sdp census`. I ran it on a copy of the corpus and it prints the README's numbers | `specs/consumers/census-page.sdp.md` |

Two more belong on the same list. The session protocol defines delta review scope by hand as the changed Specs "plus each Spec those relate to", which is what recipe 4 computes. Its rule that "a carried verdict is a claim until this step repeats it" is the same law as the last paragraph of SDP's `sdp-sessions` skill.

Why were they missed? I can show three reasons and cannot weigh them.

- The plan's tool list names `validate`, `view`, `q` and `new` (plan, section 0). `census`, `mermaid` and `gherkin` appear in none of `PLAN.md`, `README.md`, `SESSIONS.md` or `STATE.md`.
- None of those files, nor `CLAUDE.md`, mentions SDP's three skills. The adopter is not a Node project. It has no `package.json` and calls the CLI by absolute path. The skills ship inside the npm package (`files` in SDP's `package.json`).
- The rulings sit in SDP's decision Specs, which describe SDP's own planning. The package does not ship `specs/`, so an installed adopter cannot read `spec:decisions.planning-truths-placement` even though the skills cite Specs by id.

The idioms are not free at this size. 48 extensions as decision Specs would add 48 files. But the open question that carries E-22 in `context-component` already holds a context, a choice, a rejected alternative and a request for the owner's ruling, in one line of 815 characters. It is a decision record written as a bullet.

### 2.7 Hand-kept indexes and the check script

`design/README.md` is 406 lines. It holds a 48-row extension register, a 67-row open-question table, a 43-row scenario table, a census sentence and the expected validate output. `design/tools/check.py` is 173 lines and exists mostly to keep those true.

| # | Lines | What `check.py` checks | Who could own it |
|---:|---|---|---|
| 1 | 38 to 50 | Validate reports no error | SDP, works today |
| 2 | 48 to 52 | Every warning is `conformance/verifies-linkage` | Goes away with P4 |
| 3 | 54 to 62 | Readiness divergence is empty. The script holds a private copy of recipe 7 | SDP, works today |
| 4 | 80 to 81 | No Spec states `ready` | Adopter policy. Stays |
| 5 | 96 to 99 | A blocking question sits only on a `scoped` Spec | The floor already refuses it at `defined` and `ready` |
| 6 | 82 to 106 | A law or fact cited in a typed bullet has a `constrainedBy` edge | Adopter, because the citations are tokens such as `F13`. P6 covers it if citations are ids |
| 7 | 107 to 108 | One warning per example | Goes away with P4 |
| 8 | 112 to 116 | README's expected validate line and warning count | Do not quote them |
| 9 | 117 to 125 | README's census sentence | `sdp census`, today |
| 10 | 126 to 130 | The extension register is closed both ways | A `q` body, today. Appendix B |
| 11 | 131 to 134 | README's open-question tally | A `q` body, today. Appendix B |
| 12 | 135 to 143 | One README row per Spec with questions | The same body |
| 13 | 144 to 146 | README links resolve | Adopter |
| 14 | 149 to 154 | Ledger statuses are in the allowed set | Adopter's review protocol |
| 15 | 156 to 167 | A digest over Specs, README, plan, sessions and ledger | Adopter. A digest of the graph alone is one `q` line |

Checks 8 to 12 guard copies of data the graph holds. They still cost findings. README staleness was reported in round 1 (1 finding), round 2 (3) and round 3 (`r3-fidelity-readme-register-rows-behind-their-questions`).

One convention is drifting where no check looks. The three marks of an extension are supposed to travel together. Round 3's fidelity lens counted: "903 bullets cite an E-number in their closing citation and 167 of them start with `[extension]`" (`r3-fidelity-extension-marker-applied-to-a-fifth-of-citations`).

### 2.8 The warning stream

`validate` prints 54 warnings, 20 KB of output, and all 54 are `conformance/verifies-linkage`, one per example. The corpus has no code, so no example can have a test anchor. The plan lists the choice as an open ruling: "`verifies` on examples before tests exist. Kept for fidelity to the acceptance contract, at the cost of one warning per example" (plan, section 11, item 9). The README explains the 54 to its reader, and `check.py` checks 2 and 7 exist to tell these warnings from a real one.

The warning comes from `checkVerifiesLinkage` in SDP `src/validate/validators.ts`, for any example that declares `verifies` with no resolving test anchor, at any readiness. SDP has ruled on the neighboring case: "No validator warns merely because `mode: executable` has no enabled verifier" (`specs/decisions/verification-posture-not-realization.sdp.md`). A `ready` Spec with no verifier already gets the `honesty/gaps` warning, and recipe 10 already reports declared against enabled verifiers as data.

### 2.9 Reading the design

The README calls the Design Review "the rendering of the corpus for a human reader". For this corpus the review's weak spot is the section that matters most.

- **Order is lost.** `renderDynamicRecord` in SDP `src/projections/design-review-markdown.ts` sorts keys, and `canonicalDynamicSection` in `src/extract/serialize.ts` sorts them in `graph.json`. The ten steps of `persistence-adapter` come out as `step1`, `step10`, `step2`, `step3`, `step3a`. The author's grouping of types, then functions, then steps, then limits becomes alphabetical. The in-memory graph keeps authored order, as a `q` over the same Spec shows, and the comment on the node type says content is held "in authored order" (`src/graph/schema.ts`).
- **The form is JSON.** `renderOpenBag` prints the entries as one fenced JSON object. Each signature becomes an escaped string value.

No Spec of SDP states that open-section keys are sorted. I could not find out why they are.

### 2.10 Examples

The example machinery did what it promises, with three small frictions.

- 12 of 54 examples write free-form steps, because the plan gave Layer 4 to 6 parents no example space.
- One vocabulary per parent with exactly one When step (`parseFence` applies the rule to both fence kinds) pushed parents with several behaviors into union slots and sentinel values. `"none"`, `"absent"` and `"nothing"` appear 18 times as slot literals. An example may leave out vocabulary steps, so the sentinels were the adopter's choice.
- The tier and the case number of each example live in a narrative line such as "Sc L1-2 · native tier · first of three injection points". The README's scenario table is kept by hand because the graph has no field for either.

Table syntax for sibling examples is allowed by the point-per-example decision and is built in neither carrier. The Markdown parser refuses any table. 9 scenario rows became 20 sibling files. No finding traces to that.

The five class X findings are about what an example's prose asserts against what the design can do, such as `r3-architecture-native-tier-cannot-move-time-or-interrupt`. No structural check reaches them.

### 2.11 Review and sessions

To run reviews with agents the adopter wrote `SESSIONS.md` (80 lines), `STATE.md`, a JSON ledger of 298 KB, five lenses, a severity scale, a consensus rule, a write-ahead rule and a recover unit. The write-ahead rule and the one-unit rule exist because a workflow of ten agents hit a usage limit mid-round and one fixer "had made 109 edits and reported none" (`SESSIONS.md`).

SDP has refused to hold any of this. The Design Review "stores no findings and writes no canonical source", and validators "never record or require review approval" (SDP `specs/consumers/design-review.sdp.md`). SDP's own repository keeps its review records outside the graph too, under `reviews/` and in orchestration state.

The parts of the adopter's protocol that touch the graph are narrow. Delta scope is a graph query and is wrong today for the reason in 2.2. Findings point at Specs by file path and line, and the lines move with every fix. The session opens by re-measuring, which `validate` and `q` already serve.

### 2.12 The agent surface and scale

The engine has no scale problem at 168 Specs. `graph.json` is 1.16 MB. The Design Review is 1.6 MB: one page per Spec, one per pack and an index.

The reader has one. "A full-scope review reads about 920 KB of Specs. That is one session" (`SESSIONS.md`). Five lenses per round is five such reads.

What an agent needed from `q` and did not get:

- **Entry-level answers.** `findByConcept` reports which section matched. It has no key, no bullet and no line, because Spec nodes carry no line numbers. Every finding in the ledger that cites `queries.sdp.md:57` got that from reading the file.
- **Token-level matching.** The search is a substring match. `findByConcept("D1")` returns 112 Specs where the token `D1` appears in 20. `"Law 1"` returns 49 against 11. The README's advice to find `D7` with recipe 6 works for `D7` and fails for `D1`.
- **A list of the open questions, and of what a Spec rests on.** Both are short bodies. No recipe ships for either.
- **A stable way to run a catalog recipe.** `check.py` carries its own copy of recipe 7 as a string.

All four are answerable by scripting the reader as it is. That is SDP's stated route: "A join freezes into the reader only when a second machine consumer needs it *and* hand-rolled attempts get it wrong" (SDP `docs/agent-surface/recipes.md`).

## 3. Proposals

Each proposal has the same parts. I hold them to the bar SDP's own decision Specs use. A proposal that adds carrier grammar must name the defect class it removes, and I say where it only narrows one.

### P1. Write the Markdown body grammar down as a Spec

**Problem.** The default carrier's per-section grammar is stated only in parser source, so an adopter has to find it by probing and then keeps its own copy.

**What SDP has today.** The parser in `src/extract/markdown-body.ts`, `markdown-body-content.ts`, `markdown-body-owner-behavior.ts` and `markdown-body-owner-sections.ts`. Five carrier Specs that cover the envelope, prose ownership, slots and parity with the TypeScript carrier. `specs/carrier/markdown-authoring.sdp.md` has one rule. The Gherkin carrier has a grammar Spec with thirteen refusal examples.

**Proposed change.** One Spec under `specs/carrier/` that refines `spec:carrier.markdown-authoring`. It states, per section, which bullet forms are accepted, and it lists the refused block constructs, the keyed-bullet rule, the one-line rule and the rule that one section owner appears once. Example children pin each refusal class and bind to the parser's existing tests. The `sdp-authoring` skill gets a short table that points at it. SDP has a name for this move. `specs/model/spec-sections.sdp.md` calls it comment promotion: source that states rules other things depend on promotes into a Spec.

**Alternatives.** Do nothing. Every adopter repeats the probing, and its copy drifts when the parser changes. The plan's section 6.2 is such a copy, correct as of 2026-09-30 and checked by nobody since. Or generate a reference page from the parser, which needs the parser to be driven by a table first and is a larger change.

**Cost to SDP.** No carrier, validator or graph change. One Spec, about ten examples, one skill edit.

**How this corpus changes.** The plan's section 6.2 shrinks to a pointer and the rules that are the project's own.

**Recorded decisions.** None reopened. It carries the carrier ruling (MD-18) and the prose-ownership law (MD-19) into the place SDP says law belongs. It also gives the HTML refusal a carrying Spec, which it has none of today.

### P2. Treat inline code as content, not as HTML

**Problem.** A TypeScript generic inside backticks is refused as raw HTML, with a message that misnames the cause.

**What SDP has today.** The guard in `isHtml` and in `narrative` tests the whole line against `<\/?[A-Za-z][^>]*>`. The probe in 2.4 shows the refusal and the message.

**Proposed change.** Remove backtick-delimited spans from the line before the HTML test, in both functions. HTML outside a code span stays refused.

**Alternatives.** Do nothing. Adopters who write types keep a private bracket convention. This one has 248 brackets in 29 Specs and a notation whose stated purpose, pasting into a source file, the convention defeats. Or change only the message so it names generics. That helps the author and keeps the cost.

**Cost to SDP.** A few lines in two functions, two parity probes, one example under P1's Spec. No graph change. One risk to check: a code span that holds real markup now passes as text, so the Design Review must escape it, which its Spec already requires for every rendered field.

**How this corpus changes.** 248 brackets become `<` and `>`. Rule 5 of the plan's 6.2 and the bracket rule of 6.3 go.

**Recorded decisions.** None found. This is the only proposal that removes an adopter workaround with no trade-off I can see.

### P3. Let the `ready` floor read every typed dependency

**Problem.** A Spec can clear the `ready` floor while a fact, constraint or decision it rests on is unsettled, because the target clause reads `dependsOn` and `refines` and nothing else.

**What SDP has today.** The clause `depends-on-and-refines-targets-are-defined` in `src/validate/readiness-floor.ts`, and its sentence in `specs/validation/readiness-floor.sdp.md`: "every `refines` and `dependsOn` target itself stands at least `defined`". `specs/model/relations.sdp.md` describes `constrainedBy` and `decidedBy` as typed dependencies.

**Proposed change.** The clause covers `constrainedBy` and `decidedBy` targets as well. Nothing else changes. An adopter then states an unsettled fact the way SDP already states anything unsettled: the fact Spec carries a blocking open question that names its probe and states `scoped`. Every Spec that is `constrainedBy` it can state `defined` and cannot state `ready`. Recipe 9 names the failing clause and the fact.

**Alternatives.** Do nothing. The adopter keeps a status string in `target`, a rubric item for reviewers and a script that forbids `ready`. The graph answers "what rests on an assumption" only through the adopter's string, and the derived-readiness column of the Design Review says `ready` for eleven Specs that rest on unproven facts. Or have adopters add a `dependsOn` beside each `constrainedBy`. That works today and flattens the distinction `relations.sdp.md` exists to keep. Or add an evidence-status field. I reject that. Readiness already is the position that says how settled a Spec is, and SDP refused a second status on decisions for that reason (the note on `DecisionSection` in `src/model/sections.ts`).

**Cost to SDP.** One predicate and one sentence of a rule Spec, with one example. I ran the wider clause against SDP's own corpus: no `ready` Spec has a `constrainedBy` or `decidedBy` target below `defined`, so nothing there changes. One open point for SDP's owner. Should a Spec shaped by a decision that is `defined` and not yet ratified be able to state `ready`? The clause as proposed says yes. This corpus cannot settle it, because every decision in it states `defined` by policy.

**How this corpus changes.** F14, F15 and F17 state `scoped` with a blocking question each. Their eleven dependents derive `defined`. The `evidence.status` strings can stay as a note or go. Rubric item 21 becomes a floor clause. With the idiom from 2.6, each probe becomes an example that verifies its fact, and "probed" becomes a derived fact.

**Recorded decisions.** It revises a clause of `spec:validation.readiness-floor`. That Spec says the clause thresholds are "one chosen representation", so I read this as an ordinary revision and not a reopening of the kind-conditional floor (MD-12). The clause is kind-blind.

### P4. Report an unbound example below `ready` as data, not as a warning

**Problem.** A design-first corpus gets one warning per example for a state that is honest at the rung it states.

**What SDP has today.** `checkVerifiesLinkage` warns for any example with a declared `verifies` and no resolving test anchor. The rule is in `specs/validation/verification-linkage.sdp.md`: a non-resolving trace "is named loudly". The gap signal already warns for a `ready` Spec with no verifier. Recipe 10 already lists declared against enabled verifiers.

**Proposed change.** The warning fires when the example states `ready`. Below that, the unbound state stays visible where it is today, in the reader's verifier bindings and in recipe 10. The other branch of the check, a non-example that declares `verifies`, is unchanged.

**Alternatives.** Do nothing. Each design-first adopter filters the output, explains the count in its README and checks the count in a script, and a real warning hides among 54. Or the adopter drops `verifies` until tests exist. The plan names that option and what it loses, the trace. Or print one summary line per validator. That shortens the output and keeps the claim that something is wrong.

**Cost to SDP.** One condition in one validator. The rule Spec gains a clause. The existing example `verification-linkage.unbound-example` pins the warning for a probe example whose readiness its vocabulary does not state, so the example space needs a readiness slot and one new point for the `defined` case.

**How this corpus changes.** Validate prints zero warnings. `check.py` loses checks 2 and 7. The README's paragraph about the 54 goes, and so does item 9 of the plan's section 11.

**Recorded decisions.** It changes a rule Spec, which SDP's placement ruling treats as ordinary revision. It follows the reasoning of MD-23, which refused a warning for an intended posture, and of MD-26, which removed a warning that was noise by definition for one kind.

### P5. Ship the adopter idioms, four recipes and the Specs the skills cite

**Problem.** An adopter that follows SDP's on-ramps cannot learn the ruled homes for a deferral, an assumption, a provisional ruling or a derived count, so it invents conventions and scripts for them.

**What SDP has today.** The rulings exist in `planning-truths-placement`, `decision-readiness-posture`, `authored-honesty` and `census-page`. The `sdp-authoring` skill says a blocking question keeps a Spec below `defined` and stops there. The catalog has nineteen recipes. The package ships the skills and the catalog and not `specs/`.

**Proposed change.** Three small things.

1. A section in `sdp-authoring` with the idioms of 2.6, one line each with the Spec that rules it, plus "counts come from `sdp census`, never from prose".
2. Four recipes: the open questions by Spec with their blocking flag, the prose mentions with no relation (appendix B), what a Spec rests on across all four dependency relations with each target's readiness, and a search that returns section, key and text with whole-token matching.
3. The Protocol's own `specs/` in the package, so a pointer such as `spec:carrier.gherkin-authoring` leads somewhere for an installed adopter.

**Alternatives.** Do nothing. This adopter paid 115 README rows kept by hand, five checks in a script, README-staleness findings in all three rounds and three marker conventions. The next adopter pays the same. Or add a verb that publishes a register. That grows the verb set where a redirected `q` already works.

**Cost to SDP.** No engine change. One skill section, four catalog entries with their tests, one line in `package.json`. The package grows by about 236 KB.

**How this corpus changes.** The census sentence, the open-question table and the extension register come from commands. `check.py` loses checks 8 to 12. Layer 4 to 6 Specs carry a blocking question that names their trigger, and the floor holds them at `scoped`.

**Recorded decisions.** None. Recipes are the catalog's stated way to grow.

### P6. Check ids written in prose, and give Design entries an address

**Problem.** A Spec can name another Spec, or one entry of it, in prose and nothing checks that the target exists, that a relation backs the mention, or who else refers to the same entry.

**What SDP has today.** Referential integrity covers edges and pack references (`specs/validation/referential-integrity.sdp.md`). The id grammar has an optional `#` sub-part, and nothing outside `src/ids.ts` uses it. Open-section keys are unique within a Spec and match the sub-part pattern, so `spec:context.persistence-adapter#step3a` is already a well-formed id. The probe in 2.4 shows a dangling id in prose passing validate.

**Proposed change.** In two steps, the first of which needs no engine change.

1. Now, as a recipe from P5: list ids in section text, outside `gwt` and `gwt-vocabulary` fences, that do not resolve or have no declared relation from the mentioning Spec. This runs today. On this corpus it finds 0 dangling and 78 without a relation.
2. Next, as a ruling and a validator. An id in section text or narrative is a mention. A mention that does not resolve is a conformance error. A mention with no relation from its Spec is a warning. `spec:<id>#<key>` names one keyed entry of an open section and resolves when the key exists. The reader gains nothing. Reverse lookup of an entry stays a recipe.

**Which defect class this removes.** Class E in full where the reference is written as an id: 2 findings in the ledger and 2 more in round 3. It narrows T1 and T3, 28 findings, by making "every Spec that repeats it" a query over addresses, and it makes delta review scope include Specs like the adapter. It does not detect two Specs that restate a shape in their own words. No reference checker can.

**Alternatives.** Do nothing. The convention "reused from, never redefined" stays prose, blast radius keeps missing dependents, and each fix round leaves the residue 2.1 describes. Or the adopter adds the 78 relations by hand and lints for them in its script. That fixes this corpus and no other. Or make mentions a new edge type. I reject that. An edge type costs the schema, the edge contract, the census, the Mermaid view and every recipe that filters edges, and the warning gets the same reach by asking for a relation that already exists.

**Cost to SDP.** Step 1 is a recipe. Step 2 is one validator, one clause in the stable-ids rule, examples, and no carrier grammar. Both corpora are clean under it today. Outside fences, SDP's own corpus has one id-like string that does not resolve, and it is the pattern `spec:decisions.*` in `specs/model/stable-ids.sdp.md`.

**How this corpus changes.** The 11 "never redefined" phrases and the 23 "pipeline's step N" phrases become addresses that validate checks. Findings in the ledger cite `spec:context.queries#fnList` and stop citing line numbers. 78 relations get declared or the mentions get dropped. If the foundation ids were shortened, the closing citations could be ids and `check.py` check 6 would go too. That renaming is the adopter's call.

**Recorded decisions.** It touches content-only sections (MD-10), whose gloss in `CONTEXT.md` says "never a ref inside a section". I think it applies that decision. MD-10's stated reason is that references inside sections "leave double-linkage drift legal". A mention with no relation is that drift, and it is legal and silent today. The warning makes the relation the one place linkage lives. If SDP's owner reads MD-10 as forbidding any checked id inside a section, step 2 needs a decision that supersedes it. The sub-part's first meaning is hard to reverse, because ids are the join key, and it surprises without context. It should be a decision Spec of its own.

### P7. Keep Design entries in authored order, and render them as a list

**Problem.** The Design Review shows the entries of an open section sorted by key and encoded as JSON, so a step sequence reads out of order and a signature reads as an escaped string.

**What SDP has today.** `renderDynamicRecord` and `canonicalDynamicSection` sort keys. `renderOpenBag` prints a JSON fence. `specs/consumers/design-review.sdp.md` has the rule that "fenced JSON preserves authored keys and values through JSON encoding". It does not mention order. The reader returns authored order.

**Proposed change.** First, stop sorting in the Design Review and in `graph.json`. Authored order is a function of the source, so determinism holds. Second, render each entry as a list item with its key in code and its value as Markdown text.

**Alternatives.** Do nothing. The owner of this corpus reads 762 entries in alphabetical order inside JSON strings, or reads the carrier files, which is what the reviewers did. Or the adopter pads its keys (`step01`). That fixes steps and leaves the grouping lost. Or leave `view` alone and add a recipe that prints one Spec's Design in order. That is cheap and gives agents the order and humans nothing.

**Cost to SDP.** Two removed sorts, a new golden tree for the checkout example, and perhaps a schema version bump for `graph.json`. The list rendering is a small change in one projection file.

**How this corpus changes.** No Spec changes. The Design Review becomes readable for the 50 Specs that carry the design.

**Recorded decisions.** The shipped projections are frozen (MD-32): "Re-specifying the shipped Design Review, census, Mermaid, or Gherkin projection is refused." The first step contradicts no sentence of the Design Review Spec. Whether a changed golden output counts as re-specifying is the owner's reading. The second step changes a stated rule and needs a superseding decision. I think the evidence justifies one, scoped to open sections. The projection was frozen when no corpus put its main content there. Why the keys are sorted I could not verify, so the first step needs the owner's eye before anyone removes a line.

### P8. Give contract content a typed section and derive a module from it

**Problem.** Signatures and types in a design are code. SDP makes an adopter write them as prose, where no compiler reads them, and the review finds the mismatches by eye.

**What SDP has today.** The named deferral in `kind-evidence` quoted in 2.3. The open Design bag. For examples, the pattern this proposal copies: `sdp build` derives step and space contracts under `generated/contracts/`, so that drift between a Spec and its test is a compile error.

**Proposed change.** Three stages, each useful alone.

1. P2, so code spans hold real TypeScript.
2. A keyed entry of an open section may own one fenced block with a language tag. SDP stores it as text and does not parse it. This removes one-line code.
3. Land the contract section as a closed shape, a list of named declarations with their code. `sdp build` derives one module per corpus from them. Compiling that module alone finds names used and never declared and names declared twice. When code exists, the implementation imports the derived types, and a Spec that disagrees with its code fails the build, as with step contracts.

**Which defect class this removes.** T1 and T2 are 37 findings and 17 majors, the largest class a tool could touch. I have to be exact about how much. Compiling the declarations alone would have caught 2 of the 37 (`r1-completeness-affected-refs-never-derived` and the undeclared types in `r2-sdp-worker-authority-three-shapes`), plus the nine undeclared names live today. The rest are disagreements between a declaration and a sentence, or between two signatures that never meet in one expression. Those end when signatures are compiled against the code that calls them. That is stage 3 with an implementation, and no earlier.

**Alternatives.** Do nothing in SDP. The adopter adds a name check to its script, about 30 lines, and keeps the brackets and the one-line code until P2. This is the right choice now, and I recommend it to the adopter today. Or put the declarations in real `.ts` files bound with `codeAnchor`. SDP offers this today and I think it is wrong for a design. `satisfies` confers `implemented`, the drift alarm then fires for every contract Spec that is not `ready`, and SDP's own ruling says anchors are never pointed at unfinished Specs to manufacture coverage (`specs/decisions/architectural-significance-rides-primitives.sdp.md`).

**Cost to SDP.** The most of any proposal here. Stage 2 adds one construct to the carrier and a rendering case. Stage 3 adds a section shape, a floor row for the contract kind, a generator and the tests for all three.

**How this corpus changes.** 189 `type` and `fn` entries and 35 validators become declarations with one owner each. The undeclared names fail the build. Rubric item 13 becomes a compile.

**Recorded decisions.** It carries out a deferral SDP recorded and pulls the contract section under the typing law (MD-11). Stage 2 adds grammar to the carrier the carrier ruling (MD-18) chose for its small owned grammar. The fence is opaque, so it is not the parser inside a parser that the carrier-universality ruling refuses for Gherkin. I would not start stage 2 or 3 on this adopter alone. The trigger I would set is this corpus's first experiment, when code first has to agree with these signatures, or a second adopter that writes signatures in Design.

## 4. Roadmap

| When | Proposal | Depends on | Acceptance test on this corpus |
|---|---|---|---|
| Now | P2 inline code is not HTML | nothing | After a replace, `grep -r '⟨' design/specs` finds nothing and validate is clean |
| Now | P1 body grammar Spec | P2, so the Spec states the final rule | The plan's section 6.2 is a pointer plus project rules |
| Now | P4 unbound examples below `ready` are data | nothing | `validate` prints 0 warnings. `check.py` loses checks 2 and 7 |
| Now | P3 floor reads typed dependencies | nothing | F14, F15 and F17 state `scoped`, and recipe 7 flags any of their eleven dependents that states `ready` |
| Now | P5 idioms, recipes, shipped Specs | P3 for the assumption idiom | README's census sentence, open-question table and extension register are generated. `check.py` loses checks 8 to 12 |
| Now | P6 step 1, the mention recipe | P5 | The recipe returns 0 dangling and a list the adopter drives to 0 without a relation |
| Next | P7 authored order, then list rendering | a ruling on MD-32 for the second half | The Design Review page for `persistence-adapter` shows `step1` to `step10` in order |
| Next | P6 step 2, mention validator and entry addresses | P6 step 1 run on both corpora, a decision Spec for the sub-part | A renamed Design key fails validate in every Spec that addresses it. Once the warned mentions have relations, `blastRadius` on `journal.sdp.md` includes `persistence-adapter` |
| Later | P8 stage 2, fenced code as an entry value | P2, P7 | No line under `design/specs` is longer than 400 characters because of code |
| Later | P8 stage 3, contract section and derived module | stage 2, P6 step 2, and the trigger named in P8 | `tsc` on the derived module reports the nine undeclared names. Rubric item 13 is a build step |

The table is ordered by time. Ranked by how much evidence stands behind each proposal against what it costs, the order is P3, P6, P2, P1, P5, then P4, P7 and P8.

- P3 comes first because it changes what `ready` can honestly mean, the evidence is a count, and the change is one predicate.
- P6 is second because it is the only general mechanism for the largest class of defects, and its first step costs a recipe.
- P2 and P1 are sure and small. P2 needs no ruling at all.
- P5 is guidance and recipes, and it removes the most hand work in this corpus.
- P4 is small and its evidence is one corpus without code.
- P7 and P8 need rulings on recorded decisions, and P8 needs more evidence than one adopter.

### Considered and rejected

| Idea | Why not |
|---|---|
| Relations to an external document (`doc:` targets) and a coverage check of the source | The corpus did not need them. It transcribed the doc into 56 Specs, and coverage of those is a graph query that works today. SDP keeps `doc:` as a named deferral (carried evidence, MD-16) and this evidence does not move it |
| Short citation aliases on the envelope, so `D7` resolves to a Spec | It reopens the closed envelope (`specs/carrier/envelope-contract.sdp.md`) for a convenience. P6 with shorter ids covers it. Worth a second look if SDP ever wants its own `MD-n` registry derived, since `docs/concept/DECISIONS.md` is the same kind of hand-kept table |
| An evidence-status field on facts | Readiness plus P3 says it with what exists. "Probed" as an authored value would be an authored delivery fact |
| A second level of blocking, for questions that block `ready` and not `defined` | 98 of the 129 questions are of that kind, so the need is real. Promotion answers it. The unsettled piece becomes its own Spec with a blocking question, and P3 carries the effect along the edge |
| Findings, lenses, a ledger or a consensus rule in the Protocol | Refused by the Design Review Spec and by binding-not-liveness (MD-7). Section 5 |
| `sdp q --recipe 7` | A named query is a verb. The front-door decision (MD-22) exists to avoid that. The cost of refusing is a copied body in `check.py` |
| Labels on Specs for layer, tier, provenance or detail level | SDP refused open tag vocabularies for anchors (MD-30) and for architecture (MD-34), for a reason that applies here. Packs can carry layer and tier: a Spec may belong to many |
| A notation for quantities and derived bounds, so validate could do the arithmetic of class N | Arithmetic is content correctness, which SDP's checks do not police. An example space with numeric slots and an oracle already expresses "at this budget the call admits 32 streams", and a test can run it |
| A grammar for constraint targets | The gap is real. "Machine-readable" is checked as non-empty. But no finding traces to it, and SDP has two targets in two notations and this corpus 25 in two more. Rule it when a consumer first has to parse a target |
| Table syntax for sibling examples | Allowed by point-per-example (MD-17) and unbuilt. It would fold 20 files into 9. No defect traces to the duplication |
| Continuation lines for long bullets | No finding traces to line length. P8 stage 2 removes the worst lines |
| A check that every index has a query | It needs Convex index semantics. The adopter's paired `index` and `indexUse` keys held: no finding in the ledger and one in round 3 |
| A typed step-sequence section | Workflow already has ordered flows. What is missing is order in the view (P7) and an address (P6) |

## 5. What should stay out of SDP

These are things this project needed and built. I think each belongs to the adopter or to a separate tool, and SDP would get worse by absorbing them.

- **The review protocol.** Lenses, severities, the findings ledger, the consensus rule, the write-ahead rule, `STATE.md` and the recover unit. They record that reviews happened and what they found, which SDP has said the graph never holds. SDP's part is small: stable addresses for findings to cite (P6) and an accurate delta scope (recipe 4 with P6). If two projects end up with the same ledger shape, that is a case for a separate tool that reads the graph.
- **The policy that only the owner states `ready`.** SDP makes `ready` a human statement and does not say which human. The check stays in `check.py`.
- **The numbering key and the citation tokens.** `D7`, `Law 4`, `F13`, `Sc L1-3` and `E-23` are this project's names for parts of its source. About 6,800 of them appear in the Specs. Mapping them to ids is a lint the adopter owns.
- **The bullet-level extension marker.** Whether a sentence says more than its source is the fidelity lens's judgment. SDP can hold the ruling as a decision Spec. It cannot decide which bullets need one.
- **Convex correctness.** The seven class K findings and the whole `convex` lens need the Convex docs and, in round 3, the backend's source.
- **Architecture judgment.** The 32 class J findings are the review doing its job. A design can pass every check in this report and still write one projection to every generation.
- **The arithmetic of limits.** 18 of the 21 class N findings need arithmetic against a ceiling or a judgment about whether a bound is derived and enforced. A script or an executable example owns that. P6 only makes sure each limit has one owner.
- **The README as a narrative.** Reading order, the layer summaries and the integration notes are prose for a human and should stay hand-written. Only the tables and counts in it should be derived.
- **Session budgeting.** One unit per session and the stop rule exist because of an account usage limit. That is about the agent runner.

## Appendix A. The 136 findings by class

Ids as they stand in `design/reviews/consensus-ledger.json` at `f44cad4`.

**T1 (12).** r1-fidelity-entity-exists-owner-conflict, r1-fidelity-vocabulary-namespace-omits-service, r1-sdp-entityexists-no-producer, r1-architecture-entity-exists-has-no-owner, r1-completeness-entity-exists-has-three-owners, r1-completeness-affected-refs-never-derived, r2-fidelity-derived-command-namespace-disagrees, r2-sdp-worker-authority-three-shapes, r2-sdp-input-bound-two-names-two-checkpoints, r2-sdp-state-schema-version-duplicated, r2-completeness-input-bound-two-names-two-places, r2-completeness-worker-provenance-shape-disagrees.

**T2 (25).** r1-fidelity-replay-result-null-vs-output-validator, r1-sdp-replayed-result-null-vs-closed-returns, r1-sdp-captured-facts-have-no-path, r1-sdp-versioned-result-vs-query-signatures, r1-sdp-executor-and-operation-arg-naming, r1-architecture-replay-result-null-vs-returns-validator, r1-architecture-unsupported-contract-version-no-source, r1-architecture-operation-spans-one-stream-type, r1-completeness-facts-never-reach-decider, r1-completeness-replay-result-null-fails-returns-validator, r1-completeness-write-baseline-has-no-state-input, r1-completeness-projection-input-dto-not-one-type, r1-completeness-generic-queries-contract-uses-example-validators, r1-completeness-dispatcher-needs-undeclared-registered-body, r1-completeness-correlation-id-and-command-type-never-reach-executor, r2-fidelity-derived-command-causation-has-no-path, r2-fidelity-static-reactions-declared-nowhere, r2-convex-convex-parent-pass-through-missing-tenant-arg, r2-sdp-new-obligation-omits-retry-owner, r2-sdp-declaration-helpers-omit-correlation-id, r2-sdp-business-failure-policy-has-no-declaration-slot, r2-completeness-declaration-helper-arg-shapes, r2-completeness-kernel-value-import, r3-architecture-events-evidence-needs-ids-the-command-does-not-return, r3-architecture-authority-recheck-names-no-permission.

**T3 (16).** r1-sdp-read-model-write-owner-and-signature, r1-sdp-gate-closed-before-generation-exists, r1-sdp-stale-version-check-mechanism-disagrees, r1-sdp-restore-check-batches-vs-writer-door, r1-sdp-payload-byte-bound-not-enforced-anywhere, r1-sdp-operator-retry-from-pending-not-in-lifecycle, r1-architecture-restore-batches-vs-maintenance-door, r1-architecture-sweeper-rearm-dispatch-by-kind, r1-completeness-pipeline-omits-gate-audit-diagnostic-and-splits-read-model-writes, r1-completeness-expected-version-check-location-differs, r2-sdp-operator-reconcile-dispatch-fenced-out, r2-sdp-assert-writable-allow-generation-leftover, r2-architecture-operator-reconcile-has-no-claim-path, r2-architecture-sweeper-burns-external-rearms-while-dispatch-off, r2-architecture-baseline-driver-bypasses-gate, r3-architecture-sweeper-runs-under-the-restore-door.

**N (21).** r1-convex-byte-budgets-not-reconciled, r1-convex-fold-budget-headroom, r1-convex-receipt-row-size-inconsistent, r1-convex-sweeper-nested-calls-timeout, r1-sdp-obligation-index-count-claims, r1-architecture-sweeper-nested-calls-under-timeout, r1-architecture-rebuild-read-bound-unenforced, r1-completeness-byte-ceilings-exceeded-at-stated-budgets, r1-completeness-receipt-row-size-inconsistent, r2-convex-convex-write-baseline-batch-bytes, r2-convex-convex-restore-stream-check-bytes, r2-convex-convex-rebuild-backfill-read-arithmetic, r2-sdp-budget-bytes-vs-parts-limit, r2-sdp-write-baseline-ignores-byte-and-payload-bounds, r2-sdp-restore-check-batch-arithmetic, r2-architecture-stock-stream-budget-unpinned-for-max-lines, r2-completeness-e2-derived-budget-contradiction, r2-completeness-baseline-event-payload-vs-16kib-bound, r2-completeness-write-baseline-batch-not-byte-derived, r3-architecture-write-bound-refuses-what-stream-bound-admits, r3-architecture-history-view-live-cost. The three "one bound, two values" findings are the two receipt-row-size ones and the index-count one.

**X (5).** r1-architecture-native-tier-identity-source, r2-architecture-double-submit-answer-depends-on-call-order, r2-completeness-l2-5-example-batch-size-capped, r3-architecture-native-tier-cannot-move-time-or-interrupt, r3-architecture-example-domain-cannot-create-stock.

**C (10).** r1-fidelity-do-nothing-per-reaction-unmarked, r1-fidelity-layer3-detail-precedes-experiment, r1-fidelity-unmarked-small-rulings, r1-fidelity-migrations-default-batch-unsourced, r1-sdp-migrations-batch-default-claimed-as-fact, r1-sdp-restore-asserts-component-data-restored, r2-fidelity-attention-reasons-beyond-d13-unmarked, r2-fidelity-do-nothing-check-per-reaction-residue, r2-fidelity-generations-table-law11-deviation-unregistered, r2-fidelity-build-tier-not-in-acceptance-contract.

**E (2).** r1-sdp-kernel-imports-layer-1-actor-type, r2-sdp-rubric-16-gaps-and-readme-claim.

**R (1).** r1-sdp-assumed-facts-not-named-in-intent.

**I (4).** r1-completeness-readme-reading-order-child-count, r2-fidelity-readme-e25-row-stale-internal-mutation, r2-sdp-readme-stale-rows-and-counts, r2-completeness-readme-stale-claims.

**P (1).** r2-sdp-layer4-6-rules-missing-deferred-design-bullet.

**K (7).** r1-convex-component-paginate-unsupported, r1-convex-component-internal-mutation-unreachable, r1-convex-scheduled-function-state-shape, r1-sdp-writebaseline-internal-mutation-unreachable-from-parent, r1-architecture-grants-take-cannot-detect-overflow, r1-completeness-grants-take-500-cannot-see-501st, r2-convex-convex-paginator-end-cursor-defeats-page-cap.

**J (32).** r1-fidelity-two-exports-cost-unrecorded, r1-fidelity-e44-reject-vs-d4-tension, r1-sdp-write-pause-consumes-reaction-attempts-and-restore-switches-unsequenced, r1-architecture-write-pause-burns-obligation-attempts, r1-architecture-deleted-row-deletion-version, r1-architecture-admission-consumption-rolled-back-on-rejection, r1-architecture-occ-retry-exhaustion-unclassified, r1-architecture-backfill-range-read-livelock, r1-architecture-retired-generation-written-for-rollback-window, r1-architecture-closing-state-redundant-under-occ, r1-architecture-settle-call-not-retried, r2-architecture-baseline-migration-live-command-window, r2-architecture-history-and-cross-context-projection-has-no-input, r2-architecture-write-pause-scope-misses-source-writers, r2-architecture-tenant-scoped-generation-switch-blanks-tenants, r2-architecture-restore-leaves-closed-gate-and-orphan-generations, r2-architecture-baseline-event-bumps-stream-version, r2-completeness-aggregate-row-shape-unpinned, and fourteen of round 3's architecture findings: one-projection-writes-every-generation, history-fold-order-and-deletion, history-backfill-cursor-and-verify, history-generation-rollback-unpaused, cross-context-current-state-row-has-no-write-form, reads-of-streams-awaiting-baseline, restore-and-baseline-migration-disagree, tenant-list-undefined, lease-outlives-running, paused-rebuild-one-stream-per-batch, sweeper-scan-blocked-by-backlog, derived-command-nested-where-a-helper-suffices, audit-do-nothing-option-unrecorded, rollback-keeps-rows-of-deleted-subjects.

Round 3, `sdp` lens, from `design/reviews/r3-sdp.jsonl` at commit `a5afbde`: 38 findings, 7 major. By the same classes: T1 10, T2 18, T3 6, N 1, E 2, P 1. I skimmed the 57 round 3 findings of the `convex`, `fidelity` and `completeness` lenses and did not classify them.

## Appendix B. Query bodies used

Run each as `node $SDP q '<body>' --root design --json`.

The open-question register. On this corpus it returns 67 Specs, 129 questions and 0 blocking, the numbers `check.py` checks against README.

```js
const rows = g.specs().flatMap((s) =>
  (g.specContext(s.id).sections?.intent?.openQuestions ?? []).map((q) => ({
    id: s.id, blocking: q.blocking, question: q.question,
  })));
return { specs: new Set(rows.map((r) => r.id)).size, questions: rows.length,
  blocking: rows.filter((r) => r.blocking).length, rows };
```

The extension register. It returns 48 numbers cited and 48 owned, with the owning Specs of each.

```js
const owners = {}, cited = {};
for (const s of g.specs()) {
  const c = g.specContext(s.id);
  const text = JSON.stringify(c.sections ?? {}) + (s.narrative ?? "");
  for (const m of text.matchAll(/\bE-(\d+)\b/g)) (cited[m[1]] ??= new Set()).add(s.id);
  for (const q of c.sections?.intent?.openQuestions ?? []) {
    const m = /^Extensions? E-(\d+)/.exec(q.question);
    if (m) (owners[m[1]] ??= []).push(s.id);
  }
}
return { cited: Object.keys(cited).length, owned: Object.keys(owners).length,
  citedNotOwned: Object.keys(cited).filter((n) => !owners[n]), owners };
```

Prose mentions against relations. It returns 112 mentions, 0 dangling, 78 with no relation in 42 Specs.

```js
const ids = new Set(g.specs().map((s) => s.id));
const dangling = [], noEdge = [];
let mentions = 0;
for (const s of g.specs()) {
  const c = g.specContext(s.id);
  const sections = structuredClone(c.sections ?? {});
  if (sections.behavior) { delete sections.behavior.examples; delete sections.behavior.exampleSpace; }
  const text = JSON.stringify(sections) + (s.narrative ?? "");
  const related = new Set(c.relationsOut.map((r) => r.otherId));
  const seen = new Set();
  for (const [full] of text.matchAll(/spec:[A-Za-z0-9][A-Za-z0-9.-]*[A-Za-z0-9](#[A-Za-z0-9-]+)?/g)) {
    const target = full.split("#")[0];
    if (target === s.id || seen.has(full)) continue;
    seen.add(full); mentions += 1;
    if (!ids.has(target)) dangling.push([s.id, full]);
    else if (!related.has(target)) noEdge.push([s.id, target]);
  }
}
return { mentions, dangling, noEdge };
```

Specs that rest on an assumed fact. It returns 11 Specs, every one stated `defined` and derived `ready`.

```js
const assumed = g.specs()
  .filter((s) => (g.specContext(s.id).sections?.constraints ?? [])
    .some((e) => e.target === "evidence.status:assumed"))
  .map((s) => s.id);
const dependents = new Set(assumed.flatMap((id) => g.specContext(id).relationsIn
  .filter((r) => r.type === "constrainedBy").map((r) => r.otherId)));
return [...dependents].map((id) => {
  const s = g.specs().find((x) => x.id === id);
  return { id, stated: s.statedReadiness, derived: s.derivedReadiness };
});
```

## Appendix C. What I could not verify

- Why open-section keys are sorted in `graph.json` and in the Design Review. No SDP Spec states it. P7's first step rests on my reading that authored order is as deterministic as sorted order.
- Whether the authoring and review agents loaded SDP's skills or ran `census`. I can show that no adopter file mentions them. I cannot show what a session did.
- The classification in 2.1 is one reader's, with one class per finding. A second reader would move some findings between T2, T3 and J. The totals for T1 to T3 together would move less than the split between them.
- The nine undeclared type names come from a regular expression over inline code. I checked each by search. A declaration written in a form I did not think of would be missed.
- The cost lines of the proposals come from reading SDP's source. I ran no SDP test and changed no SDP file.
- I tested the Markdown carrier only. I did not check whether the TypeScript or Gherkin carriers share the HTML guard or the key sorting.
- Round 3's four lens files were written while I worked and were committed at `a5afbde` just before I finished. The class counts in 2.1 use the 136 findings at `f44cad4`. Of round 3's other 95 findings I classified the 38 of the `sdp` lens and no more, so the shares in 2.1 are not the shares of the ledger as it stands now.
