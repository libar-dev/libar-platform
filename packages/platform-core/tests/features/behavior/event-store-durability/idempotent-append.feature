@libar-docs
@libar-docs-implements:EventStoreDurability
@acceptance-criteria
Feature: Idempotent Event Append

  Ensures events are only appended once even when the append operation is retried.
  This pattern prevents duplicate events from corrupting projections and causing
  double-processing in downstream systems.

  # ============================================================================
  # Idempotency Key Builder Functions
  # ============================================================================

  @happy-path
  Scenario: Command idempotency key uses commandType:entityId:commandId format
    When building command idempotency key with type "SubmitOrder", entity "ord-123", command "cmd-456"
    Then the idempotency key should be "SubmitOrder:ord-123:cmd-456"

  @happy-path
  Scenario: Action idempotency key uses actionType:entityId format
    When building action idempotency key with type "payment" and entity "ord-123"
    Then the idempotency key should be "payment:ord-123"

  @happy-path
  Scenario: Saga step idempotency key uses sagaType:sagaId:step format
    When building saga step idempotency key with type "OrderFulfillment", id "saga-789", step "reserveStock"
    Then the idempotency key should be "OrderFulfillment:saga-789:reserveStock"

  @happy-path
  Scenario: Scheduled job idempotency key uses jobType:scheduleId:timestamp format
    When building scheduled job idempotency key with type "expireReservations", schedule "job-001", timestamp 1704067200
    Then the idempotency key should be "expireReservations:job-001:1704067200"

  # ============================================================================
  # Idempotent Append Function
  # ============================================================================

  @happy-path
  Scenario: First append with idempotency key succeeds
    Given no existing event for idempotency key "payment:ord-123"
    When calling idempotentAppendEvent with key "payment:ord-123"
    Then the append result status should be "appended"
    And a new event ID should be generated

  @happy-path
  Scenario: Duplicate append returns existing event
    Given an existing event with idempotency key "payment:ord-123" and ID "evt-456"
    When calling idempotentAppendEvent with key "payment:ord-123"
    Then the append result status should be "duplicate"
    And the result event ID should be "evt-456"

  @happy-path
  Scenario: Different idempotency keys create separate events
    Given no existing event for idempotency key "payment:ord-456"
    When calling idempotentAppendEvent with key "payment:ord-456"
    Then the append result status should be "appended"

  # ============================================================================
  # OCC Conflict Handling
  # ============================================================================

  @edge-case
  Scenario: OCC conflict with duplicate on recheck returns duplicate
    Given no initial event but duplicate appears on recheck for key "payment:ord-123"
    When calling idempotentAppendEvent with OCC conflict
    Then the append result status should be "duplicate"

  @edge-case
  Scenario: True OCC conflict throws error
    Given no event exists and no duplicate on recheck for key "payment:ord-123"
    When calling idempotentAppendEvent with true OCC conflict
    Then an OCC conflict error should be thrown with version info
