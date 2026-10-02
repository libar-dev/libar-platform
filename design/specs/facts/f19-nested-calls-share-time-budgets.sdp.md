---
id: spec:facts.f19-nested-calls-share-time-budgets
kind: constraint
altitude: story
readiness: defined
relations:
  refines: spec:facts.fact-ledger
---
# Nested calls share time budgets

F19 · Native backend tier · Backend `precompiled-2026-09-28-5c7cb5b`, `convex` 1.46.0, `convex-helpers` 0.1.124.

## Intent

- outcome: Record the package declaration and native backend behavior with the limits of the evidence. (F19)

### Open questions

- [non-blocking] The public package declares no duration for the system-operation budget. The local timeout near fifteen seconds is an observation under load, not a hosted limit. The examples exercise mutations; query-only call trees and the allocation of JavaScript execution time among busy child functions remain unmeasured. (F19)

## Constraints

- statement: On the pinned native backend, repeated empty nested mutation calls and component mutation calls in one parent mutation can exceed one second of top-level elapsed execution and end with a system-operation timeout, distinct from the one-second execution timeout of direct computation. (F19)
- flavor: convex-fact
- target: evidence.status:probed
- measurableBy: Package source: `convex` 1.46.0, `node_modules/convex/src/server/impl/registration_impl.ts:63-68,755-770` sends nested and component mutation calls through the asynchronous `1.0/runUdf` syscall; `node_modules/convex/dist/esm-types/server/meta.d.ts:19-27` exposes byte and document metrics but no time metric; native backend tier: Probe 9 and Probe 11 on the pinned release, whose errors name the system-operation budget and the one-second execution budget. (F19)

## Design

- systemBoundary: A mutation that repeatedly calls an empty nested or component mutation fails with `Your request timed out performing too many system operations.` while its completion record reports zero documents and bytes read and written. A direct computation fails with `Function execution timed out (maximum duration: 1s)`. Both errors are bound, while elapsed times and requested call counts are recorded. (F19, Probe 9, Probe 11)
- nativeMeasurements: Under load, an initial local run completed 1,000 nested calls in 3.751 seconds and 1,000 component calls in 7.083 seconds; requests for 10,000 calls failed at 15.703 and 15.169 seconds respectively. These are top-level completion times on one local backend, not limits asserted by the examples. (F19, Probe 9, Probe 11)
- componentCost: Probe 11 compares transaction metrics before and after twenty component calls and records the top-level completion usage and time. Empty calls read and write zero documents. Each control call inserts one document and reads it back, costing one document read and one written; the initial run recorded 13.133 ms per empty call and 15.521 ms per control call under load. (F19, Probe 11)
- countBoundary: The probe increases the requested count until the backend refuses it, recording every successful count and the first failed request. The timeout can end execution before JavaScript catches the error, so the failed request's exact completed-call count is not observable by the return value. No count is bound as a platform limit. (F19, Probe 11)
- factCoverage: Probe 11 verifies this time-budget fact. It records component-call costs that inform the concern of F4, but does not verify F4's comparison against a plain helper because it has no helper baseline. (F19, F4, Probe 11)
