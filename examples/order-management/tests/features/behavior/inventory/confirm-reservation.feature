@inventory @commands
Feature: Confirm Reservation
  As the order fulfillment system
  I want to confirm stock reservations
  So that reserved stock is permanently allocated to orders

  Background:
    Given the system is ready

  @happy-path
  Scenario: Successfully confirm pending reservation
    Given a product "prod_confirm_001" exists with 50 available and 10 reserved stock
    And a pending reservation "res_confirm_001" exists for order "ord_confirm_001"
    When I send a ConfirmReservation command for "res_confirm_001"
    Then the command should succeed

  # NOTE: Reservation status verification is done in integration tests only.
  # Projections don't run in unit tests (convex-test).

  @validation
  Scenario: Cannot confirm non-existent reservation
    Given no reservation exists with ID "res_ghost"
    When I send a ConfirmReservation command for "res_ghost"
    Then the command should be rejected with code "RESERVATION_NOT_FOUND"

  @business-rule
  Scenario: Cannot confirm already confirmed reservation
    Given a confirmed reservation "res_confirm_002" exists for order "ord_confirm_002"
    When I send a ConfirmReservation command for "res_confirm_002"
    Then the command should be rejected with code "RESERVATION_NOT_PENDING"

  @idempotency
  Scenario: ConfirmReservation is idempotent with same commandId
    Given a pending reservation "res_confirm_003" exists for order "ord_confirm_003"
    When I send a ConfirmReservation command twice with the same commandId for "res_confirm_003"
    Then the second command should return duplicate status
