@orders @commands
Feature: Submit Order
  As a customer
  I want to submit my order
  So that it can be processed for fulfillment

  Background:
    Given the system is ready

  @happy-path
  Scenario: Successfully submit order with items
    Given an order "ord_submit_001" exists with status "draft"
    And the order has the following items:
      | productId | productName | quantity | unitPrice |
      | prod_A    | Widget      | 2        | 10.00     |
      | prod_B    | Gadget      | 1        | 25.00     |
    When I send a SubmitOrder command for "ord_submit_001"
    Then the command should succeed
    And the order "ord_submit_001" status should be "submitted"
    And the order total should be 45

  @validation
  Scenario: Cannot submit empty order
    Given an order "ord_empty_001" exists with status "draft"
    And the order has no items
    When I send a SubmitOrder command for "ord_empty_001"
    Then the command should be rejected with code "ORDER_HAS_NO_ITEMS"
    And the order "ord_empty_001" status should remain "draft"

  # NOTE: The following scenarios are tested in integration tests only
  # (tests/integration/orders/orders.integration.test.ts) because submitOrder
  # triggers a saga workflow which requires real Convex infrastructure.
  #
  # Integration tests cover:
  # - Cannot submit already submitted order
  # - Cannot submit cancelled order
  # - SubmitOrder idempotency with same commandId
