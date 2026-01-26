@libar-docs
@libar-docs-implements:ReservationPattern
@libar-docs-status:active
@libar-docs-phase:20
@libar-docs-product-area:PlatformCore
@reservation
Feature: Reserve Operation

  As a platform developer
  I want to reserve unique values with TTL
  So that I can enforce uniqueness before entity creation

  This feature validates the reserve() function that claims unique
  values with automatic expiration.

  Background: Reservation System
    Given the reservation module is imported from platform-core
    And the reservation table exists

  # ============================================================================
  # Basic Reservation
  # ============================================================================

  Rule: reserve() creates a time-limited claim on a unique value

    Reservations hold a value for a specified TTL period.

    @acceptance-criteria @happy-path
    Scenario: Reserve an email address
      Given no existing reservation for "alice@example.com"
      When I call reserve({ type: 'email', value: 'alice@example.com', ttl: 300000 })
      Then I receive a reservation object
      And reservation.key equals "email:alice@example.com"
      And reservation.status equals "reserved"
      And reservation.expiresAt is 5 minutes from now

    @acceptance-criteria @happy-path
    Scenario: Reserve with correlation ID
      Given no existing reservation for "bob@example.com"
      And correlationId "corr_123"
      When I call reserve({ type: 'email', value: 'bob@example.com', ttl: 300000, correlationId })
      Then reservation.correlationId equals "corr_123"

  # ============================================================================
  # Concurrent Reservation (OCC)
  # ============================================================================

  Rule: Concurrent reservations use OCC for atomicity

    Only one concurrent reservation for the same value succeeds.

    @acceptance-criteria @happy-path
    Scenario: First reservation wins
      Given no existing reservation for "unique@example.com"
      When reservation A is created for "unique@example.com"
      And reservation B is attempted concurrently for "unique@example.com"
      Then reservation A succeeds
      And reservation B fails with "ALREADY_RESERVED"

    @acceptance-criteria @validation
    Scenario: Reserved value cannot be re-reserved
      Given an active reservation for "taken@example.com"
      When I call reserve({ type: 'email', value: 'taken@example.com', ttl: 300000 })
      Then an error is thrown with code "ALREADY_RESERVED"
      And error.existingReservationId is provided

  # ============================================================================
  # TTL Configuration
  # ============================================================================

  Rule: TTL determines reservation expiration time

    Reservations automatically become available after TTL expires.

    @acceptance-criteria @happy-path
    Scenario Outline: Different TTL values
      Given no existing reservation
      When I call reserve with ttl <ttl_ms>
      Then expiresAt is <expected_duration> from now

      Examples:
        | ttl_ms | expected_duration |
        | 60000 | 1 minute |
        | 300000 | 5 minutes |
        | 3600000 | 1 hour |

    @acceptance-criteria @validation
    Scenario: TTL must be positive
      When I call reserve({ type: 'email', value: 'test@example.com', ttl: 0 })
      Then an error is thrown with code "INVALID_TTL"

    @acceptance-criteria @validation
    Scenario: TTL has maximum limit
      When I call reserve({ type: 'email', value: 'test@example.com', ttl: 86400001 })
      Then an error is thrown with code "TTL_TOO_LONG"
      And error message mentions maximum of 24 hours

  # ============================================================================
  # TTL Boundary Testing
  # ============================================================================

  Rule: TTL boundary values are validated

    TTL validation covers edge cases at minimum and maximum boundaries.

    @acceptance-criteria @validation
    Scenario: Negative TTL is rejected
      When I call reserve({ type: 'email', value: 'negative@example.com', ttl: -1 })
      Then an error is thrown with code "INVALID_TTL"

    @acceptance-criteria @validation
    Scenario: TTL at minimum boundary succeeds
      When I call reserve({ type: 'email', value: 'minttl@example.com', ttl: 1000 })
      Then I receive a reservation object

    @acceptance-criteria @validation
    Scenario: TTL just below minimum is rejected
      When I call reserve({ type: 'email', value: 'belowmin@example.com', ttl: 999 })
      Then an error is thrown with code "INVALID_TTL"

    @acceptance-criteria @validation
    Scenario: NaN TTL is rejected
      When I call reserve with NaN TTL
      Then an error is thrown with code "INVALID_TTL"

    @acceptance-criteria @validation
    Scenario: Infinity TTL is rejected
      When I call reserve with Infinity TTL
      Then an error is thrown with code "INVALID_TTL"

  # ============================================================================
  # Input Sanitization
  # ============================================================================

  Rule: Type and value input is sanitized

    Whitespace-only inputs are rejected.

    @acceptance-criteria @validation
    Scenario: Whitespace-only type is invalid
      When I call reserve({ type: '   ', value: 'test@example.com', ttl: 300000 })
      Then an error is thrown with code "INVALID_TYPE"

    @acceptance-criteria @validation
    Scenario: Whitespace-only value is invalid
      When I call reserve({ type: 'email', value: '   ', ttl: 300000 })
      Then an error is thrown with code "INVALID_VALUE"
