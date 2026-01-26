# EventStoreFoundation

**Purpose:** Detailed patterns for EventStoreFoundation

---

## Summary

**Progress:** [████████████████████] 1/1 (100%)

| Status       | Count |
| ------------ | ----- |
| ✅ Completed | 1     |
| 🚧 Active    | 0     |
| 📋 Planned   | 0     |
| **Total**    | 1     |

---

## ✅ Completed Patterns

### ✅ Event Store Foundation

| Property | Value     |
| -------- | --------- |
| Status   | completed |
| Effort   | 5w        |

**Problem:** Event Sourcing requires centralized storage for domain events with
ordering guarantees, concurrency control, and query capabilities for projections.
Without infrastructure for stream-based storage, bounded contexts cannot maintain
audit trails or support projection-based read models.

**Solution:** The Event Store component provides stream-based event storage with:

- Optimistic Concurrency Control (OCC) via expectedVersion
- Global positioning for cross-stream ordering (projections)
- APIs for both writing (appendToStream) and reading (readStream, readFromPosition)
- Event category taxonomy (domain, integration, trigger, fat)
- Schema versioning for event evolution

**Note:** This pattern was implemented before the delivery process existed
and is documented retroactively to provide context for IntegrationPatterns
and AgentAsBoundedContext phases.

#### Acceptance Criteria

**Successful append with matching version**

- Given a stream "Order" with id "ord-123" at version 5
- When appending an event with expectedVersion 5
- Then the append succeeds
- And the stream version becomes 6
- And the event receives a globalPosition

**Conflict on version mismatch**

- Given a stream "Order" with id "ord-123" at version 5
- When appending an event with expectedVersion 3
- Then the append returns status "conflict"
- And the response includes currentVersion 5

**Projection resumes from checkpoint**

- Given a projection with lastProcessedPosition 1000
- When reading events from position 1001
- Then only events with globalPosition > 1000 are returned
- And events are ordered by globalPosition ascending

#### Business Rules

**Events are immutable once appended**

Once an event is appended to a stream, it cannot be modified or deleted.
Events form a permanent audit trail that serves as the source of truth
for both CMS state and projection data.

    This immutability is enforced at the API level - the Event Store provides
    no update or delete operations for events.

**Streams provide per-entity ordering via version numbers**

Each stream represents a single entity (aggregate) and maintains its own
version sequence starting at 1. Events within a stream are ordered by
their version number, ensuring deterministic replay if ever needed.

    The stream is identified by (streamType, streamId) pair:
    - streamType: The entity type (e.g., "Order", "Product")
    - streamId: The unique identifier within that type

**globalPosition enables total ordering across all streams**

While version provides per-stream ordering, globalPosition provides a
monotonically increasing counter across ALL events from ALL streams.
This is critical for projections that need to process events in causal order.

    The globalPosition formula ensures:
    - Globally unique positions (stream identity hash included)
    - Monotonically increasing within a stream
    - Time-ordered across streams (timestamp is primary sort key)

    Formula: timestamp * 1,000,000 + streamHash * 1,000 + (version % 1000)

**OCC prevents concurrent modification conflicts**

When appending events, callers must provide an expectedVersion: - If expectedVersion matches the stream's currentVersion, append succeeds - If expectedVersion mismatches, append returns a conflict result - For new streams, expectedVersion = 0

    This enables safe concurrent access without locks while ensuring
    business invariants are validated against consistent state.

_Verified by: Successful append with matching version, Conflict on version mismatch_

**Checkpoints enable projection resumption with exactly-once semantics**

Projections track their lastProcessedPosition (a globalPosition value).
On restart, projections query events starting from their checkpoint,
ensuring no events are missed and no events are processed twice.

    The readFromPosition API supports this pattern by accepting a
    starting globalPosition and returning events in order.

_Verified by: Projection resumes from checkpoint_

---

[← Back to Roadmap](../ROADMAP.md)
