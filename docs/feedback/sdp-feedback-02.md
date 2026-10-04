**I would make the human reading experience the next SDP milestone.** The platform now has enough design content to support useful review, but the reader still has to reconstruct the design from several files and tools. The next work should let a person open one capability and understand its design, unresolved choices, relationship to code, and available proof.

I read the updated [feedback](/Users/darkomijic/dev-libar/libar-platform/docs/sdp-feedback.md:7), [platform PR #12](https://github.com/libar-dev/libar-platform/pull/12), and [SDP PR #27](https://github.com/libar-dev/software-delivery-protocol/pull/27). I also queried the platform at `d39c89e` using its installed SDP pin, `5e29c03`, and rendered the existing pages in memory.

The current graph confirms 239 Specs, six Packs, 977 Design entries across 59 Specs, and 401 declaration entries across 39 Specs. All 15 members of `pack:history-view` state `defined`. That last fact explains why a maturity table alone cannot present this work well.

Three implementation details affect the recommendations:

- Pack membership retains authored order in the freshly derived edges, but `packContext` sorts members by ID, and graph serialization sorts the edges. Preserving reading order needs to survive the whole path.
- `byFile("src/read-model/rebuild.ts")` returns no Specs. A file browser would expose the existing binding gap unless that is addressed.
- `sdp validate` calls the build routine, which removes generated projection directories. A viewer needs a refresh path that does not remove the pages being read. These behaviors are visible in the [installed engine](/Users/darkomijic/dev-libar/libar-platform/node_modules/@libar-dev/software-delivery-protocol/dist/cli/sdp.js:7756).

Here are the changes I would consider, starting with the most immediately useful.

The first group makes individual Specs readable.

1. **Finish the proposed rendering of Design entries.** Render each keyed entry as a readable item in authored order. Show the key, its value, and a link to the source. Keep JSON only for structured values that need it. This has a carrying decision already, [authored-entry-order](/Users/darkomijic/dev-libar/libar-platform/node_modules/@libar-dev/software-delivery-protocol/specs/decisions/authored-entry-order.sdp.md). It is the smallest change that improves all 977 entries at once.

2. **Format declarations for reading in the generated view.** The source can retain the one-line declaration shape while the page displays a formatted code block, followed by the explanatory prose. For example, the existing declaration could appear as:

   ```ts
   interface HistoryProjection<Row> {
     name: string;
     version: number;
     table: string;
     rowBudgetBytes?: number;

     keyOf(
       tenantId: string,
       event: EventEnvelope
     ): string | null;

     project(
       tenantId: string,
       prior: Row | null,
       events: EventEnvelope[]
     ): Row;
   }
   ```

   This would be a proposed presentation change. It would not require changing the authored carrier to accept multiline declarations. The platform can supply the TypeScript formatter because SDP deliberately treats declaration contents as language-independent text. Preserve the original text for copying, and fall back to it when formatting fails.

3. **Give every addressable entry a working page link.** A citation such as `spec:application.history-projection#design.typeHistoryProjection` should open the corresponding entry, with a “Copy address” action. Generate the link from the existing address grammar. Entries that the grammar cannot address should remain visibly unaddressable rather than receiving an invented canonical identity.

4. **Give a Spec a short table of contents.** A person should be able to jump to intent, questions, contract, declarations, examples, and bindings. A long Spec such as rebuild especially needs this. Entry keys can form a second level under Design, preserving authored order.

5. **Separate declaration text from its behavioral explanation.** Many Design entries combine a signature with a long description of ordering, errors, bounds, and special cases. The page can present the opening code span as code and the remainder as prose without changing ownership or meaning. This would make `fnApplyHistoryProjection` substantially easier to review.

6. **Make the page lead with what the reader needs to decide.** My suggested anatomy is: title and intent, stated readiness and structural floor, open questions, contract and design, examples and evidence, then the full relation and binding inventory. Keep all the content, but put exhaustive metadata after the material a reviewer needs first.

7. **Show reference previews.** Hovering or focusing a Spec reference should show its title, intent, readiness, and relationship to the current Spec. An entry reference should preview that entry. This would reduce the constant navigation between the history projection, envelope, row conventions, and rebuild without duplicating their text in authored Specs.

SDP #27 explicitly leaves readable Design rendering as a follow-up requiring a narrow reopening of the projection freeze. It also retains the one-line declaration ruling. Those are useful boundaries for the first implementation. [SDP PR #27](https://github.com/libar-dev/software-delivery-protocol/pull/27)

The next group gives a reader a way into the corpus.

8. **Make Packs the main entrance to active design work.** The home page should start with capability Packs and a brief description of what each lets the reader understand. The complete Spec table remains available as an inventory. The existing package Packs can continue serving broad orientation; smaller capability Packs serve decisions and implementation preparation.

9. **Preserve Pack order through extraction, serialization, the reader, and rendering.** Add an explicit representation of authored order, either on the Pack or its membership data, and validate that it agrees with membership. The acceptance case should serialize and reload the graph before rendering. A fix that only reads the in-memory edge order would leave consumers of `graph.json` with different behavior.

10. **Give a Pack an authored reading guide.** The [history-view Pack](/Users/darkomijic/dev-libar/libar-platform/design/specs/history-view.pack.sdp.md) already explains why each group belongs. Present that guide as short reading stages beside the member list. A future Pack extension could support named groups containing references, but those groups should organize reading only. They should not restate contracts or store implementation status.

11. **Distinguish the design being considered from its supporting context.** A capability page should identify the focal Spec, shared contracts, examples, supporting facts, and shaping decisions. Start with presentation configuration or explicit reading groups. Derive “changed in this PR” from the selected Git comparison. Avoid permanently recording “new” or “already built” in a Pack, since those descriptions change.

12. **Show dependencies outside the Pack.** `aggregate-projection` is an excellent example. It is outside `pack:history-view`, yet its `scoped` readiness affects three members’ ability to state `ready`. The page should show that dependency at the boundary, explain why it matters, and offer to expand it. Automatically adding every transitive dependency to Pack membership would make the Pack unwieldy.

13. **Offer a refinement outline as well as Pack navigation.** Packs answer “what should I read together?” The `refines` graph answers “where does this promise belong?” Both are useful. Display the authored refinement hierarchy, with cross-links for other relations. Do not turn folder names into an additional authoritative hierarchy.

14. **Give humans the same search entrances agents have.** One search box should accept a concept, title, Spec ID, entry key, declaration name, or file path. Results should say why they matched: title, Design entry, declaration, or source binding. Existing `findByConcept`, `byFile`, and recipes 23–24 provide most of the underlying data. Search for `HistoryProjection` should land on the declaration itself.

15. **Split Specs when they need independent decisions, then reunite them in a Pack.** Continue the projection-contract split where it helps, but avoid splitting every type into its own Spec. A useful boundary is independent readiness, unresolved questions, behavioral ownership, or review scope. Shared content keeps one home. The Pack restores the readable capability narrative across those boundaries.

A proposed history-view page could present its reading guide like this. These are suggested presentation groups, not new SDP states:

| Reading purpose | Material | What the page should explain |
|---|---|---|
| Understand the proposed form | History projection | Shape, fold rules, bounds, and remaining questions |
| Understand shared conventions | Projection contract and read models | What the history form reuses |
| Understand operation | Rebuild, write pause, generation registry | How interruption, resume, abort, and switching work |
| Understand integration | Command declaration and pipeline | Which existing promises extend to the history form |
| Inspect proof obligations | Paused-rebuild examples | Required tier and whether a verifier is bound |
| Inspect assumptions | Event envelope, journal, queries, D9 | The contracts and decision this design rests on |
| Inspect an external dependency | Aggregate projection | Why it affects the readiness floor of three members |

This is the shape missing from the current alphabetic table.

The next group makes status and evidence useful without overstating them.

16. **Keep readiness, design detail, bindings, and test results separate.** A page should be able to say:

   - Stated readiness: `defined`.
   - Structural floor reached: `ready`.
   - Declaration present: yes.
   - Implementation binding: none recorded.
   - Verifier binding: none recorded.
   - Selected test result: unavailable.

   These facts answer different questions. A single “designed,” “implemented,” or percentage-complete badge would hide distinctions the platform needs.

17. **Explain what prevents the next readiness rung.** Current `floorFailures` describes whether the stated rung is honest. It can be empty while a higher rung remains unavailable. I checked the three aggregate-dependent Specs: evaluating their prospective `ready` statement produces the typed-dependency failure. A human view should explain the target and clause, for example: “Cannot state ready because aggregate projection states scoped.” This can begin as a recipe using the existing floor evaluator, without editing the Spec.

18. **Put the pinned type-test inventory beside the declaration.** The current [type-test file](/Users/darkomijic/dev-libar/libar-platform/tests/types/pinned.test-d.ts:42) declares 53 matching pairs, 14 expected differences, and nine pairs it does not compare. A platform adapter can expose each pair’s address, comparison mode, code symbol, and test location. A declaration page can then show “expected to match” or “expected to differ,” with the actual execution result loaded separately.

19. **Expose what a type comparison leaves out.** “Compared after removing the context parameter” matters. So do placeholder declarations, imported fallback types, and declarations the emitter skips. Display these qualifications beside the comparison. Also distinguish an entry with no comparison from an entry that the emitter cannot emit. The [emitter](/Users/darkomijic/dev-libar/libar-platform/scripts/pinned.mjs) already contains much of this information.

20. **Strengthen selected “ahead” checks around the intended difference.** An inequality assertion shows that the types differ. It does not establish that they differ for the expected reason. For consequential pairs, add compiled-tier assertions for the supported common shape and the specific proposed extension. For example, check the intended projection forms explicitly. This is worth doing selectively where unrelated drift could otherwise remain green.

21. **Show behavioral proof beside type compatibility.** A declaration matching its implementation does not prove event interleaving, cancellation behavior, or interruption recovery. The page should place relevant examples and their required tiers beside the signature. This creates a useful distinction between “the shapes agree” and “the promised behavior has evidence.”

22. **Repair missing bindings before using their absence to guide work.** Rebuild and write pause are already recorded as binding gaps. Address those, while checking whether each carrying Spec’s scope is narrow enough for an honest binding. A broad workflow with only one realized path may need a better boundary. Until then, render “no implementation binding recorded,” which is what the graph actually knows.

23. **Represent the binding location and implementation location separately.** The read-model anchors live in [a test file](/Users/darkomijic/dev-libar/libar-platform/tests/pure/read-model.test.ts:17) because deployed code cannot import SDP. A useful page needs to show both where that assertion is made and which implementation it points to. Start with an explicit platform mapping or an extractor-owned companion-binding design. If SDP generalizes this, preserve the authored binding and validate its target. Do not silently treat a test import as proof that the imported module satisfies the Spec.

24. **Add a reverse file view.** Opening a source file should show the Specs bound to it, relevant declarations, examples, and affected Packs. Use `byFile` for recorded coverage, and display “coverage unknown” when it has none. This is especially useful during implementation and review, where the reader often arrives holding a filename rather than a Spec ID.

25. **Attach test results as a separate, clearly identified input.** The platform already has run records. Join them by verifier identity and show commit, tier, composition, target, and result. Keep compiled, pure test, `convex-test`, and native backend distinct. If the selected run predates the source being read, say so. This should consume existing test output rather than introduce another manually maintained proof log.

The next group supports repeated design passes.

26. **Present unresolved choices as an actionable decision list.** Join recipe 20 with [the decision register](/Users/darkomijic/dev-libar/libar-platform/design/decisions/register.json:6403). Show the question, provisional reading, class, advisor, affected Specs, and downstream consequences. Preserve the difference between a question that blocks an SDP readiness floor and a register decision that blocks a platform unit. OD-157 is a concrete case: its Spec question is non-blocking for readiness, while the register assigns an owner decision affecting S5.

27. **Give open questions stable identities.** Positional references such as `spec:application.rebuild#7` are fragile and are not current SDP entry addresses. A small SDP extension could add optional question keys and a ruled address form. Migration should validate uniqueness and detect missing references. Until then, the existing `OD-*` identity can be the stable presentation link, with its Spec association checked by platform tooling. Any proposed question-address syntax should remain explicitly a proposal until ruled.

28. **Make a review lens a filter over the same capability.** Domain, Convex, operator, and implementation views can reorder or emphasize relevant questions, entries, examples, and constraints. They should open the same carrying Specs. The existing [pass task](/Users/darkomijic/dev-libar/libar-platform/design/advisors/task-pass.md) already supplies the working pattern. A lens does not need a new Spec kind or a compulsory stage sequence.

29. **Generate the next pass’s reading material.** Given a Pack and lens, produce a disposable view containing the reading order, open questions, dependency concerns, relevant declarations, and examples. This could be copied into an advisor brief or read directly by a person. Start with a platform recipe. Generalize it only after repeated use shows which joins are stable.

30. **Show changes at Spec-entry granularity.** Compare two graph snapshots by Spec ID, section, and entry key. Distinguish changed declaration text, changed explanatory prose, moved entries, readiness edits, relation edits, and new or removed examples. A Git diff remains available underneath. For the stacked platform PR, compare against its PR base so the reader sees the design adoption separately from the much larger underlying branch.

31. **Show what changed since a design pass.** If a pass read a known commit, compare that version with the current one. Display “this declaration changed since the operator pass” or “a dependency gained a blocking question.” This is review context derived from Git, not a new approval fact in the graph. Begin at Spec granularity; entry-level precision can follow.

32. **Keep decision rationale close to the affected design.** A decision panel should show the chosen or provisional option, the do-nothing option, alternatives, consequences, and the Specs it shapes. This is particularly useful for the paused verify pass: the reader needs the tradeoff and affected scenarios, not just an `OD-157` link. Draw from the existing register and decision Specs rather than maintaining another summary by hand.

Several supporting changes would make these views dependable.

33. **Add a dependency-cycle recipe.** Report strongly connected sets for selected relation types, including self-loops, and show an actual path through each set. Begin with `dependsOn`; offer the broader typed-dependency view separately. A cycle should be visible without automatically becoming an error, since its acceptability depends on what the relations mean.

34. **Provide batch address resolution through the existing query mechanism.** Accept a list of addresses and return the resolved Spec, section, key, value, and a precise failure reason. This would serve the platform’s external citations, a viewer’s links, and decision-register checks. It can be a shipped recipe first. Preserve the exact mention/address grammar instead of teaching every adopter a slightly different regular expression.

35. **Show accepted prose mentions with their reasons.** The platform’s exception policy is already useful. Present the exception reason in the relationship view, along with new unclassified pairs and stale exceptions. This helps readers distinguish “there is intentionally no typed relation” from “someone forgot the dependency.”

36. **Separate inspection from artifact publication.** A local viewer should use in-memory extraction, validation, and rendering. It should not call the build path on every refresh. A future CLI cleanup could provide the same separation for checks, but the first viewer can use the exported APIs. When extraction fails, display the diagnostics and clearly identify any retained page as the last successful snapshot.

37. **Keep changing context outside the pure Design Review.** The current Design Review is specified as a function of the graph alone, without timestamps or commit identities. A repository browser can surround that content with the selected commit, engine pin, Git comparison, and test run. That separation lets the pure pages stay deterministic while the browser answers practical questions about freshness. The current boundary is explicit in the [Design Review Spec](/Users/darkomijic/dev-libar/libar-platform/node_modules/@libar-dev/software-delivery-protocol/specs/consumers/design-review.sdp.md:19).

38. **Build a small read-only browser with static output first.** It needs a navigation column, a readable content column, search, filters, entry links, and an optional context panel. Static HTML with client-side search is sufficient for an initial export; local refresh can be added around the same renderer. Keyboard navigation, readable line lengths, text labels beside colors, and print output should be part of that first cut.

39. **Make PR review open on the rendered capability.** CI can generate the changed Packs and Specs as a downloadable review artifact, with a short job summary linking to it. Include the selected comparison base and generation provenance in the artifact wrapper. Keep generated status out of authored Specs. This would make #12’s design work inspectable without requiring reviewers to install and navigate the repository.

40. **Test the human tasks that motivated the work.** Use the history view as the acceptance corpus. Ask a reader to find the history contract, locate OD-157, explain the aggregate dependency, find the type comparison for one declaration, and determine whether a paused-rebuild example has native-backend evidence. Record where they get stuck. Renderer snapshots are useful, but they cannot establish that someone can find those answers.

There is a natural division of responsibility.

| Responsibility | Best home |
|---|---|
| Readable Design entries, stable entry links, preserved Pack order | SDP |
| Generic Spec, Pack, relation, and file navigation | SDP reader and human view |
| Question identity and reusable address resolution | SDP, with explicit model decisions |
| TypeScript declaration formatting and comparison details | Platform adapter initially |
| Decision-register classes, owner queue, and roadmap associations | Platform |
| Tier, composition, target, and test-run presentation | Platform adapter |
| Git comparison and review freshness | Repository browser context |
| Authored intent | Existing Specs |
| Work history | Git and existing work records |

That division avoids making SDP understand Convex-specific declarations, platform decision classes, or the platform’s test harness.

I would package the work into a short sequence of reviewable PRs:

| Order | Change | Concrete completion test |
|---|---|---|
| 1 | **Readable Design Review.** Narrowly reopen the rendering rule; render entries and address links. | The history projection’s ten entries can be read without opening JSON or the carrier file. |
| 2 | **Ordered capability navigation.** Preserve Pack order end to end; improve the Pack page and entrance page. | History projection remains first after graph serialization and reload; external dependencies are visible. |
| 3 | **Platform design context.** Expose declaration comparisons and decision-register associations; resolve the known binding gaps. | From a declaration, a reader can reach its comparison and code; from OD-157, the affected design and examples. |
| 4 | **Small repository browser.** Add search, file navigation, lens filters, and a read-only refresh path. | The acceptance tasks above can be completed without querying the CLI manually. |
| 5 | **Iteration review.** Add entry-level comparisons, changes since a pass, and CI review artifacts. | A reviewer can identify what changed in the design since the previous pass and inspect the source diff. |
| 6 | **Reusable integrity improvements.** Add question identities, cycle reporting, and batch address resolution. | Reordering questions preserves references; dependency loops and broken external citations are explained directly. |

The current projection freeze and Studio deferral should be addressed explicitly in those proposals. The freeze requires a superseding decision for changes to the shipped views. [Plan 35](/Users/darkomijic/dev-libar/software-delivery-protocol/plans/35-agent-surface-adoption-and-self-binding.md:80) also asks for a named underserved reader and a package home before Studio resumes. Your updated feedback supplies a concrete reader: a person working inside this repository who needs to inspect and iterate on a capability. I would recommend `@libar-dev/` as the proposed home for that developer tool and keep the first scope to reading and review.

**My first choice would be PRs 1–3, followed promptly by the small browser.** Formatting the pages will provide immediate value; navigation and the platform adapters will make them useful for actual design decisions. I would postpone new maturity rungs and changes to the declaration carrier until that readable view has been used for the remaining history-view passes.

This session remained read-only. I used graph queries, source inspection, and in-memory rendering; I did not rerun the platform’s proof tiers. The existing edit to the feedback file is unchanged.