---
id: spec:constraints.bulk-operations-bounded
kind: constraint
altitude: story
readiness: defined
relations:
  refines: spec:operations.baseline-operations
  decidedBy:
    - spec:decisions.d19-operations-travel-with-capability
  constrainedBy:
    - spec:facts.f13-transactions-have-limits
---
# Every bulk operation has a stated bound

Operations bound · Traces: D19, F13.

Every bulk operation, sweeper and batch has a stated bound, tested against the pinned Convex version, and platform limits are ceilings, not batch sizes. In this package the bounded operations are the backfill, verify and purge batches of a rebuild, the batches of its tenant fill, the check batches of a restore, an import's batches and the operator's audit pages; each states its bound in its Spec. A batch sized at a platform limit is a batch that times out or fails when the limit moves, so every bound sits well below the 32,000 documents scanned, 16,000 written, 16 MiB read and written, 4,096 index ranges and the one second timeout.

## Intent

- outcome: Leave no bulk operation without a stated, tested bound below the platform limits (D19, F13)
- value: An operator knows before a batch runs how many documents it touches and how long it takes, and a Convex version change is caught by a test rather than by a timeout in production (D19)

## Constraints

- statement: Every bulk operation, sweeper and batch states a bound below the transaction limits and the mutation timeout, and a test asserts the bound against the pinned Convex version; platform limits are ceilings, not batch sizes (D19, F13)
- flavor: operations
- target: bulk-operations.without-stated-bound.eq:0
- measurableBy: a review listing every batch function in the corpus with its bound bullet, and one acceptance test per batch that runs it at its bound on the pinned Convex version and asserts it finishes inside one mutation (D19, F13, Sc L2-5)
