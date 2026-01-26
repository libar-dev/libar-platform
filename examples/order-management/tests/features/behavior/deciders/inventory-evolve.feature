@deciders @inventory @evolve
Feature: Inventory Evolve Functions
  Pure state transition functions for inventory events.

  These evolve functions apply events to produce new state,
  enabling deterministic event replay and projection rebuilding.

  Background:
    Given a decider context

  # ==========================================================================
  # ProductCreated Event
  # ==========================================================================

  @evolve
  Scenario: Evolve null state with ProductCreated event
    Given no existing inventory state
    When I evolve with ProductCreated event:
      | field       | value             |
      | productId   | prod_001          |
      | productName | Test Widget       |
      | sku         | SKU-001           |
      | unitPrice   | 29.99             |
    Then the evolved state should have productId "prod_001"
    And the evolved state should have productName "Test Widget"
    And the evolved state should have sku "SKU-001"
    And the evolved state should have unitPrice "29.99"
    And the evolved state should have availableQuantity 0
    And the evolved state should have reservedQuantity 0
    And the evolved state should have version 1

  # ==========================================================================
  # StockAdded Event
  # ==========================================================================

  @evolve
  Scenario: Evolve inventory state with StockAdded event
    Given an inventory state:
      | field             | value        |
      | productId         | prod_001     |
      | availableQuantity | 50           |
      | reservedQuantity  | 10           |
    When I evolve with StockAdded event with quantity 25
    Then the evolved state should have availableQuantity 75
    And the evolved state should have reservedQuantity 10

  @evolve
  Scenario: Evolve inventory from zero stock
    Given an inventory state:
      | field             | value        |
      | productId         | prod_002     |
      | availableQuantity | 0            |
      | reservedQuantity  | 0            |
    When I evolve with StockAdded event with quantity 100
    Then the evolved state should have availableQuantity 100

  # ==========================================================================
  # StockReserved Event (Hybrid Pattern)
  # ==========================================================================
  # Note: evolveReserveStockForProduct operates on a single product at a time.
  # The handler calls it once per product in the reservation.

  @evolve
  Scenario: Evolve inventory state with StockReserved event
    Given an inventory state:
      | field             | value    |
      | productId         | prod_001 |
      | availableQuantity | 100      |
      | reservedQuantity  | 0        |
    When I evolve with StockReserved event for productId "prod_001" with quantity 25
    Then the evolved state should have availableQuantity 75
    And the evolved state should have reservedQuantity 25

  @evolve
  Scenario: Evolve inventory state when product not in reservation
    Given an inventory state:
      | field             | value    |
      | productId         | prod_999 |
      | availableQuantity | 50       |
      | reservedQuantity  | 10       |
    When I evolve with StockReserved event for productId "prod_001" with quantity 25
    Then the evolved state should have availableQuantity 50
    And the evolved state should have reservedQuantity 10

  # ==========================================================================
  # ReservationFailed Event
  # ==========================================================================
  # Failed reservations do not change inventory state - stock levels unchanged.

  @evolve
  Scenario: Evolve inventory state with ReservationFailed event (no change)
    Given an inventory state:
      | field             | value    |
      | productId         | prod_001 |
      | availableQuantity | 100      |
      | reservedQuantity  | 0        |
    When I evolve with ReservationFailed event
    Then the evolved state should have availableQuantity 100
    And the evolved state should have reservedQuantity 0
