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
Given the production composition with temporary scheduler functions
When the native backend exercises arguments
Then the observation is {result: "16 MiB summed Convex value bytes per mutation; 4 MiB per call warns"}
```

## Verification — executable

- The original expectation before the first run followed the limits page. The test constructs values inside the handler, tries ASCII and multibyte strings and arrays of small strings, records refusal text and whether runAfter returned, and fails unless it reaches a refusal and a successful boundary neighbor. Hosted limits are not run.
- Original bound values were written before the first native run; the bound values here follow the observed refusal. Measured durations are recorded, not asserted.
- The first run on 2026-10-02 on `precompiled-2026-09-28-5c7cb5b` accepted calls above 4 MiB with a warning and refused the sum above 16 MiB at `runAfter`; the original 4 MiB hard-limit expectation did not hold. These values are observed. Exact-byte and encoding comparisons extend that observation.
- At the enforced boundary the test binds 16777216 accounted bytes, accepting one ASCII string of 16777202 bytes, 8388601 copies of é, 1024 strings totaling 16775154 content bytes, and eight calls each carrying 2097138 content bytes; their first larger tested neighbors refuse. The tested object costs 14 accounted bytes beside its string, or 14 plus two per array element beside its strings. Newline and quote characters distinguish this from JSON encoding.
