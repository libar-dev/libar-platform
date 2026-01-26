@libar-docs
@libar-docs-implements:ReservationPattern
@libar-docs-status:active
@libar-docs-phase:20
@libar-docs-product-area:PlatformCore
@reservation
Feature: Release Operation

  As a platform developer
  I want to release reservations before they expire
  So that values become immediately available when users cancel

  This feature validates the release() function and TTL-based
  automatic expiration via cron.

  Background: Reservation System
    Given the reservation module is imported from platform-core
    And an active reservation exists

  # ============================================================================
  # Manual Release
  # ============================================================================

  Rule: release() frees a reservation immediately

    Users can cancel and free the reserved value without waiting for TTL.

    @acceptance-criteria @happy-path
    Scenario: Release active reservation
      Given an active reservation with id "res_123" for "cancel@example.com"
      When I call release({ reservationId: 'res_123' })
      Then release succeeds
      And reservation.status equals "released"
      And "cancel@example.com" is available for new reservations

    @acceptance-criteria @happy-path
    Scenario: Released value can be immediately reserved
      Given I released reservation for "reuse@example.com"
      When I call reserve({ type: 'email', value: 'reuse@example.com', ttl: 300000 })
      Then a new reservation is created successfully

  # ============================================================================
  # Release Validation
  # ============================================================================

  Rule: Only active reservations can be released

    Confirmed or already released reservations cannot be released.

    @acceptance-criteria @validation
    Scenario: Cannot release confirmed reservation
      Given a confirmed reservation with id "res_confirmed"
      When I call release({ reservationId: 'res_confirmed' })
      Then an error is thrown with code "RESERVATION_ALREADY_CONFIRMED"

    @acceptance-criteria @validation
    Scenario: Cannot release already released reservation
      Given a released reservation with id "res_released"
      When I call release({ reservationId: 'res_released' })
      Then an error is thrown with code "RESERVATION_ALREADY_RELEASED"

    @acceptance-criteria @validation
    Scenario: Cannot release expired reservation
      Given an expired reservation with id "res_expired"
      When I call release({ reservationId: 'res_expired' })
      Then an error is thrown with code "RESERVATION_ALREADY_EXPIRED"

    @acceptance-criteria @validation
    Scenario: Cannot release non-existent reservation
      When I call release({ reservationId: 'res_nonexistent' })
      Then an error is thrown with code "RESERVATION_NOT_FOUND"

  # ============================================================================
  # Automatic Expiration (Cron)
  # ============================================================================

  Rule: TTL expiration cron marks expired reservations

    Background cron job handles automatic expiration.

    @acceptance-criteria @happy-path
    Scenario: Expired reservations are marked by cron
      Given a reservation with TTL that expired 1 minute ago
      When the TTL expiration cron runs
      Then reservation.status equals "expired"
      And the value is available for new reservations

    @acceptance-criteria @happy-path
    Scenario: Cron does not affect active reservations
      Given a reservation with 10 minutes remaining TTL
      When the TTL expiration cron runs
      Then reservation.status remains "reserved"

    @acceptance-criteria @happy-path
    Scenario: Cron does not affect confirmed reservations
      Given a confirmed reservation
      When the TTL expiration cron runs
      Then reservation.status remains "confirmed"
