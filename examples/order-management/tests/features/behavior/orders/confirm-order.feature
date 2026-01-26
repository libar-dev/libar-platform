@orders @commands
Feature: Confirm Order
  As a system administrator
  I want to confirm submitted orders
  So that they can be marked as confirmed

  Background:
    Given the system is ready

  @happy-path
  Scenario: Successfully confirm a submitted order
    Given an order "ord_confirm_001" exists with status "submitted"
    When I send a ConfirmOrder command for "ord_confirm_001"
    Then the command should succeed
    And the order "ord_confirm_001" status should be "confirmed"

  @validation
  Scenario: Cannot confirm a draft order
    Given an order "ord_confirm_002" exists with status "draft"
    When I send a ConfirmOrder command for "ord_confirm_002"
    Then the command should be rejected with code "ORDER_NOT_SUBMITTED"
    And the order "ord_confirm_002" status should remain "draft"

  @validation
  Scenario: Cannot confirm an already confirmed order
    Given an order "ord_confirm_003" exists with status "confirmed"
    When I send a ConfirmOrder command for "ord_confirm_003"
    Then the command should be rejected with code "ORDER_NOT_SUBMITTED"

  @validation
  Scenario: Cannot confirm a cancelled order
    Given an order "ord_confirm_004" exists with status "cancelled"
    When I send a ConfirmOrder command for "ord_confirm_004"
    Then the command should be rejected with code "ORDER_NOT_SUBMITTED"

  @validation
  Scenario: Cannot confirm a non-existent order
    Given no order exists with ID "ord_nonexistent_001"
    When I send a ConfirmOrder command for "ord_nonexistent_001"
    Then the command should be rejected with code "ORDER_NOT_FOUND"

  @idempotency
  Scenario: ConfirmOrder is idempotent with same commandId
    Given an order "ord_confirm_005" exists with status "submitted"
    When I send a ConfirmOrder command twice with the same commandId for "ord_confirm_005"
    Then the order should only be confirmed once
