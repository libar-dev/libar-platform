---
id: spec:application.first-experiment.native-contention
kind: example
altitude: story
readiness: idea
relations:
  refines: spec:application.first-experiment
  verifies: spec:application.first-experiment
---
# Concurrent commands on the production composition

Sc L2-9 · native backend tier · production composition · Traces: First experiment, Sc L1-11, Sc L2-9, E-47.

The concurrency half of native acceptance observes the production composition on the pinned local backend. The separate production-configuration example carries the code-path half. Neither claims parity with a hosted deployment.

## Intent

- outcome: On the local native backend, concurrent orders share stock for one; one is applied, the others reach short-stock rejections at two and eight callers, and at thirty-two callers engine failures are recorded separately (Sc L2-9, Sc L1-11, First experiment)

```gwt
Given the production composition on a native backend
And the contention matrix has sizes {sizes: "1, 10, 100"} and callers {callers: "2, 8, 32"}
And the backend runs with {configuration: "production configuration"}
When {run: "the PlaceOrder use case"} runs
Then each successful command makes {commits: 1} top-level commit
And the core path runs {projectionJobs: 0} projection jobs
And the contention matrix records one applied outcome per cell and {smallCellEngineFailures: 0} engine failures at two and eight callers
```

## Verification — executable

- Runs in the native backend tier on the production composition, with an ordinary authenticated client, four grants, one active generation and a disposable local backend per cell; the client sends commands concurrently without its mutation queue.
- The only stock item shared by the commands has quantity one and is first in every order; all remaining lines name items belonging to one command, each received once with quantity two. Each record states this layout.
- At each size, two and eight callers leave one order, one receipt and one summary, and all other commands are rejected for short stock; thirty-two callers leave the same applied effect and report short-stock rejections and engine failures separately.
- Each command is counted by its backend request ID with all completion records retained; a record with `willRetry` true and `occInfo` is an execution refused at commit, even when its error field is null. Terminal records and caller answers are counted separately, and no caller retries during the cell.
- The verifier asserts documents and bytes from each completion record, one applied order's retained effects, no scheduled functions and the immediate essential summary, while the number of engine reruns and the tables they name remain observations.
