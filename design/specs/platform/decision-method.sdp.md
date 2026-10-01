---
id: spec:platform.decision-method
kind: rule
altitude: feature
readiness: defined
relations:
  refines: spec:platform.transactional-domain-platform
---
# How decisions are made

Feature · Detail: full transcription · Traces: Decision method rules 1 to 7.

The doc reverses the order v0.1 took. v0.1 went from an event-sourcing concern straight to an event-sourcing mechanism, then checked that Convex did not contradict it; its table of Convex facts supported a design that already existed, and every weak spot the review found traced back to that order. The seven rules below put the concern first, the ledger fact second and the mechanism last, with the do-nothing option as the first candidate every time.

Every decision Spec in this corpus follows the method in its shape: `context` states the concern and what Convex already gives (rule 1); the first `alternative` is the do-nothing option (rule 2), including where the doc chose it; each rejected option of the doc is its own `alternative`; the standing cost sits in `consequence` and, as a risk, in Intent; the scenarios the mechanism answers are named in `problem`.

## Intent

- outcome: Every mechanism in the platform enters as a decision that names the concern, the Convex fact, the failing scenario and the standing cost, with the do-nothing option checked first (Decision method)
- value: A reviewer can refute any mechanism by finding a cheaper Convex-native design that passes the same scenarios, and a wrapper that hides its registrations is not counted as removing them (Decision method rule 5, Decision method rule 7)
- risk: The method costs a written decision per mechanism and a probe per assumed fact before the mechanism is trusted; skipping either brings back the v0.1 order (Decision method rule 1, Decision method rule 2)

## Rule

- Start from the concern: atomicity, retries, ordering, deferred work, read freshness, rebuild, authority, restore, limits (Decision method rule 1)
- Write down what Convex and its official components already guarantee; that goes into the fact ledger, marked documented, probed on a native backend, or assumed (Decision method rule 1)
- Every mechanism is a decision whose first option is the do-nothing option, which relies on Convex as it is (Decision method rule 2)
- A mechanism enters only with three things: the failure it prevents as a concrete scenario, the ledger fact showing Convex does not prevent it, and its standing cost (Decision method rule 2)
- The standing cost is counted in writes per command, registered functions, tables, lifecycle states, operator duties, and obligations that keep costing over time, such as keeping old formats readable (Decision method rule 2)
- Test scenarios are the spine: check the do-nothing option against each scenario first; only a failing scenario justifies a mechanism, and the cheapest mechanism that passes wins (Decision method rule 3)
- Detail follows the build: Layers 0 to 2 get full detail, the first experiment runs, and Layer 3 is written from what it showed; later layers stay as a trigger, a promise and their scenarios until something triggers them (Decision method rule 4)
- Review a mechanism by trying to refute it: find a cheaper Convex-native design that passes the same scenarios (Decision method rule 5)
- A failed scenario names the broken promise; it does not by itself justify a new generic subsystem, and the first question is whether the failure boundary can be removed or its owner fixed (Decision method rule 6)
- Compare designs by what each feature needs: independently maintained facts, commit boundaries, persisted state machines, recovery owners (Decision method rule 7)
- A wrapper that hides twelve registrations has not removed them (Decision method rule 7)

## Verification — reviewed

- A reviewer confirms that every decision Spec lists the do-nothing option as its first alternative and states its standing cost as a consequence.
- A reviewer confirms that every Layer 3 to 6 mechanism names the scenario it answers and the trigger that installs it.
