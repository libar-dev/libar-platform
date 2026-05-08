# Value Transfer Doctrine

This document defines when design-spec content may move into executable carriers and when the source design spec may later be deleted.

## Purpose

Value transfer keeps the living behavior, invariants, and rationale close to the code that proves them. It does not turn every design artifact into disposable prose. Some design specs stay canonical because they describe planning state, structural policy, or meta-patterns that have no honest executable carrier.

## The five-criterion pre-deletion gate

A design spec is safe to delete only when all five criteria hold.

1. Forward link present
   - The design spec carries `@architect-executable-specs:<path>`.
2. Forward link resolves
   - The path points at a real file or directory under `tests/features/`.
3. Reverse link present
   - The executable carrier contains `@architect-implements:<Pattern>` for the semantic pattern being transferred.
4. Rich content has landed
   - Every substantive `Rule:` block from the design spec has a counterpart `Rule:` block in the executable carrier.
   - Preserve authored `**Invariant:**` text.
   - Preserve authored `**Rationale:**` text.
   - Preserve `**Verified by:**` text when the source spec included it.
5. Architecturally significant rationale lives where it will survive the delete
   - Important reasoning must exist either in the executable carrier or in production-source JSDoc where it materially belongs.

If any criterion fails, the design spec is still blocked.

## Transfer checklist

Use this checklist before deleting a design spec.

1. Confirm the semantic target pattern name.
2. Create or identify the executable carrier under `tests/features/`.
3. Add `@architect-implements:<Pattern>` to the carrier.
4. Copy each substantive `Rule:` block, keeping invariants and rationale intact.
5. Keep feature text honest about any stubbed or deferred verification work.
6. Add or confirm the design spec's `@architect-executable-specs:<path>` link.
7. Re-read both files and verify that the carrier now preserves the domain meaning, not just the headings.
8. Only then classify the source spec as deletion-ready.

## What must survive the transfer

The minimum durable payload is not just scenario titles.

- Business rule name
- Invariant text
- Why the rule exists
- What proves it
- The semantic pattern identity that other sources reference

Shortened summaries are fine when they keep meaning. Hollow placeholders are not.

## Anti-patterns

These moves fail the doctrine.

- Deleting a design spec because a same-named test file exists
- Copying scenario titles without the authored invariants or rationale
- Using `@architect-implements` on a carrier that does not actually preserve the design rule content
- Treating TypeScript-only assertions as a substitute for an executable feature when the transferred source was Gherkin behavior
- Claiming deletion-ready while the carrier is still a shape-only stub with no preserved design meaning

## When not to delete

Keep the design spec when any of the following is true.

- The pattern is still roadmap, active, or otherwise planning-owned
- The pattern is structural or meta and has no honest executable behavior surface
- The executable carrier would distort the concept into tool trivia instead of domain meaning
- The rationale belongs primarily to architecture policy, not runtime behavior

Deletion is the last step, not the goal.
