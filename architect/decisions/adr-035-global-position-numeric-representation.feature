@architect
@architect-adr:035
@architect-adr-status:accepted
@architect-adr-category:design
@architect-pattern:ADR035GlobalPositionNumericRepresentation
@architect-status:completed
@architect-completed:2026-04-22
@architect-release:vNEXT
@architect-quarter:Q2-2026
@architect-product-area:Platform
Feature: ADR-035 - globalPosition Numeric Representation

  Background: Deliverables
    Given the following deliverables:
      | Deliverable | Status | Location |
      | Decision spec (this file) | accepted | libar-platform/architect/decisions/adr-035-global-position-numeric-representation.feature |
      | Canonical bigint helpers | complete | libar-platform/packages/platform-core/src/events/globalPosition.ts |
      | Event-store allocator migration | complete | libar-platform/packages/platform-store/src/component/lib.ts |
      | Store schema + consumer compat path | complete | libar-platform/packages/platform-store/src/component/schema.ts and downstream checkpoint consumers |
      | Precision + monotonicity tests | complete | libar-platform/packages/platform-store/tests/unit/globalPosition.test.ts and related packet tests |

  Rule: Context - JavaScript number arithmetic is not safe for current globalPosition scales

    The old representation combined `Date.now()` with hash and version arithmetic inside a JavaScript number.
    At current timestamps this exceeds `Number.MAX_SAFE_INTEGER`, which means ordering and equality become
    lossy exactly where checkpoints and replay logic need exact comparisons.

    Constraints the new representation must satisfy:

    | Constraint | Why it matters |
    | Exact at real `Date.now()` scales | Checkpoints and replay cannot depend on rounded positions |
    | Strictly monotonic for sequential appends | Projection and PM idempotency compares positions directly |
    | Indexed in Convex | `readFromPosition` and global ordering still depend on an indexed field |
    | Compatible with legacy checkpoint documents | Existing app/store checkpoints may still hold numeric positions |

    Alternatives considered:

    | Option | Pros | Cons |
    | Keep JavaScript number and adjust formula | Minimal code churn | Rejected: still unsafe at real timestamp scales |
    | Fixed-width string positions | Safe across boundaries | Rejected: adds lexical-format coupling and non-native numeric comparisons everywhere |
    | Pure global counter | Strict ordering | Rejected: loses direct timestamp decomposition and complicates compat with historical position magnitude |
    | Convex int64 / TypeScript bigint with monotonic timestamp+sequence allocator (chosen) | Exact, indexable, compatible with timestamp-derived ordering, keeps monotonicity explicit | Consumers must stop assuming `number` and use compat helpers/comparators |

  Rule: Decision - globalPosition is a Convex int64 / TypeScript bigint allocated from timestamp plus sequence

    The canonical representation is:

    | Field | Canonical type |
    | Event Store `events.globalPosition` | Convex `v.int64()` |
    | Runtime type | TypeScript `bigint` |
    | Checkpoint compat inputs | legacy `number` or canonical `bigint`, normalized through compat helpers |

    Allocation rule:

    | Component | Behavior |
    | Timestamp bucket | Use `Date.now()` in milliseconds |
    | Sequence | Allocate a per-millisecond sequence from 0..999999 |
    | Backwards clock handling | Clamp to the last allocated timestamp and continue the sequence |
    | Overflow | Advance to the next millisecond bucket and reset sequence to 0 |
    | Canonical position | `BigInt(timestamp) * 1_000_000n + BigInt(sequence)` |

    This keeps positions exact, preserves timestamp-derived ordering, and makes sequential appends strictly
    monotonic without relying on hash buckets or version modulo wraparound.

  Rule: Compatibility - legacy checkpoint numbers are read through a compat path, new writes use bigint

    Compatibility policy:

    | Surface | Policy |
    | Event Store indexed event rows | New writes use int64 only |
    | Projection / PM / replay checkpoint fields | Read legacy `number` or canonical `bigint`, normalize before compare |
    | Consumer comparison logic | Use shared compat helpers instead of raw subtraction / `>` / `Math.max` on plain numbers |
    | New checkpoint writes | Normalize to canonical bigint before persistence |

    Compat-reader rule: legacy numeric checkpoints are accepted only at read/input boundaries and converted via
    the shared `normalizeGlobalPosition()` helper before any ordering comparison. New checkpoint writes persist the
    canonical bigint representation so the mixed-format window narrows over time.

    The packet does not preserve unsafe "just use a number" assumptions. Any consumer that still needs ordering,
    lag, sort, or equality logic must route through the shared bigint-aware helpers.

    @acceptance-criteria @happy-path
    Scenario: Sequential appends remain strictly monotonic at real timestamps
      Given the store allocates positions using timestamp plus per-millisecond sequence
      When 1000 sequential appends are allocated at a real `Date.now()` scale
      Then every later position is strictly greater than the prior position
      And equality checks remain exact because the runtime representation is bigint

    @acceptance-criteria @validation
    Scenario: Legacy numeric checkpoints are read safely by the new code
      Given a historical checkpoint stores `lastGlobalPosition` as a number
      When the new checkpoint helper reads that document
      Then the value is normalized through the compat path before comparison
      And new bigint checkpoints are not misread as legacy numeric checkpoints

  Rule: Consequences - consumers must stop treating globalPosition as a plain number

    Positive outcomes:
    - `globalPosition` comparisons are exact and monotonic at current timestamp scales
    - Event-store ordering remains indexable in Convex via int64
    - Projection, replay, and process-manager checkpoints can read old numeric documents safely while writing the new format

    Negative outcomes:
    - Consumers that previously used arithmetic like `a - b`, `Math.max`, or `>` on `number` positions must migrate to shared bigint-aware helpers
    - Logs and UI surfaces must stringify bigint values explicitly where plain JSON serialization was assumed
