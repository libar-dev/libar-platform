@architect
@architect-release:v0.2.0
@architect-pattern:EventStoreFoundation
@architect-status:completed
@architect-phase:02
@architect-effort:5w
@architect-product-area:Platform
@architect-completed:2026-01-18
@architect-pre-existing-completion
@architect-unlock-reason:Add-sequence-annotations-for-design-review-generation
@architect-sequence-orchestrator:event-store-append-flow
Feature: Event Store Foundation - Centralized Event Storage

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

  Background: Deliverables
    Given the following deliverables:
      | Deliverable | Status | Location |
      | Event table schema (streams, globalPosition, category) | complete | @libar-dev/platform-store/src/component/schema.ts |
      | Streams table schema (OCC tracking) | complete | @libar-dev/platform-store/src/component/schema.ts |
      | appendToStream mutation with OCC | complete | @libar-dev/platform-store/src/component/lib.ts |
      | globalPosition atomic allocation | complete | @libar-dev/platform-store/src/component/lib.ts |
      | readStream API | complete | @libar-dev/platform-store/src/component/lib.ts |
      | readFromPosition API | complete | @libar-dev/platform-store/src/component/lib.ts |
      | getStreamVersion API | complete | @libar-dev/platform-store/src/component/lib.ts |
      | getByCorrelation API | complete | @libar-dev/platform-store/src/component/lib.ts |
      | EventStore client wrapper | complete | @libar-dev/platform-store/src/client/index.ts |
      | Event category taxonomy (domain/integration/trigger/fat) | complete | @libar-dev/platform-store/src/component/schema.ts |
      | Schema versioning support | complete | @libar-dev/platform-store/src/component/schema.ts |

  # =============================================================================
  # RULE 1: Event Immutability
  # =============================================================================

  @architect-sequence-step:1
  @architect-sequence-module:event-table
  Rule: Events are immutable once appended

    **Invariant:** Events are permanently immutable after append — no update or delete operations exist.

    Once an event is appended to a stream, it cannot be modified or deleted.
    Events form a permanent audit trail that serves as the source of truth
    for both CMS state and projection data.

    This immutability is enforced at the API level - the Event Store provides
    no update or delete operations for events.

    **Input:** EventInput -- eventId, eventType, payload, category

    **Output:** StoredEvent -- eventId, version, globalPosition

  # =============================================================================
  # RULE 2: Stream-Based Ordering
  # =============================================================================

  @architect-sequence-step:2
  @architect-sequence-module:streams
  Rule: Streams provide per-entity ordering via version numbers

    **Invariant:** Each stream version starts at 1 and increments monotonically per entity.

    Each stream represents a single entity (aggregate) and maintains its own
    version sequence starting at 1. Events within a stream are ordered by
    their version number, ensuring deterministic replay if ever needed.

    The stream is identified by (streamType, streamId) pair:
    - streamType: The entity type (e.g., "Order", "Product")
    - streamId: The unique identifier within that type

    **Input:** StoredEvent -- streamType, streamId

    **Output:** StreamVersion -- streamType, streamId, currentVersion

  # =============================================================================
  # RULE 3: Global Position for Cross-Stream Ordering
  # =============================================================================

  @architect-sequence-step:3
  @architect-sequence-module:global-position
  Rule: globalPosition enables total ordering across all streams

    **Invariant:** globalPosition is monotonically increasing and globally unique across all streams.

    While version provides per-stream ordering, globalPosition provides a
    monotonically increasing counter across ALL events from ALL streams.
    This is critical for projections that need to process events in causal order.

    The globalPosition formula ensures:
    - Globally unique positions (stream identity hash included)
    - Monotonically increasing within a stream
    - Time-ordered across streams (timestamp is primary sort key)

    Formula: timestamp * 1,000,000 + streamHash * 1,000 + (version % 1000)

    **Input:** StreamVersion -- streamType, streamId, currentVersion

    **Output:** GlobalPosition -- position, timestamp, streamHash

  # =============================================================================
  # RULE 4: Optimistic Concurrency Control
  # =============================================================================

  @architect-sequence-step:4
  @architect-sequence-module:append-mutation
  Rule: OCC prevents concurrent modification conflicts

    **Invariant:** Append succeeds only when expectedVersion matches currentVersion.

    When appending events, callers must provide an expectedVersion:
    - If expectedVersion matches the stream's currentVersion, append succeeds
    - If expectedVersion mismatches, append returns a conflict result
    - For new streams, expectedVersion = 0

    This enables safe concurrent access without locks while ensuring
    business invariants are validated against consistent state.

    **Input:** AppendArgs -- streamType, streamId, expectedVersion, events

    **Output:** AppendResult -- status, eventIds, globalPositions, newVersion

    @acceptance-criteria
    Scenario: Successful append with matching version
      Given a stream "Order" with id "ord-123" at version 5
      When appending an event with expectedVersion 5
      Then the append succeeds
      And the stream version becomes 6
      And the event receives a globalPosition

    @acceptance-criteria
    Scenario: Conflict on version mismatch
      Given a stream "Order" with id "ord-123" at version 5
      When appending an event with expectedVersion 3
      Then the append returns status "conflict"
      And the response includes currentVersion 5

  # =============================================================================
  # RULE 5: Checkpoint-Based Projection Resumption
  # =============================================================================

  @architect-sequence-step:5
  @architect-sequence-module:read-api,client-wrapper
  Rule: Checkpoints enable projection resumption with exactly-once semantics

    **Invariant:** Projections resume from lastProcessedPosition with no missed or duplicated events.

    Projections track their lastProcessedPosition (a globalPosition value).
    On restart, projections query events starting from their checkpoint,
    ensuring no events are missed and no events are processed twice.

    The readFromPosition API supports this pattern by accepting a
    starting globalPosition and returning events in order.

    **Input:** ReadFromPositionArgs -- fromPosition, limit, eventTypes

    **Output:** StoredEvents -- eventId, globalPosition, payload

    @acceptance-criteria
    Scenario: Projection resumes from checkpoint
      Given a projection with lastProcessedPosition 1000
      When reading events from position 1001
      Then only events with globalPosition > 1000 are returned
      And events are ordered by globalPosition ascending
