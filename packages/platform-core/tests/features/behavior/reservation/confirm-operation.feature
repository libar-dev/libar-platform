@libar-docs
@libar-docs-implements:ReservationPattern
@libar-docs-status:active
@libar-docs-phase:20
@libar-docs-product-area:PlatformCore
@reservation
Feature: Confirm Operation

  As a platform developer
  I want to confirm reservations when entities are created
  So that the reserved value becomes permanently associated

  This feature validates the confirm() function that converts
  a temporary reservation into a permanent link to an entity.

  Background: Reservation System
    Given the reservation module is imported from platform-core
    And an active reservation exists for "alice@example.com"

  # ============================================================================
  # Basic Confirmation
  # ============================================================================

  Rule: confirm() links reservation to created entity

    Successful confirmation makes the reservation permanent.

    @acceptance-criteria @happy-path
    Scenario: Confirm reservation with entity ID
      Given an active reservation with id "res_123" for "alice@example.com"
      When I call confirm({ reservationId: 'res_123', entityId: 'user_456' })
      Then confirmation succeeds
      And reservation.status equals "confirmed"
      And reservation.entityId equals "user_456"
      And reservation.confirmedAt is set

    @acceptance-criteria @happy-path
    Scenario: Confirmed reservation is permanent
      Given a confirmed reservation for "alice@example.com"
      When I query the reservation
      Then expiresAt is null (no expiration)
      And status equals "confirmed"

  # ============================================================================
  # Confirmation Validation
  # ============================================================================

  Rule: Only active reservations can be confirmed

    Expired or already confirmed reservations cannot be confirmed.

    @acceptance-criteria @validation
    Scenario: Cannot confirm expired reservation
      Given an expired reservation with id "res_expired"
      When I call confirm({ reservationId: 'res_expired', entityId: 'user_789' })
      Then an error is thrown with code "RESERVATION_ALREADY_EXPIRED"

    @acceptance-criteria @validation
    Scenario: Cannot confirm already confirmed reservation
      Given a confirmed reservation with id "res_confirmed"
      When I call confirm({ reservationId: 'res_confirmed', entityId: 'user_999' })
      Then an error is thrown with code "RESERVATION_ALREADY_CONFIRMED"

    @acceptance-criteria @validation
    Scenario: Cannot confirm non-existent reservation
      When I call confirm({ reservationId: 'res_nonexistent', entityId: 'user_000' })
      Then an error is thrown with code "RESERVATION_NOT_FOUND"

    @acceptance-criteria @validation
    Scenario: Cannot confirm released reservation
      Given a released reservation with id "res_released"
      When I call confirm({ reservationId: 'res_released', entityId: 'user_123' })
      Then an error is thrown with code "RESERVATION_ALREADY_RELEASED"

  # ============================================================================
  # Entity Association
  # ============================================================================

  Rule: Entity ID must be provided for confirmation

    The confirmed reservation must link to a real entity.

    @acceptance-criteria @validation
    Scenario: Entity ID is required
      Given an active reservation with id "res_123"
      When I call confirm({ reservationId: 'res_123' }) without entityId
      Then an error is thrown with code "ENTITY_ID_REQUIRED"

    @acceptance-criteria @happy-path
    Scenario: Entity ID can be any string identifier
      Given an active reservation with id "res_123"
      When I call confirm({ reservationId: 'res_123', entityId: 'custom_id_format' })
      Then confirmation succeeds
      And reservation.entityId equals "custom_id_format"
