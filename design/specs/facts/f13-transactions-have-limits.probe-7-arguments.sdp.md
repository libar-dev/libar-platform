---
id: spec:facts.f13-transactions-have-limits.probe-7-arguments
kind: example
altitude: story
readiness: defined
relations:
  refines: spec:facts.f13-transactions-have-limits
  verifies: spec:facts.f13-transactions-have-limits
---
# Probe 7: scheduled argument limits count encoded values

Probe 7 · native backend tier · temporary copy of the production composition.

## Intent

- outcome: Scheduled argument limits count encoded values. (Probe 7)

```gwt
Given a temporary mutation builds scheduled payloads internally as one string, an array of strings or eight calls
When it grows ASCII and multibyte payloads across the scheduling limits and reads completion warnings
Then the enforced sum is {limitBytes: 16777216} bytes with object overhead {objectBytes: 14} and array element overhead {elementBytes: 2}
And the refusal text is {refusal: "Error: Too large total size of the arguments of scheduled functions from this mutation (limit: 16777216 bytes)"} at {stage: "runAfter"} and the mutation returns {mutationReturned: true}
And one ASCII string accepts {asciiAccepted: 16777202} bytes and refuses {asciiRefused: 16777203} bytes
And one multibyte string accepts {multibyteAccepted: 8388601} copies of é and refuses {multibyteRefused: 8388602}
And an array of {parts: 1024} strings accepts {arrayAccepted: 16775154} content bytes and refuses {arrayRefused: 16775155}
And {calls: 8} calls accept {callAccepted: 2097138} content bytes each and refuse {callRefused: 2097139} on call {refusedCall: 8}
And single calls with {decimalBytes: 8000000} and {binaryBytes: 8388608} content bytes are accepted
And the shorter warning first appears at {warningFirst: 3355444} accounted bytes after {warningBefore: 3355443} without it, naming limit {warningLimit: 4194304} and text {warningText: "[WARN] Large arguments for a single scheduled function from this mutation"}
And the shorter warning accepts accounted sizes {shortSample: 4194254} and {shortLast: 4194304}, and the future hard error warning first accepts {hardFirst: 4194305} with text {hardText: "[WARN] Large arguments for a single scheduled function from this mutation. This will become a hard error in the future"} naming {namedLimit: 4194304}
```

## Verification — executable

- The value is observed, not expected: the expectation written before the first run was a hard 4 MiB per-call limit, and the run on release `precompiled-2026-09-28-5c7cb5b` with Convex 1.46.0 on 2026-10-02 showed a 16777216-byte sum enforced at runAfter while larger single calls warn and return.
- The tested objects account for UTF-8 content plus 14 bytes per call and two bytes per array element. Newline and quote characters distinguish this accounting from JSON escapes.
- The warning bounds are observed and were not expected: the first run on release `precompiled-2026-09-28-5c7cb5b` with `convex` 1.46.0 on 2026-10-02 found the per-call warning in the completion record's log lines, and a later run of this example searched for its onset and bound it; the shorter warning starts at 80 percent of 4 MiB, the future hard error form one byte above 4 MiB, and every call stays accepted.
- The warning names a future hard error at 4 MiB, which remains the design ceiling per call.
- The test must reach accepted and refused neighbours. Hosted limits are not run.
