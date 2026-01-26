@deciders @inventory
Feature: Reserve Stock Decider
  Pure domain logic for reserving stock for an order.

  The ReserveStock decider validates that:
  - Items array must not be empty
  - All products must have sufficient available stock

  On success, it emits StockReserved.
  On business failure (insufficient stock), it returns failed with ReservationFailed event.

  Background:
    Given a decider context

  @happy-path
  Scenario: Decide to reserve stock when all products have sufficient availability
    Given products with available stock:
      | productId | availableQuantity |
      | prod_001  | 100               |
      | prod_002  | 50                |
    When I decide to reserve stock for order "ord_001" with items:
      | productId | quantity |
      | prod_001  | 10       |
      | prod_002  | 5        |
    Then the decision should be "success"
    And the event type should be "StockReserved"
    And the data should have orderId "ord_001"
    And the data should have itemCount 2

  @business-failure
  Scenario: Fail reservation when one product has insufficient stock
    Given products with available stock:
      | productId | availableQuantity |
      | prod_001  | 100               |
      | prod_002  | 3                 |
    When I decide to reserve stock for order "ord_002" with items:
      | productId | quantity |
      | prod_001  | 10       |
      | prod_002  | 5        |
    Then the decision should be "failed"
    And the failure reason should contain "INSUFFICIENT_STOCK"
    And the failure event type should be "ReservationFailed"

  @business-failure
  Scenario: Fail reservation when product does not exist
    Given products with available stock:
      | productId | availableQuantity |
      | prod_001  | 100               |
    When I decide to reserve stock for order "ord_003" with items:
      | productId       | quantity |
      | prod_001        | 10       |
      | prod_not_found  | 5        |
    Then the decision should be "failed"
    And the failure reason should contain "INSUFFICIENT_STOCK"

  @validation
  Scenario: Reject reservation with empty items
    Given products with available stock:
      | productId | availableQuantity |
      | prod_001  | 100               |
    When I decide to reserve stock for order "ord_004" with empty items
    Then the decision should be "rejected"
    And the rejection code should be "EMPTY_RESERVATION"
