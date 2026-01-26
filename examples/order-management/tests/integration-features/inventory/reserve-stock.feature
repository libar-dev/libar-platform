@inventory @integration @reservation
Feature: Reserve Stock (Integration)
  As the order fulfillment system
  I want to reserve stock for orders
  So that stock is held until order is confirmed or cancelled

  Background:
    Given the backend is running and clean

  @happy-path
  Scenario: Reserve stock successfully
    Given a product "prod-res-int-01" exists with 100 available stock
    When I reserve stock for order "ord-res-int-01" with:
      | productId       | quantity |
      | prod-res-int-01 | 10       |
    Then the command should succeed
    And I wait for projections to process
    And the product "prod-res-int-01" should have 90 available and 10 reserved stock
    And the reservation should have status "pending"

  @happy-path
  Scenario: Reserve stock for multiple items
    Given a product "prod-res-int-02" exists with 50 available stock
    And a product "prod-res-int-03" exists with 30 available stock
    When I reserve stock for order "ord-res-int-02" with:
      | productId       | quantity |
      | prod-res-int-02 | 5        |
      | prod-res-int-03 | 3        |
    Then the command should succeed
    And I wait for projections to process
    And the product "prod-res-int-02" should have 45 available and 5 reserved stock
    And the product "prod-res-int-03" should have 27 available and 3 reserved stock

  @validation
  Scenario: Reject when insufficient stock
    Given a product "prod-res-int-04" exists with 5 available stock
    When I reserve stock for order "ord-res-int-03" with:
      | productId       | quantity |
      | prod-res-int-04 | 10       |
    Then the command should return failed status with reason "Insufficient stock"
    And the product "prod-res-int-04" should have 5 available and 0 reserved stock

  @validation
  Scenario: All-or-nothing reservation when one item fails
    Given a product "prod-res-int-05" exists with 100 available stock
    And a product "prod-res-int-06" exists with 2 available stock
    When I reserve stock for order "ord-res-int-04" with:
      | productId       | quantity |
      | prod-res-int-05 | 5        |
      | prod-res-int-06 | 10       |
    Then the command should return failed status with reason "Insufficient stock"
    And the product "prod-res-int-05" should have 100 available and 0 reserved stock
    And the product "prod-res-int-06" should have 2 available and 0 reserved stock

  @validation
  Scenario: Reject for non-existent product
    When I reserve stock for order "ord-res-int-05" with:
      | productId          | quantity |
      | prod-nonexistent   | 5        |
    Then the command should return failed status with reason "Insufficient stock"

  @validation
  Scenario: Return failed status when reservation fails
    Given a product "prod-res-int-07" exists with 3 available stock
    When I reserve stock for order "ord-res-int-06" with:
      | productId       | quantity |
      | prod-res-int-07 | 10       |
    Then the command should return failed status
    And the result should have an eventId for the failure event

  @idempotency
  Scenario: Idempotent with same commandId
    Given a product "prod-res-int-08" exists with 100 available stock
    When I reserve stock for order "ord-res-int-07" with commandId "cmd-res-idem-01":
      | productId       | quantity |
      | prod-res-int-08 | 10       |
    And I reserve stock for order "ord-res-int-07" with commandId "cmd-res-idem-01":
      | productId       | quantity |
      | prod-res-int-08 | 10       |
    Then the second command should return duplicate status
    And I wait for projections to process
    And the product "prod-res-int-08" should have 90 available and 10 reserved stock
