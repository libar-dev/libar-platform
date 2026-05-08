# Four-Tier Ladder

This ladder defines the maturity of architect sources before they become stable implementation or governance assets.

## The four tiers

### Idea

An idea is early thinking.

- problem is noticed
- direction is still loose
- no implementation commitment yet

Use when the repo needs a place to capture a possibility without implying near-term delivery.

### Candidate

A candidate has a clearer shape but is still being screened.

- value is plausible
- scope is still being tested
- dependencies may still be unknown

Use when the concept deserves evaluation but should not yet be treated as a committed plan.

### Plan

A plan is selected work.

- deliverables are named
- acceptance criteria exist
- dependencies and order matter

This is where roadmap specs usually become actionable.

### Design

A design is the most concrete pre-code doctrine artifact.

- rules and invariants are explicit
- the target behavior is describable in stable terms
- value transfer into executable carriers becomes possible

Design content is often the source material later transferred into executable features.

## How to use the ladder

Pick the lowest honest tier.

Do not promote a thin idea into design just because implementation is desired. Do not keep a well-formed design in candidate once the repo is already using it for execution decisions.

## Reclassification guidance

Move a source down the ladder when the substance is weaker than the label implies.

- `MINIMAL_STUB` usually means the source belongs in idea or candidate, not design.
- `RECLASSIFY` means the artifact should move to the tier that matches its actual maturity.

Move a source up the ladder only when the added structure is real and maintained.

## Relationship to deletion decisions

The ladder is about maturity, not deletion readiness.

Even a design-tier source may need to stay if it owns planning state, structural policy, or decision context. Value transfer can make a design spec deletable, but only after the separate pre-deletion gate passes.
