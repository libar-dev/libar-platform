---
id: spec:kernel.domain-kernel.incremental-then-rebuild
kind: example
altitude: story
readiness: defined
relations:
  refines: spec:kernel.domain-kernel
  verifies: spec:kernel.domain-kernel
---
# Run commands incrementally, then rebuild the stream from its events

Sc L0-2 · pure test tier.

## Intent

- outcome: Same business state and stream version. (Sc L0-2)

```gwt
Given a decider whose stream starts from its initial state
And a sequence of {commands: 3} valid commands, each with its decision context
And every input is frozen before the kernel runs
When the kernel is exercised as {exercise: "run the commands incrementally then rebuild from the events"}
Then the rebuilt business state {rebuilt: "equals"} the incrementally computed state
And the rebuilt stream version is {version: 3}
And the number of I/O calls observed is {io: 0}
```

## Verification — executable

- Runs in the pure test tier; no backend is involved and the test imports the kernel package only.
- Each command is decided against the state folded from the previous commands' events, never against a replay of history; the rebuild folds `evolve` from `initial()` over the collected events, and the version is the count of events.
