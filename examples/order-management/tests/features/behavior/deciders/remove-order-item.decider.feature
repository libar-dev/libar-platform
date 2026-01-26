@deciders @orders
Feature: Remove Order Item Decider
  Pure domain logic for removing an item from an order.

  The RemoveOrderItem decider validates that:
  - Order must be in draft status
  - Item with the given productId must exist in the order

  On success, it emits OrderItemRemoved and updates the items array and total.

  Background:
    Given a decider context

  @happy-path
  Scenario: Decide to remove existing item from draft order
    Given an order state with item:
      | field       | value        |
      | productId   | prod_001     |
      | productName | Test Widget  |
      | quantity    | 2            |
      | unitPrice   | 10.00        |
    When I decide to remove item with productId "prod_001"
    Then the decision should be "success"
    And the event type should be "OrderItemRemoved"
    And the data should have itemCount 0
    And the data should have totalAmount "0.0"

  @validation
  Scenario: Reject remove item when order is not in draft
    Given an order state:
      | field  | value     |
      | status | submitted |
    When I decide to remove item with productId "prod_001"
    Then the decision should be "rejected"
    And the rejection code should be "ORDER_NOT_IN_DRAFT"

  @validation
  Scenario: Reject remove when item does not exist
    Given an order state:
      | field     | value |
      | status    | draft |
      | itemCount | 0     |
    When I decide to remove item with productId "nonexistent"
    Then the decision should be "rejected"
    And the rejection code should be "ITEM_NOT_FOUND"
