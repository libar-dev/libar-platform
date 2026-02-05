@orders @commands
Feature: Cancel Order
  As a customer
  I want to cancel my order
  So that I don't have to complete the purchase

  Background:
    Given the system is ready

  @happy-path
  Scenario: Cancel draft order
    Given an order "ord_cancel_001" exists with status "draft"
    When I send a CancelOrder command for "ord_cancel_001" with reason "Changed my mind"
    Then the command should succeed
    And the order "ord_cancel_001" status should be "cancelled"

  @happy-path
  Scenario: Cancel submitted order
    Given an order "ord_cancel_002" exists with status "submitted"
    When I send a CancelOrder command for "ord_cancel_002" with reason "Found better price"
    Then the command should succeed
    And the order "ord_cancel_002" status should be "cancelled"

  @business-rule
  Scenario: Cannot cancel already cancelled order
    Given an order "ord_cancel_003" exists with status "cancelled"
    When I send a CancelOrder command for "ord_cancel_003" with reason "Double cancel"
    Then the command should be rejected with code "ORDER_ALREADY_CANCELLED"

  @happy-path
  Scenario: Cancel confirmed order
    Given an order "ord_cancel_004" exists with status "confirmed"
    When I send a CancelOrder command for "ord_cancel_004" with reason "Changed mind after confirmation"
    Then the command should succeed
    And the order "ord_cancel_004" status should be "cancelled"

  @validation
  Scenario: Cannot cancel non-existent order
    Given no order exists with ID "ord_cancel_nonexistent"
    When I send a CancelOrder command for "ord_cancel_nonexistent" with reason "Test"
    Then the command should be rejected with code "ORDER_NOT_FOUND"

  @idempotency
  Scenario: CancelOrder is idempotent with same commandId
    Given an order "ord_cancel_005" exists with status "draft"
    When I send a CancelOrder command twice with the same commandId for "ord_cancel_005"
    Then the order should only be cancelled once
