---
id: spec:facts.fact-ledger
kind: rule
altitude: feature
readiness: defined
relations:
  refines: spec:platform.transactional-domain-platform
---
# The fact ledger

Feature · Detail: full transcription · Traces: Fact ledger, Probes, Sources, F1 to F17, OQ5.

The ledger is what the design relies on: seventeen Convex facts, each with a status and the decisions that rest on it. The doc numbers neither the facts nor the probes' targets; the plan numbers the rows F1 to F17 in table order and the probes 1 to 7 in list order, and every citation in the corpus uses those tokens. Each fact is a constraint Spec refining this one, its target is its evidence status, and every Spec that relies on a fact points `constrainedBy` at it, so a graph query answers which designs rest on an assumption. That is the corpus's reading of the doc's fifth open question.

Thirteen facts are documented and four are assumed as the doc states them. Four of the documented ones were rechecked on 2026-09-29 during the review. On 2026-09-30 the lead read the limits, scheduling, backup, application-errors, components, best-practices, Workflow and migrations pages again; the only status that changed is F16, which the scheduling page documents, and the recheck is recorded on that fact while the doc keeps its own wording until the owner edits it. Slice S0 ran probes 1 to 5 on a native backend on 2026-10-01: F14 and F15 are probed, and F4, F5 and F13 carry what their probes showed. The doc's own sentence, that nothing is probed yet, stands until the owner edits it.

## Intent

- outcome: Every Convex fact the design relies on is recorded once with its status, its source and the decisions that rest on it, and every assumed fact names the probe that would settle it (Fact ledger)
- value: A reviewer refutes a mechanism by its ledger fact, and a graph query lists the designs that rest on an assumption before the probes run (Decision method rule 1, Decision method rule 5)
- risk: One fact is still assumed, F17, and three that the doc lists as assumed are rechecked or probed in the corpus; a probe that fails changes the decisions it serves, which the decision Specs record and the component Specs inherit (F14, F15, F16, F17)
- assumption: The sources support the Convex facts, not the correctness or performance of the design, which nothing has run yet (Sources)

## Rule

- The ledger holds what the design relies on: each fact carries a status and names the decisions that rest on it (Fact ledger)
- Documented means stated in Convex docs (Fact ledger)
- Rechecked means read again on 2026-09-29 during the review (Fact ledger)
- Probed means a native backend test showed it (Fact ledger)
- Assumed means nothing beyond the author's reading supports it yet, and an assumed fact names the probe that would settle it (Fact ledger, Probes)
- The doc says that nothing is probed yet; the corpus records each probe that has run on its fact and in `factsProbed` (Fact ledger)
- The sources support the Convex facts, not the correctness or performance of this design, which nothing has run yet (Sources)
- A fact's status changes only by a recheck against its named source or by a probe on a native backend, and the corpus records a recheck on the fact while the doc keeps its own status until the owner edits it (Fact ledger, F16)
- Each probe is one small test on a native backend, and the probes run in the order the decisions need them (Probes)
- A fact is written from the concern first: the concern names what Convex must guarantee, the ledger records what the docs say, and only then does a mechanism enter (Decision method rule 1)
- Every Spec that relies on a fact points `constrainedBy` at that fact, and a fact's `target` is its evidence status (OQ5)

## Design

The four statuses map to the constraint target `evidence.status:documented`, `evidence.status:rechecked`, `evidence.status:probed` or `evidence.status:assumed`; `measurableBy` names the source and, for an assumed fact, the probe.

- factsDocumented: F1, F2, F7, F8, F9, F10, F11, F12, F13 (Fact ledger)
- factsRechecked: F3, F4, F5, F6 on 2026-09-29; F16 on 2026-09-30 against S6, changed from assumed (Fact ledger, F16)
- factsAssumed: F17, with Probe 6; the doc also lists F14 and F15, which the corpus records as probed (Fact ledger, Probes)
- factsProbed: F14 by Probe 2 and F15 by Probe 5, on 2026-10-01 on backend release `precompiled-2026-09-28-5c7cb5b` with `convex` 1.46.0; Probe 1 on F5, Probe 3 on F4 and Probe 4 on F13 ran the same day, and their results are recorded on those facts, whose status stays documented or rechecked (Fact ledger, Probes)
- additionalFactsProbed: F18 by Probe 8, F19 by Probe 9 and Probe 11, and F20 by Probe 10 on native backend `precompiled-2026-09-28-5c7cb5b`, with `convex` 1.46.0 and `convex-helpers` 0.1.124; each states its package source and the limits of the local evidence. (Fact ledger, F18, F19, F20)
- sourcesRead: S1 to S13 by v0.1's author on 2026-09-29, S10, S14 and S15 again during the review the same day, and S2, S6, S8, S9, S10, S11 and the migrations and application-errors pages by the lead on 2026-09-30 (Sources)

## Verification — reviewed

- A reviewer confirms that each of F1 to F17 exists as a constraint Spec with the statement of its ledger row, `flavor: convex-fact`, a status target and a `measurableBy` that names the source and the probe.
- A reviewer confirms that every assumed fact is named as an assumption or an open question on each Spec that relies on it, and that the probe plan lists its probe.
