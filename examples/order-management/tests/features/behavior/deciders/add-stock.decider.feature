@deciders @inventory
Feature: Add Stock Decider
  Pure domain logic for adding stock to an existing product.

  The AddStock decider validates that:
  - Quantity must be positive

  On success, it emits StockAdded and increases availableQuantity.

  Background:
    Given a decider context

  @happy-path
  Scenario: Decide to add stock to product
    Given an inventory state:
      | field             | value        |
      | productId         | prod_001     |
      | availableQuantity | 50           |
      | reservedQuantity  | 10           |
    When I decide to add stock with quantity 25
    Then the decision should be "success"
    And the event type should be "StockAdded"
    And the data should have newAvailableQuantity 75
    And the data should have quantity 25

  @happy-path
  Scenario: Add stock with reason
    Given an inventory state:
      | field             | value        |
      | productId         | prod_002     |
      | availableQuantity | 100          |
    When I decide to add stock with quantity 50 and reason "Restocking from supplier"
    Then the decision should be "success"
    And the event payload should have reason "Restocking from supplier"

  @validation
  Scenario: Reject add stock with zero quantity
    Given an inventory state:
      | field             | value        |
      | productId         | prod_003     |
      | availableQuantity | 50           |
    When I decide to add stock with quantity 0
    Then the decision should be "rejected"
    And the rejection code should be "INVALID_QUANTITY"

  @validation
  Scenario: Reject add stock with negative quantity
    Given an inventory state:
      | field             | value        |
      | productId         | prod_004     |
      | availableQuantity | 50           |
    When I decide to add stock with quantity -10
    Then the decision should be "rejected"
    And the rejection code should be "INVALID_QUANTITY"
