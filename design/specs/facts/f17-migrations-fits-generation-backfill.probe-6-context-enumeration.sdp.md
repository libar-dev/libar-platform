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

- outcome: A migration walks the tables of the component it is defined in: a parent migration cannot walk a context's table, a migration mounted in the context can but cannot write a parent table, and a parent migration over a parent table of page records can call the context's `list`. (Probe 6, F17)

```gwt
Given {rows: 5} depot documents and migrations mounted in the parent and depot
When parent and depot migrations walk tables and a parent migration calls the context list
Then the parent table walk fails with {parentRows: 0} processed context rows and the depot table walk sees {contextRows: 5} rows
```

## Verification — executable

- The bound values are expectations written before the first native run on the pinned releases.
- Each test owns its disposable backend; failure to reach the named boundary fails the example.
- The bound values first written expected the parent walk of the context's `streams` table to succeed over zero rows; the first run on the pinned releases reported `failed` with `Uncaught Error: Index streams.by_creation_time not found.`, with and without the schema option, and the example is bound to that observed refusal.
- The parent's typed data model refuses the context's table name in the compiled tier; the fixture declares it under an expected type error so that the runtime is reached, and the compiler fails if a later release admits the name.
- A parent `customRange` without the schema option fails with `Uncaught Error: You must provide your schema to use a custom range.`, as bound before its run.
- A parent mutation that reads a context row by its ID fails with ``Invalid argument `id` for `db.get`: expected to be an Id<"streams">, got Id<``, followed by the name of a parent table, and a context migration that patches a parent row by its ID fails with the same kind of error naming a context table, so an ID is read in the namespace of the component that reads it.
- The migration mounted in the context completes over the five documents and writes the parent's summaries only through a function handle the parent supplied, one parent call per source row.
- The parent migration over page records calls `list` once per batch and writes three page records for five documents at a page of two; it carries two cursors, the component's over the page records and the context's in each record.
- Hosted quotas are not answered by this local example.
