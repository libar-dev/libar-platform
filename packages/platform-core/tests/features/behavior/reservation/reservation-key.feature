@libar-docs
@libar-docs-implements:ReservationPattern
@libar-docs-status:active
@libar-docs-phase:20
@libar-docs-product-area:PlatformCore
@reservation
Feature: Reservation Key Format

  As a platform developer
  I want reservation keys to be type-scoped
  So that different uniqueness constraints don't conflict

  This feature validates the reservation key format (type:value)
  that enables multiple types of uniqueness constraints.

  Background: Reservation System
    Given the reservation module is imported from platform-core

  # ============================================================================
  # Key Format
  # ============================================================================

  Rule: Reservation key combines type and value

    Format: type:value (e.g., email:alice@example.com)

    @acceptance-criteria @happy-path
    Scenario: Email reservation key format
      When I call reserve({ type: 'email', value: 'alice@example.com', ttl: 300000 })
      Then reservation.key equals "email:alice@example.com"

    @acceptance-criteria @happy-path
    Scenario: Username reservation key format
      When I call reserve({ type: 'username', value: 'alice123', ttl: 300000 })
      Then reservation.key equals "username:alice123"

    @acceptance-criteria @happy-path
    Scenario: Custom type reservation key format
      When I call reserve({ type: 'phone', value: '+1-555-0123', ttl: 300000 })
      Then reservation.key equals "phone:+1-555-0123"

  # ============================================================================
  # Type Scoping
  # ============================================================================

  Rule: Different types are independent namespaces

    The same value can be reserved under different types.

    @acceptance-criteria @happy-path
    Scenario: Same value different types
      Given a reservation for email "alice"
      When I call reserve({ type: 'username', value: 'alice', ttl: 300000 })
      Then reservation succeeds
      And two reservations exist with different keys:
        | key |
        | email:alice |
        | username:alice |

    @acceptance-criteria @happy-path
    Scenario: Independent type uniqueness
      Given a confirmed reservation for email "taken@example.com"
      When I call reserve({ type: 'recovery_email', value: 'taken@example.com', ttl: 300000 })
      Then reservation succeeds
      And key is "recovery_email:taken@example.com"

  # ============================================================================
  # Key Validation
  # ============================================================================

  Rule: Type and value must be valid strings

    Keys must be well-formed for database indexing.

    @acceptance-criteria @validation
    Scenario: Type is required
      When I call reserve({ value: 'test@example.com', ttl: 300000 }) without type
      Then an error is thrown with code "TYPE_REQUIRED"

    @acceptance-criteria @validation
    Scenario: Value is required
      When I call reserve({ type: 'email', ttl: 300000 }) without value
      Then an error is thrown with code "VALUE_REQUIRED"

    @acceptance-criteria @validation
    Scenario: Empty type is invalid
      When I call reserve({ type: '', value: 'test@example.com', ttl: 300000 })
      Then an error is thrown with code "INVALID_TYPE"

    @acceptance-criteria @validation
    Scenario: Empty value is invalid
      When I call reserve({ type: 'email', value: '', ttl: 300000 })
      Then an error is thrown with code "INVALID_VALUE"

  # ============================================================================
  # Key Lookup
  # ============================================================================

  Rule: Reservations can be looked up by key

    Efficient lookup by the composite key.

    @acceptance-criteria @happy-path
    Scenario: Find reservation by key
      Given an active reservation for email "lookup@example.com"
      When I call findReservation({ key: 'email:lookup@example.com' })
      Then I receive the reservation object

    @acceptance-criteria @happy-path
    Scenario: Find reservation by type and value
      Given an active reservation for email "lookup@example.com"
      When I call findReservation({ type: 'email', value: 'lookup@example.com' })
      Then I receive the reservation object

    @acceptance-criteria @edge-case
    Scenario: Non-existent key returns null
      When I call findReservation({ key: 'email:nonexistent@example.com' })
      Then I receive null

  # ============================================================================
  # Separator Character Handling
  # ============================================================================

  Rule: Separator character is handled correctly

    Type cannot contain colon, but value can.

    @acceptance-criteria @validation
    Scenario: Type containing colon is rejected
      When I call reserve({ type: 'email:backup', value: 'test@example.com', ttl: 300000 })
      Then an error is thrown with code "INVALID_TYPE"

    @acceptance-criteria @happy-path
    Scenario: Value can contain colon (URL with port)
      When I call reserve({ type: 'url', value: 'https://example.com:8080', ttl: 300000 })
      Then I receive a reservation object
      And reservation.key equals "url:https://example.com:8080"
