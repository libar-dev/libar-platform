@inventory @commands
Feature: Release Reservation
  As the order fulfillment system
  I want to release stock reservations
  So that stock returns to available when orders are cancelled

  Background:
    Given the system is ready

  @happy-path
  Scenario: Successfully release pending reservation
    Given a product "prod_release_001" exists with 50 available and 10 reserved stock
    And a pending reservation "res_release_001" exists for order "ord_release_001" with:
      | productId        | quantity |
      | prod_release_001 | 10       |
    When I send a ReleaseReservation command for "res_release_001" with reason "Order cancelled"
    Then the command should succeed

  # NOTE: Reservation status and stock verification is done in integration tests only.
  # Projections don't run in unit tests (convex-test).

  @business-rule
  Scenario: Can release confirmed reservation (for order cancellation)
    Given a confirmed reservation "res_release_002" exists for order "ord_release_002"
    When I send a ReleaseReservation command for "res_release_002" with reason "Order cancelled after confirmation"
    Then the command should succeed

  @idempotency
  Scenario: ReleaseReservation is idempotent with same commandId
    Given a pending reservation "res_release_003" exists for order "ord_release_003"
    When I send a ReleaseReservation command twice with the same commandId for "res_release_003"
    Then the second command should return duplicate status
