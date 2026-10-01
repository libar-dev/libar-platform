---
id: spec:constraints.events-stay-small
kind: constraint
altitude: story
readiness: defined
relations:
  refines: spec:operations.baseline-operations
  decidedBy:
    - spec:decisions.d19-operations-travel-with-capability
    - spec:decisions.d05-rebuildable-history-with-baselines
---
# Events stay small

Operations bound · Traces: D5, D19, F13, E-2, E-12, E-25.

The doc says events stay small and that personal data sits behind references where rebuild does not need it; it gives no number. The bound here is an extension. It is chosen from the fold: a rebuild of a stream reads every event since its latest baseline in one transaction, and the read ceiling is 16 MiB. A payload bound of 16 KiB with about 1 KiB of envelope per event keeps a fold of 600 events near 10 MiB, under the ceiling with headroom for the stream row and the deep comparison, and a stream that grows longer than that since its baseline is the case D5's baseline event exists for. The 1 second query timeout for folding and comparing that much binds before the read ceiling, so the fold bound is provisional until the first experiment and the L2-7 example measure it. The bound is on the validated payload, not the envelope, and it is enforced by the journal's `append`, which measures the serialized payload before the insert. One event type is exempt: the reserved `baseline` event, whose payload is not fact data but the whole migrated state of its stream, is bounded by the stream type's `budgetBytes` instead, at most 512 KiB, measured by the same `append`, and the fold reads it once as its start rather than folding it, which is why the fold arithmetic counts one baseline at `budgetBytes` beside the 600 bounded events.

## Intent

- outcome: Bound every event payload so that a fold since the latest baseline stays inside one transaction and personal data never inflates history (D19, D5, F13)
- value: Rebuild, restore checks and journal inspection all read events in bounded batches whose size is known in advance (D19, F13)
- risk: The fold bound of 600 events rests on the 16 MiB read ceiling and on an unmeasured fold time under the 1 second query timeout, which binds first; the first experiment measures a fold at the bound (F13, E-12)

### Open questions

- [non-blocking] Extension E-12: the payload byte bound is the design's number, 16 KiB, chosen so that a fold of 600 events plus their envelopes stays near 10 MiB under the 16 MiB read ceiling with headroom; the owner may set another, and the journal's 600-event fold bound moves with it; the reserved `baseline` event of E-25 is exempt from the 16 KiB bound and bounded by its stream type's `budgetBytes` instead, at most 512 KiB, because its payload is a state snapshot that the fold reads once and never folds, and the owner confirms the exemption with E-25 (E-12, E-2, E-25, D19, F13)

## Constraints

- statement: Every event payload except a `baseline` event's is at most 16 KiB after validation, a `baseline` event's payload is at most its stream type's `budgetBytes`, and personal data that rebuild does not need is stored behind a reference rather than in the payload; the byte bound and the baseline exemption are extensions, E-12 and E-25 (D19, D5, E-12, E-25)
- flavor: operations
- target: event.payload.bytes.lte:16384;baseline.payload.bytes.lte:budgetBytes
- measurableBy: the journal's `append` measures each validated payload's serialized size and throws a plain error above the bound, 16,384 bytes for every event type but `baseline` and the stream type's `budgetBytes` for a `baseline` event, as `limitPayloadBytes` of `spec:context.journal` pins, the acceptance suite asserts both throws, and the first experiment reports the largest payload it wrote and the time of a fold at the 600-event bound; the bound is an extension marked E-12 and the exemption E-25 (E-12, E-2, E-25, D19, First experiment)
