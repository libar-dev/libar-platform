@libar-docs
@libar-docs-implements:EventStoreDurability
@acceptance-criteria
Feature: Poison Event Handling

  Handles events that repeatedly fail projection processing.
  After N failures, events are quarantined and skipped to prevent infinite retry loops.

  # ============================================================================
  # Poison Event Wrapper - Success Path
  # ============================================================================

  @happy-path
  Scenario: Successful processing creates no poison record
    Given a poison event handler wrapping a successful projection
    When processing an event
    Then no poison record should be created
    And the handler should complete successfully

  # ============================================================================
  # Poison Event Wrapper - Failure Tracking
  # ============================================================================

  @validation
  Scenario: First failure records attempt but does not quarantine
    Given a poison event handler with maxAttempts 3 and no existing record
    When processing an event that throws an error
    Then a poison record should be created with attemptCount 1
    And the record status should be "pending"
    And the original error should be re-thrown

  @validation
  Scenario: Event becomes quarantined after max retries
    Given a poison event handler with maxAttempts 3 and existing record with 2 attempts
    When processing an event that throws an error
    Then the poison record should be updated to status "quarantined"
    And the error should NOT be re-thrown

  @validation
  Scenario: Quarantined event is silently skipped
    Given a poison event handler with a quarantined record for the event
    When processing the quarantined event
    Then the projection handler should NOT be called
    And no error should be thrown

  # ============================================================================
  # Alert Callback
  # ============================================================================

  @happy-path
  Scenario: onQuarantine callback invoked when alertOnQuarantine is true
    Given a poison handler with alertOnQuarantine true and onQuarantine callback
    When an event becomes quarantined
    Then the onQuarantine callback should be invoked with event details

  @validation
  Scenario: onQuarantine NOT invoked when alertOnQuarantine is false
    Given a poison handler with alertOnQuarantine false
    When an event becomes quarantined
    Then the onQuarantine callback should NOT be invoked

  # ============================================================================
  # Query Functions
  # ============================================================================

  @happy-path
  Scenario: isEventQuarantined returns true for quarantined event
    Given a quarantined poison record for event "evt-123"
    When checking if event "evt-123" is quarantined for projection "orderSummary"
    Then the result should be true

  @happy-path
  Scenario: isEventQuarantined returns false for non-quarantined event
    Given a pending poison record for event "evt-123"
    When checking if event "evt-123" is quarantined for projection "orderSummary"
    Then the result should be false

  @happy-path
  Scenario: getPoisonEventRecord returns normalized record
    Given a poison record with attemptCount 3 and error "Test error"
    When getting poison record for the event
    Then the result should have attempts 3 and lastError "Test error"

  @validation
  Scenario: getPoisonEventRecord returns null for non-existent event
    Given no poison record exists for event "evt-999"
    When getting poison record for event "evt-999"
    Then the result should be null

  # ============================================================================
  # Unquarantine
  # ============================================================================

  @happy-path
  Scenario: unquarantineEvent clears quarantine status
    Given a quarantined poison record for event "evt-123"
    When calling unquarantineEvent
    Then the result status should be "unquarantined"
    And the record should be updated to status "replayed" with attemptCount 0

  @validation
  Scenario: unquarantineEvent returns not_found for missing event
    Given no poison record exists for event "evt-999"
    When calling unquarantineEvent for event "evt-999"
    Then the result status should be "not_found"

  @validation
  Scenario: unquarantineEvent returns not_quarantined for pending event
    Given a pending poison record for event "evt-123"
    When calling unquarantineEvent
    Then the result status should be "not_quarantined"

  # ============================================================================
  # List and Stats
  # ============================================================================

  @happy-path
  Scenario: listQuarantinedEvents returns quarantined records
    Given 3 quarantined poison records
    When listing quarantined events
    Then the result should contain 3 records with eventId, projectionName, and attempts

  @happy-path
  Scenario: listQuarantinedEvents filters by projection
    Given quarantined records for multiple projections
    When listing quarantined events with projectionName "orderSummary"
    Then the query should filter by projection name

  @happy-path
  Scenario: getPoisonEventStats returns aggregated statistics
    Given poison stats with totalQuarantined 10 and byProjection orderSummary:7, inventory:3
    When getting poison event stats
    Then the result totalQuarantined should be 10
    And byProjection should contain orderSummary:7 and inventory:3
