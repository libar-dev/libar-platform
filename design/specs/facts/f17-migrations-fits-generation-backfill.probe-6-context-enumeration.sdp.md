---
id: spec:facts.f17-migrations-fits-generation-backfill.probe-6-context-enumeration
kind: example
altitude: story
readiness: defined
relations:
  refines: spec:facts.f17-migrations-fits-generation-backfill
  verifies: spec:facts.f17-migrations-fits-generation-backfill
---
# Probe 6: migration table scope and context enumeration

Probe 6 · native backend tier · fixture composition.

Native backend `precompiled-2026-09-28-5c7cb5b`, `convex` 1.46.0, `convex-helpers` 0.1.124 and `@convex-dev/migrations` 0.3.6.

## Intent

- outcome: The parent cannot name the context table in its typed data model. A runtime table walk stays in the parent. A depot migration can walk streams but direct parent-table writes fail; a passed parent function handle is tested separately. A parent migration over page records can call list, with two cursors and its page size bounded explicitly. Hosted quotas are not answered. (Probe 6, F17)

```gwt
Given {rows: 5} depot documents and migrations mounted in the parent and depot
When parent and depot migrations walk tables and a parent migration calls the context list
Then the parent table walk fails with {parentRows: 0} processed context rows and the depot table walk sees {contextRows: 5} rows
```

## Verification — executable

- The bound values are expectations written before the first native run on the pinned releases.
- Each test owns its disposable backend; failure to reach the named boundary fails the example.
- The first native run on the pinned releases expected an empty successful parent walk; it instead reported `failed` with `Uncaught Error: Index streams.by_creation_time not found.` The bound parent outcome is that observed refusal.
- A parent definition without the schema option is expected to reach the backend and complete with zero processed rows, while depot still holds all five sources; this value is bound before that form is run.
- The pinned native backend completes the depot walk with five visits, the depot callback with five parent rows, and the parent table-of-pages walk with three page records for five rows; the table-of-pages form keeps two cursors and requires migration batch size one for one bounded context page per batch.
- Before its native run, a parent definition with `customRange` but no schema option is bound to fail with `You must provide your schema to use a custom range.`
- The first native attempt without a schema option also reported `failed` with `Uncaught Error: Index streams.by_creation_time not found.`, rather than the expected successful zero-row walk; that form is rebound to the observed refusal.
- The pinned native backend returns `Uncaught Error: You must provide your schema to use a custom range.` for the no-schema range definition, as bound.
