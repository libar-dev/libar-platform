@inventory @integration @query
Feature: Query Inventory (Integration)
  As a user
  I want to query inventory information
  So that I can view product availability and reservations

  Background:
    Given the backend is running and clean

  @happy-path
  Scenario: List products returns all products
    Given the following products exist:
      | productId   | productName | sku         | availableQuantity |
      | prod-qry-01 | Widget A    | SKU-QRY-001 | 10                |
      | prod-qry-02 | Widget B    | SKU-QRY-002 | 20                |
      | prod-qry-03 | Widget C    | SKU-QRY-003 | 30                |
    When I list all products
    Then the result should contain at least 3 products
    And the result should include product "prod-qry-01" with name "Widget A"
    And the result should include product "prod-qry-02" with name "Widget B"
    And the result should include product "prod-qry-03" with name "Widget C"

  @happy-path
  Scenario: Get stock availability for product
    Given a product "prod-avail-01" exists with:
      | availableQuantity | reservedQuantity |
      | 50                | 10               |
    When I get stock availability for product "prod-avail-01"
    Then the availability should show 50 available and 10 reserved

  @happy-path
  Scenario: Check availability for multiple items
    Given the following products exist:
      | productId     | productName | sku           | availableQuantity |
      | prod-check-01 | Widget A    | SKU-CHECK-001 | 20                |
      | prod-check-02 | Widget B    | SKU-CHECK-002 | 5                 |
    When I check availability for items:
      | productId     | quantity |
      | prod-check-01 | 10       |
      | prod-check-02 | 3        |
    Then all items should be available
    When I check availability for items:
      | productId     | quantity |
      | prod-check-01 | 10       |
      | prod-check-02 | 10       |
    Then not all items should be available

  @happy-path
  Scenario: Get reservation by order ID
    Given a product "prod-res-01" exists with 20 stock
    And a pending reservation exists for order "ord-qry-01" with:
      | productId   | quantity |
      | prod-res-01 | 5        |
    When I get reservation by order ID "ord-qry-01"
    Then the reservation should exist for order "ord-qry-01"
    And the reservation status should be "pending"
