Feature: withPMCheckpoint Helper

  Tests the PM checkpoint-based idempotency pattern including
  skip already-processed events (globalPosition check), skip terminal
  states (completed PM), process new events with lifecycle transitions,
  command emission tracking, dead letter recording on failures,
  and the createPMCheckpointHelper factory.

  # ============================================================================
  # Rule: New Event Processing
  # ============================================================================

  Rule: withPMCheckpoint processes new events and updates PM state

    **Invariant:** Events with globalPosition greater than the checkpoint must be processed.
    **Verified by:** Scenarios below covering no-state, higher-position, and state-update cases.

    @acceptance-criteria @happy-path
    Scenario: Process event when no PM state exists
      Given no PM state exists for "orderNotification" instance "ord_123"
      When I call withPMCheckpoint with pm "orderNotification" instance "ord_123" position 1000 event "evt_001" correlation "corr_001"
      Then the PM result status is "processed"
      And the PM result commandsEmitted contains:
        | command          |
        | SendNotification |
      And the process callback was invoked 1 time
      And the emitCommands callback was invoked 1 time
      And the emitted commands list has 1 entry

    @acceptance-criteria @happy-path
    Scenario: Process event when globalPosition exceeds checkpoint
      Given a PM state exists for "orderNotification" instance "ord_123" at position 1000 with status "idle"
      When I call withPMCheckpoint with pm "orderNotification" instance "ord_123" position 2000 event "evt_002" correlation "corr_002"
      Then the PM result status is "processed"
      And the process callback was invoked 1 time

    @acceptance-criteria @happy-path
    Scenario: PM state is updated after processing
      Given no PM state exists for "orderNotification" instance "ord_123"
      When I call withPMCheckpoint with pm "orderNotification" instance "ord_123" position 1000 event "evt_001" correlation "corr_001"
      Then the saved PM state for "orderNotification" instance "ord_123" has fields:
        | field               | value     |
        | status              | completed |
        | lastGlobalPosition  | 1000      |
        | commandsEmitted     | 1         |

  # ============================================================================
  # Rule: Idempotency - Duplicate Event Skipping
  # ============================================================================

  Rule: withPMCheckpoint skips events at or below the checkpoint position

    **Invariant:** Events with globalPosition less than or equal to the checkpoint must be skipped.
    **Verified by:** Equal-position and lower-position scenarios.

    @acceptance-criteria @validation
    Scenario: Skip event when globalPosition equals checkpoint
      Given a PM state exists for "orderNotification" instance "ord_123" at position 1000 with status "idle"
      When I call withPMCheckpoint with pm "orderNotification" instance "ord_123" position 1000 event "evt_001" correlation "corr_001"
      Then the PM result status is "skipped"
      And the PM result skip reason is "already_processed"
      And the process callback was not invoked
      And the emitCommands callback was not invoked

    @acceptance-criteria @validation
    Scenario: Skip event when globalPosition is less than checkpoint
      Given a PM state exists for "orderNotification" instance "ord_123" at position 2000 with status "idle"
      When I call withPMCheckpoint with pm "orderNotification" instance "ord_123" position 1000 event "evt_001" correlation "corr_001"
      Then the PM result status is "skipped"
      And the PM result skip reason is "already_processed"
      And the process callback was not invoked

  # ============================================================================
  # Rule: Terminal State Handling
  # ============================================================================

  Rule: withPMCheckpoint skips events when PM is in a terminal state

    **Invariant:** A completed PM must not process any further events.
    **Verified by:** Scenario with completed PM receiving a new higher-position event.

    @acceptance-criteria @validation
    Scenario: Skip event when PM is in completed state
      Given a PM state exists for "orderNotification" instance "ord_123" at position 1000 with status "completed"
      When I call withPMCheckpoint with pm "orderNotification" instance "ord_123" position 2000 event "evt_002" correlation "corr_002"
      Then the PM result status is "skipped"
      And the PM result skip reason is "terminal_state"
      And the process callback was not invoked

  # ============================================================================
  # Rule: Instance Isolation
  # ============================================================================

  Rule: withPMCheckpoint maintains separate state per PM instance

    **Invariant:** Different instance IDs must have independent checkpoint state.
    **Verified by:** Two instances processed independently with different positions.

    @acceptance-criteria @happy-path
    Scenario: Separate instances are processed independently
      Given no PM state exists for "orderNotification" instance "ord_001"
      And no PM state exists for "orderNotification" instance "ord_002"
      When I call withPMCheckpoint with pm "orderNotification" instance "ord_001" position 1000 event "evt_001" correlation "corr_001"
      And I call withPMCheckpoint with pm "orderNotification" instance "ord_002" position 500 event "evt_002" correlation "corr_002"
      Then the saved PM state for "orderNotification" instance "ord_001" has lastGlobalPosition 1000
      And the saved PM state for "orderNotification" instance "ord_002" has lastGlobalPosition 500

  # ============================================================================
  # Rule: Retry After Failure
  # ============================================================================

  Rule: withPMCheckpoint allows retry after emitCommands failure

    **Invariant:** A failed PM must allow re-processing of the same event on retry.
    **Verified by:** Retry-after-emit-failure and stuck-processing-state scenarios.

    @acceptance-criteria @happy-path
    Scenario: Retry succeeds after emitCommands failure
      Given no PM state exists for "orderNotification" instance "ord_123"
      When I call withPMCheckpoint with pm "orderNotification" instance "ord_123" position 100 event "evt_001" correlation "corr_001" and emitCommands fails on first call
      Then the first call PM result status is "failed"
      And the first call PM result error contains "queue unavailable"
      And the saved PM state for "orderNotification" instance "ord_123" has status "failed"
      When I retry withPMCheckpoint with pm "orderNotification" instance "ord_123" position 100 event "evt_001" correlation "corr_001"
      Then the retry PM result status is "processed"
      And the retry PM result commandsEmitted contains:
        | command          |
        | SendNotification |
      And the emitted commands list has 1 entry

    @acceptance-criteria @happy-path
    Scenario: Retry succeeds when PM is stuck in processing state
      Given a PM state exists for "orderNotification" instance "ord_123" at position 100 with status "processing"
      When I call withPMCheckpoint with pm "orderNotification" instance "ord_123" position 100 event "evt_001" correlation "corr_001"
      Then the PM result status is "processed"
      And the PM result commandsEmitted contains:
        | command          |
        | SendNotification |
      And the emitted commands list has 1 entry

  # ============================================================================
  # Rule: Input Validation
  # ============================================================================

  Rule: withPMCheckpoint validates input parameters

    **Invariant:** Invalid globalPosition values must be rejected without invoking process.
    **Verified by:** Negative position, zero position, and first real event scenarios.

    @acceptance-criteria @validation
    Scenario: Reject negative globalPosition
      Given no PM state exists for "orderNotification" instance "ord_123"
      When I call withPMCheckpoint with pm "orderNotification" instance "ord_123" position -1 event "evt_001" correlation "corr_001"
      Then the PM result status is "failed"
      And the PM result error contains "Invalid globalPosition"
      And the PM result error contains "-1"
      And the process callback was not invoked
      And the emitCommands callback was not invoked

    @acceptance-criteria @validation
    Scenario: GlobalPosition zero is treated as already processed
      Given no PM state exists for "orderNotification" instance "ord_123"
      When I call withPMCheckpoint with pm "orderNotification" instance "ord_123" position 0 event "evt_001" correlation "corr_001"
      Then the PM result status is "skipped"
      And the PM result skip reason is "already_processed"

    @acceptance-criteria @happy-path
    Scenario: First real event after initialization is processed
      Given no PM state exists for "orderNotification" instance "ord_123"
      When I call withPMCheckpoint with pm "orderNotification" instance "ord_123" position 1000000000 event "evt_001" correlation "corr_001"
      Then the PM result status is "processed"
      And the process callback was invoked 1 time

  # ============================================================================
  # Rule: Error Handling and Dead Letters
  # ============================================================================

  Rule: withPMCheckpoint records dead letters on failure

    **Invariant:** Failures in process or emitCommands must record a dead letter and update PM status.
    **Verified by:** Process-throws, emitCommands-throws, and commandsFailed counter scenarios.

    @acceptance-criteria @validation
    Scenario: Dead letter recorded when process throws
      Given no PM state exists for "orderNotification" instance "ord_123"
      When I call withPMCheckpoint with pm "orderNotification" instance "ord_123" position 1000 event "evt_001" correlation "corr_001" and process throws "Handler failed: external service unavailable"
      Then the PM result status is "failed"
      And the PM result error contains "external service unavailable"
      And the dead letters list has 1 entry
      And the dead letter at index 0 has pmName "orderNotification" and instanceId "ord_123"
      And the saved PM state for "orderNotification" instance "ord_123" has status "failed"

    @acceptance-criteria @validation
    Scenario: Dead letter recorded when emitCommands throws
      Given no PM state exists for "orderNotification" instance "ord_123"
      When I call withPMCheckpoint with pm "orderNotification" instance "ord_123" position 1000 event "evt_001" correlation "corr_001" and emitCommands throws "Command emission failed: queue unavailable"
      Then the PM result status is "failed"
      And the dead letters list has 1 entry
      And the dead letter at index 0 error contains "Command emission failed"

    @acceptance-criteria @validation
    Scenario: commandsFailed counter is incremented on failure
      Given no PM state exists for "orderNotification" instance "ord_123"
      When I call withPMCheckpoint with pm "orderNotification" instance "ord_123" position 1000 event "evt_001" correlation "corr_001" and emitCommands throws "Emission failed"
      Then the saved PM state for "orderNotification" instance "ord_123" has commandsFailed 1

  # ============================================================================
  # Rule: Command Tracking
  # ============================================================================

  Rule: withPMCheckpoint tracks emitted commands accurately

    **Invariant:** The commandsEmitted counter and result must reflect the actual commands produced.
    **Verified by:** Multi-command, result-types, and empty-command scenarios.

    @acceptance-criteria @happy-path
    Scenario: commandsEmitted counter tracks multiple commands
      Given no PM state exists for "orderNotification" instance "ord_123"
      When I call withPMCheckpoint with pm "orderNotification" instance "ord_123" position 1000 event "evt_001" correlation "corr_001" and process returns 3 commands
      Then the saved PM state for "orderNotification" instance "ord_123" has commandsEmitted 3

    @acceptance-criteria @happy-path
    Scenario: Result contains emitted command types
      Given no PM state exists for "orderNotification" instance "ord_123"
      When I call withPMCheckpoint with pm "orderNotification" instance "ord_123" position 1000 event "evt_001" correlation "corr_001" and process returns commands "SendEmail,UpdateCRM"
      Then the PM result status is "processed"
      And the PM result commandsEmitted contains:
        | command   |
        | SendEmail |
        | UpdateCRM |

    @acceptance-criteria @validation
    Scenario: Empty command list produces no-op processed result
      Given no PM state exists for "orderNotification" instance "ord_123"
      When I call withPMCheckpoint with pm "orderNotification" instance "ord_123" position 1000 event "evt_001" correlation "corr_001" and process returns 0 commands
      Then the PM result status is "processed"
      And the PM result commandsEmitted is empty
      And the emitCommands callback was not invoked

  # ============================================================================
  # Rule: createPMCheckpointHelper Factory
  # ============================================================================

  Rule: createPMCheckpointHelper creates a reusable helper with bound storage

    **Invariant:** The factory must produce a helper that behaves identically to direct withPMCheckpoint calls.
    **Verified by:** Basic usage and idempotency-preserved scenarios.

    @acceptance-criteria @happy-path
    Scenario: Helper processes event and updates state
      When I create a PM checkpoint helper and call it with pm "orderNotification" instance "ord_123" position 1000 event "evt_001" correlation "corr_001"
      Then the helper result status is "processed"
      And the helper emitted commands list has 1 entry
      And the helper PM state for "orderNotification" instance "ord_123" has lastGlobalPosition 1000

    @acceptance-criteria @validation
    Scenario: Helper maintains PM idempotency semantics
      When I create a PM checkpoint helper and call it twice with pm "orderNotification" instance "ord_123" position 1000 event "evt_001" correlation "corr_001"
      Then the second helper call result status is "skipped"
      And the helper emitted commands list has 1 entry
      And the helper first emitted command type is "Cmd1"
