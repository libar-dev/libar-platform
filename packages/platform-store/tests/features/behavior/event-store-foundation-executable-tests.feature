@architect
@architect-pattern:EventStoreFoundationExecutableTests
@architect-implements:EventStoreFoundation
@architect-status:completed
@architect-unlock-reason:refactoring-carve-out-executable-tests-for-shipped-pattern-predates-implements-convention
@architect-product-area:PlatformStore
Feature: EventStoreFoundation Executable Tests

  **Provenance:** This file was authored under the refactoring carve-out
  to expose EventStoreFoundation in the PatternGraph. The pattern was originally
  implemented before the `@architect-implements:` convention. Rule
  invariants and rationales below are transferred verbatim from
  `libar-platform/architect/specs/platform/event-store-foundation.feature`.
  Scenario bodies are shape-only stubs at file-creation time.

  **Transitional status:** This carrier is graph-continuity scaffolding,
  not runnable coverage yet. Every scenario below is intentionally tagged
  `@stub` until backlog item `T5-009` wires the harness and step
  definitions. Backlog item `T5-010` expands the current transfer set with
  concurrency and edge-case coverage once wiring is real.

  Background:
    Given the platform-store EventStore client is available

  # =============================================================================
  # RULE 1: Event Immutability
  # =============================================================================

  Rule: Events are immutable once appended

    **Invariant:** Events are permanently immutable after append — no update or delete operations exist.

    **Rationale:** Events form a permanent audit trail that serves as the
    source of truth for both CMS state and projection data. Immutability
    is enforced at the API level — the Event Store provides no update or
    delete operations for events.

    **Verified by:** Event Store client exposes no event-update API, Event Store client exposes no event-delete API

    @happy-path @stub
    Scenario: Event Store client exposes no event-update API
      Given the EventStore client surface
      When inspecting its exported operations
      Then no operation mutates a previously-appended event

    @happy-path @stub
    Scenario: Event Store client exposes no event-delete API
      Given the EventStore client surface
      When inspecting its exported operations
      Then no operation deletes a previously-appended event

  # =============================================================================
  # RULE 2: Stream-Based Ordering
  # =============================================================================

  Rule: Streams provide per-entity ordering via version numbers

    **Invariant:** Each stream version starts at 1 and increments monotonically per entity.

    **Rationale:** Each stream represents a single entity (aggregate) and
    maintains its own version sequence. Events within a stream are
    ordered by their version number, ensuring deterministic replay if
    ever needed. The stream is identified by (streamType, streamId).

    **Verified by:** First append to a new stream produces version 1, Subsequent appends increment the stream version monotonically

    @happy-path @stub
    Scenario: First append to a new stream produces version 1
      Given a stream "Order" with id "ord-stub-1" that does not exist
      When appending an event with expectedVersion 0
      Then the new stream version is 1

    @happy-path @stub
    Scenario: Subsequent appends increment the stream version monotonically
      Given a stream "Order" with id "ord-stub-1" at version 1
      When appending another event with expectedVersion 1
      Then the new stream version is 2

  # =============================================================================
  # RULE 3: Global Position for Cross-Stream Ordering
  # =============================================================================

  Rule: globalPosition enables total ordering across all streams

    **Invariant:** globalPosition is monotonically increasing and globally unique across all streams.

    **Rationale:** While version provides per-stream ordering,
    globalPosition provides a monotonically increasing counter across ALL
    events from ALL streams. This is critical for projections that need
    to process events in causal order. Formula: timestamp * 1,000,000 +
    streamHash * 1,000 + (version % 1000).

    **Verified by:** globalPosition is unique across two streams, globalPosition increases monotonically within a stream

    @happy-path @stub
    Scenario: globalPosition is unique across two streams
      Given an event appended to stream "Order/ord-A"
      And an event appended to stream "Order/ord-B"
      Then both events have distinct globalPosition values

    @happy-path @stub
    Scenario: globalPosition increases monotonically within a stream
      Given two events appended sequentially to stream "Order/ord-C"
      Then the second event's globalPosition is greater than the first

  # =============================================================================
  # RULE 4: Optimistic Concurrency Control
  # =============================================================================

  Rule: OCC prevents concurrent modification conflicts

    **Invariant:** Append succeeds only when expectedVersion matches currentVersion.

    **Rationale:** OCC enables safe concurrent access without locks while
    ensuring business invariants are validated against consistent state.
    Mismatched expectedVersion returns a conflict result rather than
    silently overwriting.

    **Verified by:** Successful append with matching version, Conflict on version mismatch

    @happy-path @stub
    Scenario: Successful append with matching version
      Given a stream "Order" with id "ord-123" at version 5
      When appending an event with expectedVersion 5
      Then the append succeeds
      And the stream version becomes 6
      And the event receives a globalPosition

    @validation @stub
    Scenario: Conflict on version mismatch
      Given a stream "Order" with id "ord-123" at version 5
      When appending an event with expectedVersion 3
      Then the append returns status "conflict"
      And the response includes currentVersion 5

  # =============================================================================
  # RULE 5: Checkpoint-Based Projection Resumption
  # =============================================================================

  Rule: Checkpoints enable projection resumption with exactly-once semantics

    **Invariant:** Projections resume from lastProcessedPosition with no missed or duplicated events.

    **Rationale:** Projections track their lastProcessedPosition (a
    globalPosition value). On restart, projections query events starting
    from their checkpoint, ensuring no events are missed and no events
    are processed twice. The readFromPosition API supports this pattern.

    **Verified by:** Projection resumes from checkpoint

    @happy-path @stub
    Scenario: Projection resumes from checkpoint
      Given a projection with lastProcessedPosition 1000
      When reading events from position 1001
      Then only events with globalPosition > 1000 are returned
      And events are ordered by globalPosition ascending
