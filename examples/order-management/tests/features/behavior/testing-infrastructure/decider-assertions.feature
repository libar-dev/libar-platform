@libar-docs-pattern:DeciderAssertions
@testing-infrastructure
Feature: Decider Testing Assertions

  As a developer testing deciders
  I want assertion helpers for DeciderOutput results
  So that I can write clear, consistent test assertions

  The platform-decider/testing module provides assertion helpers that work
  with the DeciderOutput discriminated union (success/rejected/failed).
  These helpers provide clear error messages when assertions fail.

  Background:
    Given the platform-decider testing module is imported

  # ============================================================================
  # Success Assertions
  # ============================================================================

  @acceptance-criteria @happy-path
  Scenario: Assert decision success
    Given a DeciderOutput with status "success"
    When I call assertDecisionSuccess(result)
    Then the assertion passes

  @acceptance-criteria @validation
  Scenario: Assert decision success fails for rejected result
    Given a DeciderOutput with status "rejected" and code "INVALID_STATE"
    When I call assertDecisionSuccess(result)
    Then the assertion fails
    And the error message contains "success"
    And the error message indicates the actual status was "rejected"

  @acceptance-criteria @happy-path
  Scenario: Extract success event from result
    Given a DeciderOutput with status "success" and event type "OrderCreated"
    When I call getSuccessEvent(result)
    Then I receive the event object
    And the event type is "OrderCreated"

  @acceptance-criteria @happy-path
  Scenario: Extract success data from result
    Given a DeciderOutput with status "success" and data containing orderId "ord-123"
    When I call getSuccessData(result)
    Then I receive an object with orderId "ord-123"

  @acceptance-criteria @happy-path
  Scenario: Extract state update from result
    Given a DeciderOutput with status "success" and state update setting status to "submitted"
    When I call getSuccessStateUpdate(result)
    Then I receive the state update object
    And the status field is "submitted"

  # ============================================================================
  # Event Assertions
  # ============================================================================

  @acceptance-criteria @happy-path
  Scenario: Assert event type matches
    Given a DeciderOutput with status "success" and event type "OrderCreated"
    When I call assertEventType(result, "OrderCreated")
    Then the assertion passes

  @acceptance-criteria @validation
  Scenario: Assert event type fails for wrong type
    Given a DeciderOutput with status "success" and event type "OrderCreated"
    When I call assertEventType(result, "OrderSubmitted")
    Then the assertion fails
    And the error message contains "OrderSubmitted"

  @acceptance-criteria @happy-path
  Scenario: Assert event payload field
    Given a DeciderOutput with success event containing customerId "cust-456"
    When I call assertEventPayload(result, "customerId", "cust-456")
    Then the assertion passes

  # ============================================================================
  # State Update Assertions
  # ============================================================================

  @acceptance-criteria @happy-path
  Scenario: Assert state update field
    Given a DeciderOutput with status "success" and state update setting status to "confirmed"
    When I call assertStateUpdate(result, "status", "confirmed")
    Then the assertion passes

  # ============================================================================
  # Rejection Assertions
  # ============================================================================

  @acceptance-criteria @happy-path
  Scenario: Assert decision rejected
    Given a DeciderOutput with status "rejected" and code "ORDER_NOT_FOUND"
    When I call assertDecisionRejected(result)
    Then the assertion passes

  @acceptance-criteria @happy-path
  Scenario: Assert rejection code matches
    Given a DeciderOutput with status "rejected" and code "INVALID_STATE"
    When I call assertRejectionCode(result, "INVALID_STATE")
    Then the assertion passes

  @acceptance-criteria @validation
  Scenario: Assert rejection code fails for wrong code
    Given a DeciderOutput with status "rejected" and code "INVALID_STATE"
    When I call assertRejectionCode(result, "NOT_FOUND")
    Then the assertion fails
    And the error message contains "INVALID_STATE"

  @acceptance-criteria @happy-path
  Scenario: Assert rejection message contains text
    Given a DeciderOutput with status "rejected" and message "Order must be in draft status"
    When I call assertRejectionMessage(result, "draft status")
    Then the assertion passes

  # ============================================================================
  # Failure Assertions
  # ============================================================================

  @acceptance-criteria @happy-path
  Scenario: Assert decision failed
    Given a DeciderOutput with status "failed" and reason "Database connection error"
    When I call assertDecisionFailed(result)
    Then the assertion passes

  @acceptance-criteria @happy-path
  Scenario: Assert failure reason matches
    Given a DeciderOutput with status "failed" and reason "Validation failed"
    When I call assertFailureReason(result, "Validation")
    Then the assertion passes
