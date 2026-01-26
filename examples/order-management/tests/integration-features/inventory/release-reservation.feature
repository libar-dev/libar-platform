@inventory @integration @reservation
Feature: Release Reservation (Integration)
  As the order fulfillment system
  I want to release stock reservations
  So that reserved stock becomes available again when orders are cancelled

  Background:
    Given the backend is running and clean

  @happy-path
  Scenario: Release pending reservation
    Given a product "prod-rel-int-01" exists with 20 available stock
    And a pending reservation "res-rel-int-01" exists for order "ord-rel-int-01" with:
      | productId       | quantity |
      | prod-rel-int-01 | 5        |
    When I release the reservation "res-rel-int-01" with reason "Order cancelled"
    Then the command should succeed
    And I wait for projections to process
    And the reservation "res-rel-int-01" should have status "released"
    And the product "prod-rel-int-01" should have 20 available and 0 reserved stock

  @validation
  Scenario: Reject releasing non-pending reservation
    Given a product "prod-rel-int-02" exists with 20 available stock
    And a confirmed reservation "res-rel-int-02" exists for order "ord-rel-int-02" with:
      | productId       | quantity |
      | prod-rel-int-02 | 5        |
    When I release the reservation "res-rel-int-02" with reason "Testing"
    Then the command should be rejected with code "RESERVATION_NOT_PENDING"
