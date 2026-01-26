@orders @commands @pattern:CommandOrchestrator
Feature: Add Items to Order
  As a customer
  I want to add items to my order
  So that I can purchase multiple products

  Background:
    Given the system is ready

  @happy-path
  Scenario: Add single item to empty draft order
    Given an order "ord_items_001" exists with status "draft"
    And the order has no items
    When I add an item to order "ord_items_001":
      | productId | productName | quantity | unitPrice |
      | prod_001  | Widget      | 2        | 15.00     |
    Then the command should succeed
    And the order should have 1 item
    And the order total should be 30

  @happy-path
  Scenario: Add multiple items to draft order
    Given an order "ord_items_002" exists with status "draft"
    And the order has no items
    When I add items to order "ord_items_002":
      | productId | productName | quantity | unitPrice |
      | prod_001  | Widget      | 2        | 10.00     |
      | prod_002  | Gadget      | 1        | 25.00     |
      | prod_003  | Gizmo       | 3        | 5.00      |
    Then the command should succeed
    And the order should have 3 items
    And the order total should be 60

  @validation
  Scenario: Cannot add items to submitted order
    Given an order "ord_items_003" exists with status "submitted"
    When I add an item to order "ord_items_003":
      | productId | productName | quantity | unitPrice |
      | prod_001  | Widget      | 1        | 10.00     |
    Then the command should be rejected with code "ORDER_NOT_IN_DRAFT"

  @validation
  Scenario: Cannot add items to cancelled order
    Given an order "ord_items_004" exists with status "cancelled"
    When I add an item to order "ord_items_004":
      | productId | productName | quantity | unitPrice |
      | prod_001  | Widget      | 1        | 10.00     |
    Then the command should be rejected with code "ORDER_NOT_IN_DRAFT"

  @validation
  Scenario: Cannot add item with zero quantity
    Given an order "ord_items_005" exists with status "draft"
    When I add an item to order "ord_items_005":
      | productId | productName | quantity | unitPrice |
      | prod_001  | Widget      | 0        | 10.00     |
    Then the command should be rejected

  @validation
  Scenario: Cannot add item with negative quantity
    Given an order "ord_items_006" exists with status "draft"
    When I add an item to order "ord_items_006":
      | productId | productName | quantity | unitPrice |
      | prod_001  | Widget      | -1       | 10.00     |
    Then the command should be rejected

  @validation
  Scenario: Cannot add item with negative price
    Given an order "ord_items_007" exists with status "draft"
    When I add an item to order "ord_items_007":
      | productId | productName | quantity | unitPrice |
      | prod_001  | Widget      | 1        | -10.00    |
    Then the command should be rejected
