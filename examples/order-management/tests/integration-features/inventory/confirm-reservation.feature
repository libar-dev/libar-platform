@inventory @integration @reservation
Feature: Confirm Reservation (Integration)
  As the order fulfillment system
  I want to confirm stock reservations
  So that reserved stock becomes committed to the order

  Background:
    Given the backend is running and clean

  @happy-path
  Scenario: Confirm pending reservation
    Given a product "prod-conf-int-01" exists with 20 available stock
    And a pending reservation "res-conf-int-01" exists for order "ord-conf-int-01" with:
      | productId        | quantity |
      | prod-conf-int-01 | 5        |
    When I confirm the reservation "res-conf-int-01"
    Then the command should succeed
    And I wait for projections to process
    And the reservation "res-conf-int-01" should have status "confirmed"

  @validation
  Scenario: Reject confirming already confirmed reservation
    Given a product "prod-conf-int-02" exists with 20 available stock
    And a confirmed reservation "res-conf-int-02" exists for order "ord-conf-int-02" with:
      | productId        | quantity |
      | prod-conf-int-02 | 5        |
    When I confirm the reservation "res-conf-int-02"
    Then the command should be rejected with code "RESERVATION_NOT_PENDING"

  @validation
  Scenario: Reject confirming non-existent reservation
    When I confirm the reservation "res-nonexistent-01"
    Then the command should be rejected with code "RESERVATION_NOT_FOUND"
