@inventory @commands
Feature: Reserve Stock
  As the order fulfillment system
  I want to reserve stock for orders
  So that stock is held until order is confirmed or cancelled

  Background:
    Given the system is ready

  @happy-path
  Scenario: Successfully reserve available stock
    Given a product "prod_reserve_001" exists with 100 available stock
    When I send a ReserveStock command with:
      | field         | value              |
      | reservationId | res_001            |
      | orderId       | ord_reserve_001    |
    And the reservation includes:
      | productId        | quantity |
      | prod_reserve_001 | 10       |
    Then the command should succeed

  @happy-path
  Scenario: Reserve multiple items atomically
    Given a product "prod_reserve_002" exists with 50 available stock
    And a product "prod_reserve_003" exists with 30 available stock
    When I send a ReserveStock command with:
      | field         | value           |
      | reservationId | res_002         |
      | orderId       | ord_reserve_002 |
    And the reservation includes:
      | productId        | quantity |
      | prod_reserve_002 | 5        |
      | prod_reserve_003 | 3        |
    Then the command should succeed

  @business-rule
  Scenario: Reservation fails when insufficient stock
    Given a product "prod_reserve_004" exists with 5 available stock
    When I send a ReserveStock command with:
      | field         | value           |
      | reservationId | res_003         |
      | orderId       | ord_reserve_003 |
    And the reservation includes:
      | productId        | quantity |
      | prod_reserve_004 | 10       |
    Then the command should fail with reason "Insufficient stock"

  @business-rule
  Scenario: Multi-item reservation is all-or-nothing
    Given a product "prod_reserve_005" exists with 100 available stock
    And a product "prod_reserve_006" exists with 2 available stock
    When I send a ReserveStock command with:
      | field         | value           |
      | reservationId | res_004         |
      | orderId       | ord_reserve_004 |
    And the reservation includes:
      | productId        | quantity |
      | prod_reserve_005 | 5        |
      | prod_reserve_006 | 10       |
    Then the command should fail with reason "Insufficient stock"

  @validation
  Scenario: Cannot reserve non-existent product
    Given no product exists with ID "prod_ghost"
    When I send a ReserveStock command with:
      | field         | value           |
      | reservationId | res_005         |
      | orderId       | ord_reserve_005 |
    And the reservation includes:
      | productId  | quantity |
      | prod_ghost | 5        |
    # Non-existent products are treated as having 0 stock (all-or-nothing pattern)
    Then the command should fail with reason "Insufficient stock"

  @idempotency
  Scenario: ReserveStock is idempotent with same commandId
    Given a product "prod_reserve_007" exists with 100 available stock
    When I send a ReserveStock command twice with the same commandId for reservation "res_006"
    Then the second command should return duplicate status

  # NOTE: Stock level verification (available/reserved quantities) is done in
  # integration tests only. Projections don't run in unit tests (convex-test).
