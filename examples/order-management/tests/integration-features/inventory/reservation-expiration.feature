@inventory @integration @reservation @expiration
Feature: Reservation Expiration (Integration)
  As the order fulfillment system
  I want expired reservations to be automatically released
  So that reserved stock becomes available again when orders are not completed in time

  Background:
    Given the backend is running and clean

  @expiration
  Scenario: Expire pending reservations past TTL
    Given a product "prod-exp-int-01" exists with 25 available stock
    And an expired pending reservation "res-exp-int-01" exists for order "ord-exp-int-01" with:
      | productId       | quantity |
      | prod-exp-int-01 | 5        |
    When I trigger the reservation expiration process
    Then the expiration process should have processed at least 1 reservation
    And I wait for projections to process
    And the reservation "res-exp-int-01" should have status "expired"
    And the product "prod-exp-int-01" should have 25 available and 0 reserved stock

  @expiration
  Scenario: Skip confirmed reservations
    Given a product "prod-exp-int-02" exists with 25 available stock
    And an expired confirmed reservation "res-exp-int-02" exists for order "ord-exp-int-02" with:
      | productId       | quantity |
      | prod-exp-int-02 | 5        |
    When I trigger the reservation expiration process
    And I wait for 1000 milliseconds
    Then the reservation "res-exp-int-02" should have status "confirmed"
    And the product "prod-exp-int-02" should have 20 available and 5 reserved stock

  @expiration
  Scenario: Skip reservations not yet expired
    Given a product "prod-exp-int-03" exists with 25 available stock
    And a future pending reservation "res-exp-int-03" exists for order "ord-exp-int-03" with:
      | productId       | quantity |
      | prod-exp-int-03 | 5        |
    When I trigger the reservation expiration process
    And I wait for 1000 milliseconds
    Then the reservation "res-exp-int-03" should have status "pending"
    And the product "prod-exp-int-03" should have 20 available and 5 reserved stock

  @expiration
  Scenario: Batch expiration of multiple reservations
    Given a product "prod-exp-int-04" exists with 65 available stock
    And an expired pending reservation "res-exp-int-04a" exists for order "ord-exp-int-04a" with:
      | productId       | quantity |
      | prod-exp-int-04 | 5        |
    And an expired pending reservation "res-exp-int-04b" exists for order "ord-exp-int-04b" with:
      | productId       | quantity |
      | prod-exp-int-04 | 5        |
    And an expired pending reservation "res-exp-int-04c" exists for order "ord-exp-int-04c" with:
      | productId       | quantity |
      | prod-exp-int-04 | 5        |
    When I trigger the reservation expiration process
    Then the expiration process should have processed 3 reservations
    And I wait for projections to process
    And the reservation "res-exp-int-04a" should have status "expired"
    And the reservation "res-exp-int-04b" should have status "expired"
    And the reservation "res-exp-int-04c" should have status "expired"
    And the product "prod-exp-int-04" should have 65 available and 0 reserved stock
