# Run evidence

The native Vitest reporter writes one JSON record per invocation to `runs/`. These files are ignored by git. Each record names the commit, dirty tree, fixture composition, versions, configuration, dataset, identity source, command and test results.

A test calls `recordMeasurement(testName, measurementName, value)` from `harness/evidence.ts` to add a measurement to its result. Use the Spec ID for a bound example, or the full test name for an observation. Big integers are stored as an object with a `bigint` string.
