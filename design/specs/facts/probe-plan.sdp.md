---
id: spec:facts.probe-plan
kind: workflow
altitude: feature
readiness: defined
relations:
  refines: spec:facts.fact-ledger
  dependsOn:
    - spec:facts.f14-convex-error-survives-nested-and-component-boundary
    - spec:facts.f15-parent-query-over-component-query-stays-reactive
    - spec:facts.f16-scheduled-functions-table-shows-failed-runs
    - spec:facts.f17-migrations-fits-generation-backfill
  constrainedBy:
    - spec:facts.f04-nested-calls-cost-more-than-helpers
    - spec:facts.f05-react-client-retries-until-confirmed
    - spec:facts.f12-backups-exclude-pending-scheduled-functions
    - spec:facts.f13-transactions-have-limits
---
# The probe plan

Feature · Detail: full transcription · Traces: Probe 1 to Probe 7, F4, F5, F12, F13, F14, F15, F16, F17, S13, E-16.

Seven probes, in the order the decisions need them, each one small test on a native backend. A probe turns an assumed fact into a probed one, or measures a size the docs leave open. The recheck of 2026-09-30 narrowed two of them and left the rest standing: the limits page states no limit on nested calls, so Probe 4 stands; the application-errors page does not state that `ConvexError` data survives a component boundary, so Probe 2 stands; the scheduling page documents the states and the 7-day retention of `_scheduled_functions`; Probe 7 observes the states and a short retention interval, scheduled-argument accounting, failed-function scan cost and local CLI replacement, while seven-day expiry and hosted dashboard restore remain open.

The probes are not the first experiment. The experiment builds Layers 0 to 2 and measures cost; the probes settle single facts and can run before it, in a fixture app that is separate from the example app.

## Intent

- actor: The platform maintainer who runs the probes before the decisions they serve are trusted (Probes)
- problem: A mechanism justified by a fact the docs do not state is v0.1's order in a new shape; without the probes the assumed facts stay assumed and the designs on them cannot be refuted or confirmed (Decision method rule 1)
- outcome: Each assumed fact has one small native test that settles it, and each open size has one measurement, before the decision that rests on it is trusted (Probes)
- value: Probes are cheaper than the mechanisms they may remove; a passing Probe 7 could replace the obligation table for local reactions with a scheduled mutation and a system-table scan (D13, Probe 7)
- risk: Probe results are tied to the pinned Convex version and must be rerun when it changes (Acceptance scenarios)
- assumption: A local native backend is available for every probe run, as S13 describes (S13)

### Open questions

- [non-blocking] Probe 1 ran on 2026-10-01: a closed client leaves its mutation executed once or not at all, a backend restart leaves it executed once, and the HTTP client does not retry; whether callers of `ConvexHttpClient` must supply a request key is D6's question for the owner (Probe 1, D6)
- [non-blocking] Probe 3 ran on 2026-10-01 for latency on a local backend; a local backend has no function-call quota, so that half waits for a hosted deployment (Probe 3, F4, D2, D8)
- [non-blocking] Probe 5 ran on 2026-10-01: a parent query over a component query stays reactive, pages pinned by their end cursors stay contiguous, and a capped page crosses the boundary as `SplitRequired`; the `convex-helpers/react` hook then lost rows, and slice S2 decides how a context list is capped before it builds one (Probe 5, F15, S4, D8)
- [non-blocking] Probe 6 pending: it must show a backfill batch racing a live command under optimistic concurrency, and that the migrations component fits a generation backfill (Probe 6, F17, D9)
- [non-blocking] Probe 7 observes all five scheduler states, local CLI replacement into a fresh backend and in place, stored scheduler IDs, kept reactions, scheduled-argument limits and failed-function scan cost; seven-day expiry, hosted dashboard restore, Workpool and Workflow remain open before the decisions resting on those observations. (Probe 7, F12, F13, F16, D13, D19)
- [non-blocking] Extension E-16: the doc says each probe is one small test on a native backend and that a probed fact is one a native backend test showed, and does not say how a test that settles an unknown states what it expects or what follows when the backend answers otherwise; the option taken here: a probe is written as example Specs that verify its fact, each bound to its native test; an example's bound values are the expectation written before the first run; a first run that shows another value is a finding recorded on the fact, and the example is then bound to what that release does and says so; an example fails when its run did not reach the boundary it is about; a later run on a new release that shows another value is again a finding, and the test is not repaired to keep the old value; a size is recorded and not asserted, while a limit the backend enforces is bound as observed; and what a local backend cannot answer is named on the example and stays open on the fact; the owner confirms (E-16, Probes, Acceptance scenarios)

## Workflow

- rule: Each probe is one small test on a native backend (Probes)
- rule: Probes run in the order the decisions need them (Probes)
- rule: A probe result changes a fact's status to probed; it never changes a decision by itself, and the decision Spec records what changed (Probes, Decision method rule 1)
- rule: A probe run records the commit, backend and dependency versions, configuration, command and result, like any acceptance run (Acceptance scenarios)
- rule: [extension] A probe is written as example Specs that verify its fact, one example per case, each bound to its native test (E-16)
- rule: [extension] An example's bound values are the expectation written before the first run (E-16)
- rule: [extension] A first run that shows another value is a finding recorded on the fact with the backend release that showed it; the example is then bound to what that release does, and its text says the value was observed (E-16)
- rule: [extension] A later run, on a new backend release or a new version of a pinned package, that shows another value is again a finding recorded on the fact, and the example is rebound; the test is not repaired to keep the old value (E-16)
- rule: [extension] An example fails when its run did not reach the boundary it is about (E-16)
- rule: [extension] A measured size, a time or a cost, is recorded in the run's evidence and on the fact and is not asserted; a limit the backend enforces is bound as observed (E-16)
- rule: [extension] An example names what a local backend cannot answer, and that part stays open on the fact (E-16)
- Probe 1 sends a mutation from a tab that closes while it is pending, across a server restart, and from the HTTP client, and records for each whether the backend executed it once, more than once or not at all; it serves D6 (Probe 1, F5, F6)
- Probe 2 throws a `ConvexError` carrying structured data from a nested mutation and from a mutation inside a component, and checks that the parent and then the client read the same data; it serves D7 (Probe 2, F14)
- Probe 3 measures one component call from a parent mutation and from a parent query in latency and in function-call quota, and reports the difference from a plain helper; it serves D2 and D8 (Probe 3, F4)
- Probe 4 reads and writes near the per-transaction limits from a parent, from a nested mutation and from a component, and records whether the limits add up across the boundaries or apply per call; it serves D10 (Probe 4, F13)
- Probe 5 subscribes to a parent query that calls a component query, changes the component's data, and checks that the subscription updates; it then pages a component list built with `paginator` through the parent while live writes land inside the paged range, with the client passing the end cursor as `convex-helpers` describes, records whether the pages stay contiguous, and fills one page's range past the component's `maximumRowsRead` so that a re-run comes back `SplitRequired`, recording whether the `convex-helpers/react` hook splits it across the boundary without a gap; it serves D8 (Probe 5, F15, S4)
- Probe 6 runs a backfill batch through the migrations component while a live command writes the same read-model row, and checks that neither overwrites newer data and that the batch resumes after interruption; it serves D9 (Probe 6, F1, F17)
- Probe 7 exports the parent, Orders and Inventory with all five scheduler states, replaces data into a fresh backend and in place, tests stored scheduler IDs and execution of kept pending mutations, measures scheduled-argument accounting and filtered scan cost, and records the short retention interval it actually observes; hosted dashboard restore, seven-day expiry, Workpool and Workflow are separate cases that remain open; it serves D13 and D19 (Probe 7, F12, F13, F16)

## Design

Each probe is a fixture-app test on a disposable backend. The probe app is separate from the example app and ships no test-only function to production.

- backend: one disposable native backend per probe run, from the same local backend S13 describes (Acceptance scenarios, S13)
- fixtureApp: the probe app is the kernel's fixture app, separate from the example app, and test-only functions never ship (Acceptance scenarios)
- evidence: each run records commit, backend and dependency versions, configuration, command and result, and states any difference from production configuration (Acceptance scenarios)
- probe7Narrowed: native scheduler and CLI import cases deploy temporary copies of the production composition from modules under `tests/native/`, with added functions and schema hashes recorded; no probe function ships in the example or fixture; local observations do not establish hosted restore or seven-day expiry (F12, F13, F16, S6, S8)
- location: the probe app lives in this repository, beside the design, as the owner ruled under OQ4 on 2026-10-01 (OQ4)

## Verification — reviewed

- A reviewer confirms that every fact the doc lists as assumed (F14, F15, F17) and the rechecked F16 name a probe in this plan, that each probe that has run has example Specs bound to native tests and its result on its fact, and that every decision Spec with a Probe line for a probe that has not run records it as an open question naming the same probe number.
