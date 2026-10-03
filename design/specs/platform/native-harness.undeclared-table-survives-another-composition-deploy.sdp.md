---
id: spec:platform.native-harness.undeclared-table-survives-another-composition-deploy
kind: example
altitude: story
readiness: defined
relations:
  refines: spec:platform.native-harness
  verifies: spec:platform.native-harness
---
# A table's documents survive a deploy whose schema leaves the table out

E-59 · native backend tier · temporary copy of the fixture composition, then the production composition · local backend.

## Intent

- outcome: The documents of a table that one deployed schema declares and the next deployed schema leaves out are read again after the first schema is deployed back, which the hosted driver relies on between one run's planting and the next run's read. (E-59)

```gwt
Given a local backend running a temporary copy of the fixture composition whose schema declares the table `plantedSchedules`, holding {rows: 3} planting records
When the harness deploys the production composition, whose schema leaves that table out, and then deploys the same temporary copy again
Then the production composition's deploy completes {deployed: true}
And the table holds the same planting records {rows: 3} with their IDs and creation times {unchanged: true}
```

## Verification — executable

- Runs at the native backend tier on the pinned local backend; it is the one local run that settles whether the hosted driver's order keeps what a run planted.
- The bound values are the expectation; a test result that shows another answer is a finding, and the hosted driver then deploys a temporary copy of the production composition that declares the table, recorded as its one difference.
- What a hosted deployment does with an undeclared table is not shown by the local backend; a run on the hosted deployment shows it.
