Feature: withCheckpoint Projection Idempotency

  Tests the checkpoint-based projection idempotency pattern including
  skip already-processed events, process new events, atomic checkpoint
  updates, and the createCheckpointHelper factory.

  # ============================================================================
  # Rule: New Event Processing
  # ============================================================================

  Rule: withCheckpoint processes events that have not been seen before
    Invariant: Events with globalPosition greater than the checkpoint must be processed
    Verified by: Scenarios below

    @acceptance-criteria @happy-path
    Scenario: Process event when no checkpoint exists
      Given no checkpoint exists for partition "ord_123"
      When I call withCheckpoint with projection "orderSummary" partition "ord_123" position 1000 event "evt_001"
      Then the result status is "processed"
      And the process callback was invoked 1 time
      And the updateCheckpoint callback was invoked 1 time
      And the processed events list contains:
        | event           |
        | event_processed |

    @acceptance-criteria @happy-path
    Scenario: Process event when globalPosition exceeds checkpoint
      Given a checkpoint exists for partition "ord_123" at position 1000 with event "evt_001"
      When I call withCheckpoint with projection "orderSummary" partition "ord_123" position 2000 event "evt_002"
      Then the result status is "processed"
      And the process callback was invoked 1 time

    @acceptance-criteria @happy-path
    Scenario: Checkpoint is updated after processing
      Given no checkpoint exists for partition "ord_123"
      When I call withCheckpoint with projection "orderSummary" partition "ord_123" position 1000 event "evt_001"
      Then the saved checkpoint for partition "ord_123" has all fields:
        | field               | value        |
        | projectionName      | orderSummary |
        | partitionKey        | ord_123      |
        | lastGlobalPosition  | 1000         |
        | lastEventId         | evt_001      |
      And the saved checkpoint updatedAt is recent

  # ============================================================================
  # Rule: Duplicate Event Skipping
  # ============================================================================

  Rule: withCheckpoint skips events at or below the checkpoint position
    Invariant: Events with globalPosition less than or equal to the checkpoint must be skipped
    Verified by: Scenarios below

    @acceptance-criteria @validation
    Scenario: Skip event when globalPosition equals checkpoint
      Given a checkpoint exists for partition "ord_123" at position 1000 with event "evt_001"
      When I call withCheckpoint with projection "orderSummary" partition "ord_123" position 1000 event "evt_001"
      Then the result status is "skipped"
      And the process callback was not invoked
      And the updateCheckpoint callback was not invoked

    @acceptance-criteria @validation
    Scenario: Skip event when globalPosition is less than checkpoint
      Given a checkpoint exists for partition "ord_123" at position 2000 with event "evt_002"
      When I call withCheckpoint with projection "orderSummary" partition "ord_123" position 1000 event "evt_001"
      Then the result status is "skipped"
      And the process callback was not invoked

  # ============================================================================
  # Rule: Partition Isolation
  # ============================================================================

  Rule: withCheckpoint maintains separate checkpoints per partition key
    Invariant: Checkpoint state for one partition must not affect another partition
    Verified by: Scenarios below

    @acceptance-criteria @happy-path
    Scenario: Separate checkpoints per partition
      Given no checkpoint exists for partition "ord_001"
      And no checkpoint exists for partition "ord_002"
      When I process partition "ord_001" with projection "orderSummary" position 1000 event "evt_001"
      And I process partition "ord_002" with projection "orderSummary" position 500 event "evt_002"
      Then both partitions were processed
      And the saved checkpoint for partition "ord_001" has lastGlobalPosition 1000
      And the saved checkpoint for partition "ord_002" has lastGlobalPosition 500

    @acceptance-criteria @happy-path
    Scenario: Same position in different partitions does not cause skip
      Given a checkpoint exists for partition "ord_001" at position 1000 with event "evt_001"
      When I call withCheckpoint with projection "orderSummary" partition "ord_002" position 1000 event "evt_002"
      Then the result status is "processed"
      And the process callback was invoked 1 time

  # ============================================================================
  # Rule: Error Handling
  # ============================================================================

  Rule: withCheckpoint does not update checkpoint when processing fails
    Invariant: A failed process callback must leave the checkpoint unchanged
    Verified by: Scenarios below

    @acceptance-criteria @validation
    Scenario: Checkpoint not updated when process throws
      Given no checkpoint exists for partition "ord_123"
      When I call withCheckpoint with a failing process for partition "ord_123" position 1000 event "evt_001"
      Then the call rejects with "Process failed: database unavailable"
      And the updateCheckpoint callback was not invoked
      And no checkpoint exists in store for partition "ord_123"

    @acceptance-criteria @validation
    Scenario: Retry succeeds after process failure
      Given no checkpoint exists for partition "ord_123"
      When I call withCheckpoint with a transiently failing process for partition "ord_123" position 1000 event "evt_001"
      Then the first attempt rejects with "Transient failure"
      And the retry attempt succeeds with status "processed"
      And the processed events list contains:
        | event            |
        | success_on_retry |
      And the saved checkpoint for partition "ord_123" has lastGlobalPosition 1000

  # ============================================================================
  # Rule: Checkpoint Data Integrity
  # ============================================================================

  Rule: withCheckpoint stores all checkpoint fields correctly
    Invariant: The updateCheckpoint callback must receive the full ProjectionCheckpoint
    Verified by: Scenarios below

    @acceptance-criteria @happy-path
    Scenario: All checkpoint fields stored correctly
      Given no checkpoint exists for partition "prod_xyz"
      When I call withCheckpoint with projection "productCatalog" partition "prod_xyz" position 12345 event "evt_abc123"
      Then updateCheckpoint was called with checkpoint matching:
        | field               | value          |
        | projectionName      | productCatalog |
        | partitionKey        | prod_xyz       |
        | lastGlobalPosition  | 12345          |
        | lastEventId         | evt_abc123     |

  # ============================================================================
  # Rule: createCheckpointHelper Factory
  # ============================================================================

  Rule: createCheckpointHelper creates a reusable pre-configured helper
    Invariant: The factory must produce a helper with identical checkpoint semantics
    Verified by: Scenarios below

    @acceptance-criteria @happy-path
    Scenario: Helper processes and stores checkpoint
      When I create a checkpoint helper and process partition "ord_123" position 1000 event "evt_001"
      Then the helper result status is "processed"
      And the helper processed events list contains:
        | event     |
        | processed |
      And the helper checkpoint for partition "ord_123" has lastGlobalPosition 1000

    @acceptance-criteria @happy-path
    Scenario: Helper maintains checkpoint semantics across calls
      When I create a checkpoint helper and run a three-call sequence on partition "ord_123"
      Then the second call was skipped
      And the helper processed events list contains:
        | event |
        | first |
        | third |

  # ============================================================================
  # Rule: Pure Functions - shouldProcessEvent
  # ============================================================================

  Rule: shouldProcessEvent returns true only when event position exceeds checkpoint
    Invariant: Only events with strictly greater globalPosition pass the check
    Verified by: Scenarios below

    @acceptance-criteria @happy-path
    Scenario: shouldProcessEvent position comparisons
      Then shouldProcessEvent returns expected results for:
        | eventPosition | checkpointPosition | expected |
        | 1000          | 500                | true     |
        | 1000          | 1000               | false    |
        | 500           | 1000               | false    |
        | 1             | 0                  | true     |
        | 0             | -1                 | true     |
        | 1             | -1                 | true     |

  # ============================================================================
  # Rule: Pure Functions - createInitialCheckpoint
  # ============================================================================

  Rule: createInitialCheckpoint creates a checkpoint with sentinel values
    Invariant: Initial checkpoint must use -1 for position and empty string for eventId
    Verified by: Scenarios below

    @acceptance-criteria @happy-path
    Scenario: Initial checkpoint has sentinel values
      When I create an initial checkpoint for projection "orderSummary" partition "ord_123"
      Then the initial checkpoint has all fields:
        | field               | value        |
        | projectionName      | orderSummary |
        | partitionKey        | ord_123      |
        | lastGlobalPosition  | -1           |
        | lastEventId         |              |
      And the initial checkpoint updatedAt is greater than 0

    @acceptance-criteria @happy-path
    Scenario: Each initial checkpoint gets a unique updatedAt
      When I create two initial checkpoints with a delay
      Then the second checkpoint updatedAt is greater than or equal to the first
