---
id: spec:kernel.domain-kernel.evaluate-twice
kind: example
altitude: story
readiness: defined
relations:
  refines: spec:kernel.domain-kernel
  verifies: spec:kernel.domain-kernel
---
# Evaluate a decision twice with identical inputs

Sc L0-1 · pure test tier.

## Intent

- outcome: Identical output, inputs unchanged, no I/O. (Sc L0-1)

```gwt
Given a decider whose stream starts from its initial state
And a sequence of {commands: 1} valid commands, each with its decision context
And every input is frozen before the kernel runs
When the kernel is exercised as {exercise: "evaluate one decision twice"}
Then the outputs of the two evaluations are {outputs: "identical"}
And the inputs afterwards are {inputs: "unchanged"}
And the number of I/O calls observed is {io: 0}
```

## Verification — executable

- Runs in the pure test tier; no backend is involved and the test imports the kernel package only.
- The inputs are deep-frozen before the first evaluation and compared by deep equality after the second; the outputs are compared by deep equality; a spy on the database, network, scheduler, environment and auth surfaces records zero calls.
