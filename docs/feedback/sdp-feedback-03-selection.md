I'm done verifying. Writing the refined selection now, with what each check found.

**Two facts about the checkouts first.** The local SDP checkout at `~/dev-libar/software-delivery-protocol` is on `main` at the merge of pull request 26 and has not fetched the merge of 27, so I verified every SDP claim against the platform's pinned tarball under `node_modules` instead. In the platform, `docs/sdp-feedback.md` is deleted in the working tree and its content now sits in `docs/feedback/` as three files, the third being my earlier answer. Nothing below depends on that move.

**What I had wrong or unclear in the first answer**

- I wrote that the declaration ruling "leaves" formatting to the platform. The ruling says only that the Protocol parses no language inside the span. It is silent on rendering. Formatting is platform work because SDP is language-independent, not because a ruling assigns it.
- I presented the platform's own reading of Pack order and the SDP fix as if they were alternatives. They are one sequence: the platform reads the `.pack.sdp.md` list today, and the SDP fix retires that workaround.
- Step 1 looked like a small Spec Studio while I said Studio should wait. The difference is that step 1 emits static Markdown from existing data and keeps the Design Review untouched. It is the probe that gives plan 35 the named reader it asks for before Studio resumes.

## Round 1, platform, in order

1. **One generated page per capability Pack.** A script reads the member list from the Pack file in authored order, because both the reader and the serialized graph sort it: `packContext` sorts members by code units, and `generated/graph.json` already lists the history view's `belongsTo` edges alphabetically with the generation registry first. Per member it prints the stated rung, the floor, the clause blocking the next rung, the implementation and verifier bindings, and the pair's state from the three describe blocks of the pinned type test. Below the members: dependencies outside the Pack, and open questions joined to register rows. The page may carry the commit and the engine pin, which the Design Review may not, since its Spec rules that the page set carries no timestamp, commit or run identity.
2. **Two owner rulings the page depends on.** Both already sit in the STATE.md owner queue. First, what `ready` states. I recommend the Protocol's reading, approved to build, stated on the history projection after the two remaining passes. It makes recipe 1 answer the backlog instead of the local `defined` query in lead 10, and it changes what roadmap unit 4e, `ready` by family, means. Second, the aggregate form's reach into three built Specs. Narrow those pins to the forms the code admits, or the page will show three built members whose floor waits on a deferred Spec for the whole history view's life.
3. **Close the two binding gaps.** STATE.md records that rebuild and write pause show no implementation binding although code realizes both. Anchor them, and add a small mapping from each anchor that lives in a test to the implementation file it stands for, since the read-model anchors sit in a pure test because `src/` cannot import the Protocol.
4. **Stop citing questions by position.** The register holds 137 references of the form `spec:<id>#<n>`. That form now collides with the entry-address grammar, and one is already broken: OD-006 cites a question that no longer exists, which is why `test_decisions.py` fails. Make the OD number the link, store the question's opening text beside it, and let `check.py` verify text rather than index.
5. **Run the domain and operator passes against the page.** The roadmap already orders them before 5d. Add one line to the task: read the page before the recipes, and report what it could not answer. That report is the acceptance test for step 1 and the evidence for round 2.

## Round 2, SDP, as four pull requests

| Order | Change                                                                                                    | What I verified                                                                                                                                                                                                                                                                                                                                 |
| ----- | --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | Ratify `spec:decisions.authored-entry-order`                                                              | Its blocking question asks whether to reopen the freeze now or after `open-section-order` has landed and the ordered JSON has been read. Both conditions are met: order landed at schema 0.6.0, and the 2026-10-04 feedback section is the read. The record needs `supersedes` on the freeze and the three-part ADR test, as its own text says. |
| 2     | Pack authored order through the graph                                                                     | The loss is in serialization as well as the reader, so a reader-only fix would leave `graph.json` consumers different. The authoring skill already tells authors to keep membership order.                                                                                                                                                      |
| 3     | Two shipped recipes: batch address resolution, and `dependsOn` strongly connected sets with one path each | Neither exists. Recipe 21 has no cycle text, and the catalog ends at 24. Recipes add no query verb, so plan 35's exclusions do not apply.                                                                                                                                                                                                       |
| 4     | Optional question keys with a ruled address form                                                          | The platform's 137 positional references are the use case. The grammar question, what `#` means after a Spec id, needs a model ruling.                                                                                                                                                                                                          |

**Not now.** A `designed` rung, the `ts` fenced block, declaration formatting inside SDP, and Spec Studio. The first two change the model before step 5 shows what a reader needs. Studio waits on the ruling plan 35 names, and step 1 is what produces that evidence.

**Order.** Step 1 and SDP PR 1 start together. Steps 2 to 4 are each a day and gate step 5. SDP PRs 2 to 4 follow step 5's report.


---


Go. The updated selection is the right approach. It's narrow. It uses work you already have to do next, the domain and operator passes before 5d, as the acceptance test. And it starts the one SDP change that helps every page, readable Design entries, with a single ruling. Treat the long Astra-style list (02) as the backlog behind it, not as the plan.

## Why this one over 02

02 is good analysis, and its 40 items are mostly correct. Its sequence, though, builds a browser in PR 4 and diff-based review in PR 5 before anyone has learned what a reader needs. 03 learns that first from the two passes, then lets SDP PRs 2 to 4 follow the report. That's cheaper, and it gives plan 35 the evidence it asks for before Spec Studio is reconsidered. The revision also fixed most of what I raised. The order holds now, `ready` and the aggregate's reach are rulings rather than steps, and Pack order is clearly a workaround that SDP PR 2 retires.

## Conditions for the go

1. **Split before anchoring `rebuild`.** This is still my one real disagreement. Step 3 anchors it as it stands, which tells the page and the drift alarm that the history path is built. That's the mixed-maturity problem this PR just fixed for the projection contract. Either move the history path out first, or have the page say which path the anchor covers. 02 kept this caveat (item 22), and 03 lost it. `write-pause` can be anchored now.
2. **Two data sources in step 1 don't exist yet.**
   - **Pinned state.** Reading it from the describe blocks of `pinned.test-d.ts` means parsing test names. Move the three lists into a small data module that both the test and the page import.
   - **The next-rung clause.** Recipe 9 doesn't give "the clause blocking the next rung". For `command-declaration` it returns floor `defined`, next rung `ready` and `firstUnmetClause: null`, because it only reports failures of the stated rung. The page needs its own floor evaluation for the next rung, and recipe 9's behavior is worth a line in round 2.
3. **Say where the page lives.** `sdp validate` wipes `generated/`, and git ignores it. Put the page somewhere else, or regenerate it after validate. Also decide between committing it with a staleness check and publishing it as a CI artifact only.
4. **Make step 5's acceptance concrete.** Use 02's task list (item 40). A reader should be able to:
   - find the history contract;
   - locate OD-157;
   - explain the aggregate dependency;
   - find one declaration's type comparison;
   - say whether a paused-rebuild example has native-backend evidence.

   "Report what it could not answer" is too open to compare across the two passes.

## One cheap addition

`generated/pinned/history-view.ts` already holds every pinned declaration of the Pack, each one under its entry address. They're one line each. If `pinned.mjs` ran Prettier on the file as it writes it, the Pack would have a readable contract listing on day one. The page could link to it by address, and nothing would wait on SDP PR 1. Formatting doesn't change any type the test compares.

## Two facts to correct in 03

- **The register's references.** I count 151 references of the form `spec:<id>#<n>`, not 137. Six already point past the last question of their Spec, not only OD-006: OD-006, OD-007, OD-064 twice, OD-074 and OD-123.
- **SDP PR 1.** "Ratify" is your statement of `ready` on the decision record, with `supersedes` on the freeze. The rendering change follows it, so it's two acts, the ruling and then the build.

Its "not now" list matches mine: no `designed` rung, no `ts` fence, no declaration formatting inside SDP, no Studio yet.