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

Thirteen facts are documented and four are assumed as the doc states them. Four of the documented ones were rechecked on 2026-09-29 during the review. On 2026-09-30 the lead read the limits, scheduling, backup, application-errors, components, best-practices, Workflow and migrations pages again; the only status that changed is F16, which the scheduling page documents, and the recheck is recorded on that fact while the doc keeps its own wording until the owner edits it. Nothing is probed yet.

## Intent

- outcome: Every Convex fact the design relies on is recorded once with its status, its source and the decisions that rest on it, and every assumed fact names the probe that would settle it (Fact ledger)
- value: A reviewer refutes a mechanism by its ledger fact, and a graph query lists the designs that rest on an assumption before the probes run (Decision method rule 1, Decision method rule 5)
- risk: Four facts are assumed; a probe that fails changes the decisions it serves, which the decision Specs record and the component Specs inherit (F14, F15, F16, F17)
- assumption: The sources support the Convex facts, not the correctness or performance of the design, which nothing has run yet (Sources)

## Rule

- The ledger holds what the design relies on: each fact carries a status and names the decisions that rest on it (Fact ledger)
- Documented means stated in Convex docs (Fact ledger)
- Rechecked means read again on 2026-09-29 during the review (Fact ledger)
- Probed means a native backend test showed it (Fact ledger)
- Assumed means nothing beyond the author's reading supports it yet, and an assumed fact names the probe that would settle it (Fact ledger, Probes)
- Nothing is probed yet (Fact ledger)
- The sources support the Convex facts, not the correctness or performance of this design, which nothing has run yet (Sources)
- A fact's status changes only by a recheck against its named source or by a probe on a native backend, and the corpus records a recheck on the fact while the doc keeps its own status until the owner edits it (Fact ledger, F16)
- Each probe is one small test on a native backend, and the probes run in the order the decisions need them (Probes)
- A fact is written from the concern first: the concern names what Convex must guarantee, the ledger records what the docs say, and only then does a mechanism enter (Decision method rule 1)
- Every Spec that relies on a fact points `constrainedBy` at that fact, and a fact's `target` is its evidence status (OQ5)

## Design

The four statuses map to the constraint target `evidence.status:documented`, `evidence.status:rechecked`, `evidence.status:probed` or `evidence.status:assumed`; `measurableBy` names the source and, for an assumed fact, the probe.

- factsDocumented: F1, F2, F7, F8, F9, F10, F11, F12, F13 (Fact ledger)
- factsRechecked: F3, F4, F5, F6 on 2026-09-29; F16 on 2026-09-30 against S6, changed from assumed (Fact ledger, F16)
- factsAssumed: F14, F15, F17, with Probe 2, Probe 5 and Probe 6 respectively (Fact ledger, Probes)
- factsProbed: none (Fact ledger)
- sourcesRead: S1 to S13 by v0.1's author on 2026-09-29, S10, S14 and S15 again during the review the same day, and S2, S6, S8, S9, S10, S11 and the migrations and application-errors pages by the lead on 2026-09-30 (Sources)

## Verification — reviewed

- A reviewer confirms that each of F1 to F17 exists as a constraint Spec with the statement of its ledger row, `flavor: convex-fact`, a status target and a `measurableBy` that names the source and the probe.
- A reviewer confirms that every assumed fact is named as an assumption or an open question on each Spec that relies on it, and that the probe plan lists its probe.
