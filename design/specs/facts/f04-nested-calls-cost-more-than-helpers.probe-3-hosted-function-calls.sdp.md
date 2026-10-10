---
id: spec:facts.f04-nested-calls-cost-more-than-helpers.probe-3-hosted-function-calls
kind: example
altitude: story
readiness: defined
relations:
  refines: spec:facts.f04-nested-calls-cost-more-than-helpers
  verifies: spec:facts.f04-nested-calls-cost-more-than-helpers
---
# Probe 3: the function calls a component call costs on a hosted deployment

Probe 3 · native backend tier · temporary copy of the fixture composition · hosted deployment.

## Intent

- outcome: The function calls that one parent mutation through component queries adds to a hosted deployment's usage, against the same mutation through a helper, are read from the deployment's usage readings and recorded. (Probe 3, F4, E-59)

```gwt
Given the hosted deployment running the hosted driver's temporary copy of the fixture composition, and a parent mutation that reads the same document {reads: 50} times through a helper function or through a component query
When a client calls the parent mutation {calls: 20} times through the component query, then {calls: 20} times through the helper, then {calls: 20} times through the component query again, and the run reads the deployment's function calls before and after each set of calls
Then the function calls the helper set adds are {helperCallsPerParentCall: 1} per parent call
And the function calls each component set adds are recorded, and the count is settled only when the two component sets add the same number
```

## Verification — executable

- Runs last in the hosted driver, on the copy the retention example ran on, which stays deployed for the next run; it starts no local backend.
- The function calls are the `functionCalls` metric of `GET /api/v1/get_current_usage`, read with the deploy key; after a set the run reads again until two readings in a row agree, and the run's evidence holds every usage reading with its time and its `seedStatus`.
- The helper set is the control: it must add exactly 20 function calls, one per parent call. The count is settled only when the control held, the two component sets added the same number, every `seedStatus` was complete and no UTC day boundary fell between the first and the last reading; otherwise the record says the count is not settled and the test result is failed, because the run did not reach its boundary.
- The endpoint is beta, may understate usage and promises no time by which a call is counted, so a settled count is the strongest reading this design can make, not a provider's promise; it is one hosted deployment's count on one plan and date, and it is the run's own only when no other run on the deployment overlapped it.
- No admin read and no other call runs between the two readings of a set.
