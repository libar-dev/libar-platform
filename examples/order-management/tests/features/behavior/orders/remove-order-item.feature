@orders @commands
Feature: Remove Items from Order
  As a customer
  I want to remove items from my order
  So that I can adjust my purchase before submitting

  Background:
    Given the system is ready

  @happy-path
  Scenario: Remove item from draft order with multiple items
    Given an order "ord_remove_001" exists with status "draft"
    And the order has the following items:
      | productId | productName | quantity | unitPrice |
      | prod_001  | Widget      | 2        | 10.00     |
      | prod_002  | Gadget      | 1        | 25.00     |
    When I remove item "prod_001" from order "ord_remove_001"
    Then the command should succeed
    And the order should have 1 item
    And the order total should be 25

  @happy-path
  Scenario: Remove last item from draft order
    Given an order "ord_remove_002" exists with status "draft"
    And the order has the following items:
      | productId | productName | quantity | unitPrice |
      | prod_001  | Widget      | 1        | 15.00     |
    When I remove item "prod_001" from order "ord_remove_002"
    Then the command should succeed
    And the order should have 0 items
    And the order total should be 0

  @validation
  Scenario: Cannot remove item from submitted order
    Given an order "ord_remove_003" exists with status "submitted"
    And the order has the following items:
      | productId | productName | quantity | unitPrice |
      | prod_001  | Widget      | 1        | 10.00     |
    When I remove item "prod_001" from order "ord_remove_003"
    Then the command should be rejected with code "ORDER_NOT_IN_DRAFT"

  @validation
  Scenario: Cannot remove item from cancelled order
    Given an order "ord_remove_004" exists with status "cancelled"
    And the order has the following items:
      | productId | productName | quantity | unitPrice |
      | prod_001  | Widget      | 1        | 10.00     |
    When I remove item "prod_001" from order "ord_remove_004"
    Then the command should be rejected with code "ORDER_NOT_IN_DRAFT"

  @validation
  Scenario: Cannot remove item from confirmed order
    Given an order "ord_remove_005" exists with status "confirmed"
    And the order has the following items:
      | productId | productName | quantity | unitPrice |
      | prod_001  | Widget      | 1        | 10.00     |
    When I remove item "prod_001" from order "ord_remove_005"
    Then the command should be rejected with code "ORDER_NOT_IN_DRAFT"

  @validation
  Scenario: Cannot remove non-existent item
    Given an order "ord_remove_006" exists with status "draft"
    And the order has the following items:
      | productId | productName | quantity | unitPrice |
      | prod_001  | Widget      | 1        | 10.00     |
    When I remove item "prod_nonexistent" from order "ord_remove_006"
    Then the command should be rejected with code "ITEM_NOT_FOUND"

  @idempotency
  Scenario: RemoveOrderItem is idempotent with same commandId
    Given an order "ord_remove_007" exists with status "draft"
    And the order has the following items:
      | productId | productName | quantity | unitPrice |
      | prod_001  | Widget      | 2        | 10.00     |
      | prod_002  | Gadget      | 1        | 25.00     |
    When I remove item "prod_001" from order "ord_remove_007" with commandId "cmd_remove_007"
    Then the command should succeed
    And I remove item "prod_001" from order "ord_remove_007" with commandId "cmd_remove_007"
    Then the command should return duplicate result
