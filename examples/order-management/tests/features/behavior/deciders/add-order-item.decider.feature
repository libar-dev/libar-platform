@deciders @orders
Feature: Add Order Item Decider
  Pure domain logic for adding an item to an order.

  The AddOrderItem decider validates that:
  - Order must be in draft status
  - Item quantity must be positive

  On success, it emits OrderItemAdded and updates the items array and total.

  Background:
    Given a decider context

  @happy-path
  Scenario: Decide to add item to draft order
    Given an order state:
      | field     | value |
      | status    | draft |
      | itemCount | 0     |
    When I decide to add item:
      | field       | value        |
      | productId   | prod_001     |
      | productName | Test Widget  |
      | quantity    | 2            |
      | unitPrice   | 10.00        |
    Then the decision should be "success"
    And the event type should be "OrderItemAdded"
    And the data should have itemCount 1
    And the data should have totalAmount "20.0"

  @validation
  Scenario: Reject add item when order is not in draft
    Given an order state:
      | field  | value     |
      | status | submitted |
    When I decide to add any item
    Then the decision should be "rejected"
    And the rejection code should be "ORDER_NOT_IN_DRAFT"

  @validation
  Scenario: Reject add item with invalid quantity
    Given an order state:
      | field  | value |
      | status | draft |
    When I decide to add item with negative quantity:
      | field       | value       |
      | productId   | prod_bad    |
      | productName | Bad Widget  |
      | quantity    | -1          |
      | unitPrice   | 10.00       |
    Then the decision should be "rejected"
    And the rejection code should be "INVALID_ORDER_ITEM"

  @happy-path
  Scenario: Accumulate items and recalculate total
    Given an order state with existing items:
      | field     | value |
      | status    | draft |
      | itemCount | 1     |
      | total     | 20.00 |
    When I decide to add item:
      | field       | value         |
      | productId   | prod_002      |
      | productName | Another Widget|
      | quantity    | 2             |
      | unitPrice   | 10.00         |
    Then the decision should be "success"
    And the data should have itemCount 2
    And the data should have totalAmount "40.0"
