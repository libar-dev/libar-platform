@integration @durability @poison-event
Feature: Poison Event Handling (App Integration)
  As a developer using event sourcing
  I want malformed events to be quarantined after repeated failures
  So that a single bad event doesn't block all downstream projections

  Poison event handling prevents infinite retry loops by tracking
  failed events and quarantining them after a configured number
  of attempts. Operators can then investigate and manually
  reprocess or ignore the quarantined events.

  Background:
    Given the backend is running and clean
    And poison event handling is configured with maxAttempts 3

  Rule: Failed projections are tracked in poisonEvents table

    @failure-tracking
    Scenario: First failure creates pending poison record
      Given a test event "evt-poison-001" of type "OrderCreated"
      And the projection handler will fail
      When processing the event through withPoisonEventHandling
      Then a poison record should exist in the database
      And the record status should be "pending"
      And the attemptCount should be 1
      And the error should be captured

    @failure-tracking
    Scenario: Second failure increments attempt count
      Given a pending poison record for event "evt-poison-002" with 1 attempt
      And the projection handler will fail
      When processing the event through withPoisonEventHandling
      Then the attemptCount should be 2
      And the record status should still be "pending"
      And the handler should have re-thrown the error

  Rule: Events are quarantined after max attempts

    @quarantine
    Scenario: Event quarantined after 3 failures
      Given a pending poison record for event "evt-poison-003" with 2 attempts
      And the projection handler will fail
      When processing the event through withPoisonEventHandling
      Then the record status should be "quarantined"
      And the attemptCount should be 3
      And quarantinedAt timestamp should be set
      And the error should be swallowed

    @quarantine
    Scenario: Quarantine captures error details
      Given a test event "evt-poison-004" of type "OrderCreated"
      And the projection handler will fail with message "Invalid order format"
      When processing reaches maxAttempts failures
      Then the poison record should contain error "Invalid order format"
      And the record should be queryable by projection name

  Rule: Quarantined events are skipped

    @skip
    Scenario: Quarantined event bypasses handler completely
      Given event "evt-poison-005" is already quarantined
      And the projection handler would fail if called
      When processing the event through withPoisonEventHandling
      Then the underlying projection handler should NOT be called
      And the operation should complete without error
      And no new error should be recorded

  Rule: Unquarantine enables reprocessing

    @recovery
    Scenario: Unquarantine resets status for retry
      Given event "evt-poison-006" is quarantined with 3 attempts
      When calling unquarantine for the event
      Then the record status should be "replayed"
      And the attemptCount should be reset to 0
      And the event can be processed again

    @recovery
    Scenario: Unquarantine of non-quarantined event returns not_quarantined
      Given a pending poison record for event "evt-poison-007" with 1 attempt
      When calling unquarantine for the event
      Then the result should be "not_quarantined"
      And the record should remain unchanged

  Rule: Stats provide visibility into poison events

    @monitoring
    Scenario: Stats show quarantined event counts by projection
      Given events "evt-p-a" and "evt-p-b" are quarantined for projection "orderSummary"
      And event "evt-p-c" is quarantined for projection "inventoryView"
      When querying poison event stats
      Then totalQuarantined should be 3
      And byProjection should show 2 for "orderSummary"
      And byProjection should show 1 for "inventoryView"
