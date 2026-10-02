---
id: spec:facts.f19-nested-calls-share-time-budgets
kind: constraint
altitude: story
readiness: defined
relations:
  refines: spec:facts.fact-ledger
---
# Nested calls draw on a system-operation time budget

F19 · Status: probed · Doc status: not in the doc's ledger · Decisions: D2, D7, D10.

A nested or component call runs through an asynchronous system call of the pinned package, and the pinned backend does not charge the time a mutation spends waiting on its calls to the one second of execution F13 lists. It charges it to a budget of system operations, whose refusal has its own error. Probe 9 and Probe 11 ran on the native backend, release `precompiled-2026-09-28-5c7cb5b` with `convex` 1.46.0: a mutation that made a thousand empty calls committed after several seconds, and one that made more was refused about fifteen seconds after it began, in every run; a loop of computation was refused at one second with the execution error. The pinned package declares no duration and no metric for the budget, so the count of calls one mutation may make is not a number, and it falls as each call does more. The runs were taken while other work shared the machine, and their times are recorded and not asserted.

## Intent

- outcome: Record that the calls one mutation makes draw on a system-operation time budget beside the one-second execution limit, with its evidence status as a target, so that every design resting on it is found by its `constrainedBy` edge (F19)

### Open questions

- [non-blocking] The public package declares no duration for the system-operation budget. The local refusal near fifteen seconds is a local backend's observation, not a hosted limit. The examples exercise mutations; query-only call trees and how execution time is counted across child functions that compute are not measured (F19, Probe 9, Probe 11)

## Constraints

- statement: On the pinned native backend, the nested and component calls of one mutation can take it past one second of elapsed time without reaching the one-second execution limit, and end in a system-operation refusal with its own error (F19)
- flavor: convex-fact
- target: evidence.status:probed
- measurableBy: Package source: `convex` 1.46.0, `node_modules/convex/src/server/impl/registration_impl.ts:63-68,755-770` sends nested and component mutation calls through the asynchronous `1.0/runUdf` syscall; `node_modules/convex/dist/esm-types/server/meta.d.ts:19-27` exposes byte and document metrics but no time metric; native backend tier: Probe 9 and Probe 11 on the pinned release, whose errors name the system-operation budget and the one-second execution limit (F19)

## Design

- systemBoundary: A mutation that repeatedly calls an empty nested or component mutation fails with `Your request timed out performing too many system operations.` while its completion record reports zero documents and bytes read and written. A loop of computation fails with `Function execution timed out (maximum duration: 1s)`. Both errors are bound, while elapsed times and requested call counts are recorded (F19, Probe 9, Probe 11)
- nativeMeasurements: With other work on the machine, a thousand empty nested calls committed in 3.8 to 9.4 seconds and a thousand empty component calls in 5.0 to 7.1 seconds of top-level completion time, and every refused request ended between 15.2 and 15.7 seconds; these are one local backend's times under load, recorded in each run's evidence and asserted by no example (F19, Probe 9, Probe 11)
- componentCost: Probe 11 compares transaction metrics before and after twenty component calls and records the top-level completion usage and time. Empty calls read and write zero documents. Each control call inserts one document and reads it back, costing one document read and one written; a call took several milliseconds under load, and the times are recorded and not asserted (F19, Probe 11)
- countBoundary: The probe increases the requested count until the backend refuses it, recording every successful count and the first failed request. The refusal can end execution before JavaScript catches the error, so the failed request's exact completed-call count is not observable by the return value. No count is bound as a platform limit (F19, Probe 11)
- factCoverage: Probe 11 verifies this time-budget fact. It records component-call costs that inform the concern of F4, but does not verify F4's comparison against a plain helper because it has no helper baseline (F19, F4, Probe 11)
