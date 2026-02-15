@unit-test
Feature: Reservation Invariants

  As a developer working with the inventory context
  I want reservation invariant functions to enforce domain rules
  So that invalid reservation state is rejected consistently

  These are pure unit tests for reservation invariant functions:
  procedural assertions, item validation, InventoryInvariantError,
  declarative invariants (check/assert/validate), and invariant sets.

  # ============================================================================
  # Procedural Assertions: assertReservationExists
  # ============================================================================

  Rule: assertReservationExists throws when reservation is null or undefined

    **Invariant:** A reservation must exist before any operation
    **Rationale:** Guards against operating on missing aggregate state
    **Verified by:** Exists no throw, Null throws, Undefined throws

    @acceptance-criteria @happy-path
    Scenario: Does not throw when reservation exists
      Given a valid reservation CMS
      When I call assertReservationExists
      Then no error is thrown

    @acceptance-criteria @validation
    Scenario: Throws RESERVATION_NOT_FOUND when reservation is null
      Given a null reservation reference
      When I call assertReservationExists
      Then an InventoryInvariantError is thrown with code "RESERVATION_NOT_FOUND"

    Scenario: Throws RESERVATION_NOT_FOUND when reservation is undefined
      Given an undefined reservation reference
      When I call assertReservationExists
      Then an InventoryInvariantError is thrown with code "RESERVATION_NOT_FOUND"

  # ============================================================================
  # Procedural Assertions: assertReservationDoesNotExist
  # ============================================================================

  Rule: assertReservationDoesNotExist throws when reservation already exists

    **Invariant:** A reservation must not already exist for idempotent creation
    **Rationale:** Prevents duplicate reservations for the same order
    **Verified by:** Null passes, Undefined passes, Existing throws

    @acceptance-criteria @happy-path
    Scenario: Does not throw when reservation is null
      Given a null reservation reference
      When I call assertReservationDoesNotExist
      Then no error is thrown

    Scenario: Does not throw when reservation is undefined
      Given an undefined reservation reference
      When I call assertReservationDoesNotExist
      Then no error is thrown

    @acceptance-criteria @validation
    Scenario: Throws RESERVATION_ALREADY_EXISTS when reservation exists
      Given a valid reservation CMS with reservationId "res_existing"
      When I call assertReservationDoesNotExist
      Then an InventoryInvariantError is thrown with code "RESERVATION_ALREADY_EXISTS"
      And the error context reservationId is "res_existing"

  # ============================================================================
  # Procedural Assertions: assertReservationHasItems
  # ============================================================================

  Rule: assertReservationHasItems throws when items array is empty

    **Invariant:** A reservation must contain at least one item
    **Rationale:** Empty reservations have no business meaning
    **Verified by:** Single item passes, Multiple items pass, Empty throws

    @acceptance-criteria @happy-path
    Scenario: Does not throw when items has one item
      Given reservation items with 1 item
      When I call assertReservationHasItems
      Then no error is thrown

    Scenario: Does not throw when items has multiple items
      Given reservation items with 2 items
      When I call assertReservationHasItems
      Then no error is thrown

    @acceptance-criteria @validation
    Scenario: Throws EMPTY_RESERVATION when items array is empty
      Given an empty reservation items array
      When I call assertReservationHasItems
      Then an InventoryInvariantError is thrown with code "EMPTY_RESERVATION"

  # ============================================================================
  # Procedural Assertions: validateReservationItem
  # ============================================================================

  Rule: validateReservationItem validates individual item data via Zod schema

    **Invariant:** Each reservation item must have valid productId and positive integer quantity
    **Rationale:** Schema-driven validation ensures consistent item structure
    **Verified by:** Valid item, Quantity 1, Zero quantity, Negative quantity, Non-integer quantity, Empty productId

    @acceptance-criteria @happy-path
    Scenario: Does not throw for valid item with quantity 5
      Given a reservation item with productId "prod_1" and quantity 5
      When I call validateReservationItem
      Then no error is thrown

    Scenario: Does not throw for item with quantity 1
      Given a reservation item with productId "prod_1" and quantity 1
      When I call validateReservationItem
      Then no error is thrown

    @acceptance-criteria @validation
    Scenario: Throws INVALID_QUANTITY for zero quantity
      Given a reservation item with productId "prod_1" and quantity 0
      When I call validateReservationItem
      Then an InventoryInvariantError is thrown with code "INVALID_QUANTITY"

    Scenario: Throws INVALID_QUANTITY for negative quantity
      Given a reservation item with productId "prod_1" and quantity -5
      When I call validateReservationItem
      Then an InventoryInvariantError is thrown with code "INVALID_QUANTITY"

    Scenario: Throws INVALID_QUANTITY for non-integer quantity
      Given a reservation item with productId "prod_1" and quantity 1.5
      When I call validateReservationItem
      Then an InventoryInvariantError is thrown with code "INVALID_QUANTITY"

    Scenario: Throws INVALID_RESERVATION_ITEM for empty productId
      Given a reservation item with productId "" and quantity 5
      When I call validateReservationItem
      Then an InventoryInvariantError is thrown with code "INVALID_RESERVATION_ITEM"

  # ============================================================================
  # Composite Validation: validateReservationItems
  # ============================================================================

  Rule: validateReservationItems validates the full items array

    **Invariant:** Items array must be non-empty with all items individually valid
    **Rationale:** Composite validation catches both structural and item-level errors
    **Verified by:** Valid array passes, Empty throws, Invalid item throws

    @acceptance-criteria @happy-path
    Scenario: Does not throw for valid items array
      Given a reservation items array with 2 valid items
      When I call validateReservationItems
      Then no error is thrown

    @acceptance-criteria @validation
    Scenario: Throws EMPTY_RESERVATION for empty array
      Given an empty reservation items array
      When I call validateReservationItems
      Then an InventoryInvariantError is thrown with code "EMPTY_RESERVATION"

    Scenario: Throws INVALID_QUANTITY when one item has invalid quantity
      Given a reservation items array where the second item has quantity 0
      When I call validateReservationItems
      Then an InventoryInvariantError is thrown with code "INVALID_QUANTITY"

  # ============================================================================
  # InventoryInvariantError
  # ============================================================================

  Rule: InventoryInvariantError carries structured error information

    **Invariant:** Error instances expose name, code, message, and optional context
    **Rationale:** Structured errors enable programmatic error handling in handlers
    **Verified by:** Name, Code, Message, Context, Undefined context, Instanceof

    @acceptance-criteria @happy-path
    Scenario: Has correct name property
      Given an InventoryInvariantError with code "INSUFFICIENT_STOCK" and message "Custom message"
      Then the error name is "InventoryInvariantError"

    Scenario: Has correct code property
      Given an InventoryInvariantError with code "INSUFFICIENT_STOCK" and message "Custom message"
      Then the error code is "INSUFFICIENT_STOCK"

    Scenario: Has correct message property
      Given an InventoryInvariantError with code "INSUFFICIENT_STOCK" and message "Custom message"
      Then the error message is "Custom message"

    Scenario: Has correct context property
      Given an InventoryInvariantError with code "INSUFFICIENT_STOCK" and context
      Then the error context contains productId "prod_123"
      And the error context contains extra "data"

    @acceptance-criteria @validation
    Scenario: Can have undefined context
      Given an InventoryInvariantError with code "INSUFFICIENT_STOCK" and no context
      Then the error context is undefined

    Scenario: Is instance of Error
      Given an InventoryInvariantError with code "INSUFFICIENT_STOCK" and message "Custom message"
      Then the error is an instance of Error

  # ============================================================================
  # Declarative Invariant: reservationIsPending
  # ============================================================================

  Rule: reservationIsPending validates that reservation status is pending

    **Invariant:** Only pending reservations can be modified
    **Rationale:** Terminal states (confirmed, released, expired) are immutable
    **Verified by:** check true/false, assert pass/throw, validate valid/invalid

    @acceptance-criteria @happy-path
    Scenario: reservationIsPending.check returns true for pending status
      Given a reservation in "pending" status
      When I call reservationIsPending.check
      Then the check result is true

    @acceptance-criteria @validation
    Scenario Outline: reservationIsPending.check returns false for non-pending statuses
      Given a reservation in "<status>" status
      When I call reservationIsPending.check
      Then the check result is false

      Examples:
        | status    |
        | confirmed |
        | released  |
        | expired   |

    Scenario: reservationIsPending.assert passes for pending status
      Given a reservation in "pending" status
      When I call reservationIsPending.assert
      Then no error is thrown

    Scenario: reservationIsPending.assert throws RESERVATION_NOT_PENDING for confirmed
      Given a reservation in "confirmed" status with reservationId "res_test"
      When I call reservationIsPending.assert
      Then an InventoryInvariantError is thrown with code "RESERVATION_NOT_PENDING"
      And the error context reservationId is "res_test"
      And the error context currentStatus is "confirmed"

    Scenario: reservationIsPending.assert throws RESERVATION_NOT_PENDING for released
      Given a reservation in "released" status
      When I call reservationIsPending.assert
      Then an InventoryInvariantError is thrown with code "RESERVATION_NOT_PENDING"

    Scenario: reservationIsPending.validate returns valid for pending
      Given a reservation in "pending" status
      When I call reservationIsPending.validate
      Then the validate result is valid

    Scenario: reservationIsPending.validate returns invalid for released
      Given a reservation in "released" status
      When I call reservationIsPending.validate
      Then the validate result is invalid with code "RESERVATION_NOT_PENDING"
      And the validate result context currentStatus is "released"

  # ============================================================================
  # Declarative Invariant: reservationNotExpired
  # ============================================================================

  Rule: reservationNotExpired validates that a pending reservation has not passed its expiry

    **Invariant:** Pending reservations must not have passed their expiresAt time
    **Rationale:** Expired reservations should be cleaned up, not acted upon
    **Verified by:** check true/false, assert pass/throw, validate valid/invalid

    @acceptance-criteria @happy-path
    Scenario: reservationNotExpired.check returns true for pending with future expiry
      Given a pending reservation expiring 1 hour from now
      When I call reservationNotExpired.check
      Then the check result is true

    Scenario: reservationNotExpired.check returns true for confirmed with past expiry
      Given a confirmed reservation with past expiry
      When I call reservationNotExpired.check
      Then the check result is true

    Scenario: reservationNotExpired.check returns true for released with past expiry
      Given a released reservation with past expiry
      When I call reservationNotExpired.check
      Then the check result is true

    @acceptance-criteria @validation
    Scenario: reservationNotExpired.check returns false for pending with past expiry
      Given a pending reservation that expired 1 second ago
      When I call reservationNotExpired.check
      Then the check result is false

    Scenario: reservationNotExpired.assert passes for pending with future expiry
      Given a pending reservation expiring 1 hour from now
      When I call reservationNotExpired.assert
      Then no error is thrown

    Scenario: reservationNotExpired.assert passes for confirmed with past expiry
      Given a confirmed reservation with past expiry
      When I call reservationNotExpired.assert
      Then no error is thrown

    Scenario: reservationNotExpired.assert throws RESERVATION_EXPIRED for pending with past expiry
      Given a pending reservation that expired 1 second ago with reservationId "res_expired"
      When I call reservationNotExpired.assert
      Then an InventoryInvariantError is thrown with code "RESERVATION_EXPIRED"
      And the error context reservationId is "res_expired"
      And the error context includes expiresAt

    Scenario: reservationNotExpired.validate returns valid for pending with future expiry
      Given a pending reservation expiring 1 hour from now
      When I call reservationNotExpired.validate
      Then the validate result is valid

    Scenario: reservationNotExpired.validate returns invalid for pending with past expiry
      Given a pending reservation that expired 1 second ago
      When I call reservationNotExpired.validate
      Then the validate result is invalid with code "RESERVATION_EXPIRED"

  # ============================================================================
  # Declarative Invariant: reservationHasExpired
  # ============================================================================

  Rule: reservationHasExpired validates that a reservation has passed its expiry time

    **Invariant:** For expiration processing, reservation must actually be expired
    **Rationale:** Only truly expired pending reservations should have stock released
    **Verified by:** check true/false, assert pass/throw, validate valid/invalid

    @acceptance-criteria @happy-path
    Scenario: reservationHasExpired.check returns true for pending with past expiry
      Given a pending reservation that expired 1 second ago
      When I call reservationHasExpired.check
      Then the check result is true

    Scenario Outline: reservationHasExpired.check returns true for non-pending statuses
      Given a "<status>" reservation with future expiry
      When I call reservationHasExpired.check
      Then the check result is true

      Examples:
        | status    |
        | confirmed |
        | released  |
        | expired   |

    @acceptance-criteria @validation
    Scenario: reservationHasExpired.check returns false for pending with future expiry
      Given a pending reservation expiring 1 hour from now
      When I call reservationHasExpired.check
      Then the check result is false

    Scenario: reservationHasExpired.assert passes for pending with past expiry
      Given a pending reservation that expired 1 second ago
      When I call reservationHasExpired.assert
      Then no error is thrown

    Scenario: reservationHasExpired.assert passes for confirmed regardless of expiry
      Given a confirmed reservation with future expiry
      When I call reservationHasExpired.assert
      Then no error is thrown

    Scenario: reservationHasExpired.assert throws RESERVATION_NOT_EXPIRED for pending with future expiry
      Given a pending reservation expiring 1 hour from now with reservationId "res_active"
      When I call reservationHasExpired.assert
      Then an InventoryInvariantError is thrown with code "RESERVATION_NOT_EXPIRED"
      And the error context reservationId is "res_active"
      And the error context includes expiresAt
      And the error context includes currentTime

    Scenario: reservationHasExpired.validate returns valid for expired reservation
      Given a pending reservation that expired 1 second ago
      When I call reservationHasExpired.validate
      Then the validate result is valid

    Scenario: reservationHasExpired.validate returns invalid for pending with future expiry
      Given a pending reservation expiring 1 hour from now
      When I call reservationHasExpired.validate
      Then the validate result is invalid with code "RESERVATION_NOT_EXPIRED"
      And the validate result context includes expiresAt
      And the validate result context includes currentTime

  # ============================================================================
  # Invariant Set: confirmReservationInvariants
  # ============================================================================

  Rule: confirmReservationInvariants validates pending + not expired for confirmation

    **Invariant:** Reservation must be pending AND not expired to confirm
    **Rationale:** Only active, non-expired reservations can transition to confirmed
    **Verified by:** checkAll, assertAll, validateAll for valid and invalid states

    @acceptance-criteria @happy-path
    Scenario: confirmReservationInvariants.checkAll returns true for pending and not expired
      Given a pending reservation expiring 1 hour from now
      When I call confirmReservationInvariants.checkAll
      Then the checkAll result is true

    @acceptance-criteria @validation
    Scenario: confirmReservationInvariants.checkAll returns false for confirmed and not expired
      Given a confirmed reservation with future expiry
      When I call confirmReservationInvariants.checkAll
      Then the checkAll result is false

    Scenario: confirmReservationInvariants.checkAll returns false for pending and expired
      Given a pending reservation that expired 1 second ago
      When I call confirmReservationInvariants.checkAll
      Then the checkAll result is false

    Scenario: confirmReservationInvariants.assertAll passes for pending and not expired
      Given a pending reservation expiring 1 hour from now
      When I call confirmReservationInvariants.assertAll
      Then no error is thrown

    Scenario: confirmReservationInvariants.assertAll throws RESERVATION_NOT_PENDING for confirmed
      Given a confirmed reservation with future expiry
      When I call confirmReservationInvariants.assertAll
      Then an InventoryInvariantError is thrown with code "RESERVATION_NOT_PENDING"

    Scenario: confirmReservationInvariants.assertAll throws RESERVATION_EXPIRED for pending and expired
      Given a pending reservation that expired 1 second ago
      When I call confirmReservationInvariants.assertAll
      Then an InventoryInvariantError is thrown with code "RESERVATION_EXPIRED"

    Scenario: confirmReservationInvariants.validateAll returns valid for pending and not expired
      Given a pending reservation expiring 1 hour from now
      When I call confirmReservationInvariants.validateAll
      Then the validateAll result is valid

    Scenario: confirmReservationInvariants.validateAll returns single violation for confirmed and not expired
      Given a confirmed reservation with future expiry
      When I call confirmReservationInvariants.validateAll
      Then the validateAll result is invalid
      And the violations include code "RESERVATION_NOT_PENDING"

    Scenario: confirmReservationInvariants.validateAll returns violation for pending and expired
      Given a pending reservation that expired 1 second ago
      When I call confirmReservationInvariants.validateAll
      Then the validateAll result is invalid
      And the violations include code "RESERVATION_EXPIRED"

  # ============================================================================
  # Invariant Set: expireReservationInvariants
  # ============================================================================

  Rule: expireReservationInvariants validates pending + has expired for expiration processing

    **Invariant:** Reservation must be pending AND expired to process expiration
    **Rationale:** Only pending reservations that have truly expired should release stock
    **Verified by:** checkAll, assertAll, validateAll for valid and invalid states

    @acceptance-criteria @happy-path
    Scenario: expireReservationInvariants.checkAll returns true for pending and expired
      Given a pending reservation that expired 1 second ago
      When I call expireReservationInvariants.checkAll
      Then the checkAll result is true

    @acceptance-criteria @validation
    Scenario: expireReservationInvariants.checkAll returns false for confirmed and expired
      Given a confirmed reservation with past expiry
      When I call expireReservationInvariants.checkAll
      Then the checkAll result is false

    Scenario: expireReservationInvariants.checkAll returns false for pending and not expired
      Given a pending reservation expiring 1 hour from now
      When I call expireReservationInvariants.checkAll
      Then the checkAll result is false

    Scenario: expireReservationInvariants.assertAll passes for pending and expired
      Given a pending reservation that expired 1 second ago
      When I call expireReservationInvariants.assertAll
      Then no error is thrown

    Scenario: expireReservationInvariants.assertAll throws RESERVATION_NOT_PENDING for confirmed
      Given a confirmed reservation with past expiry
      When I call expireReservationInvariants.assertAll
      Then an InventoryInvariantError is thrown with code "RESERVATION_NOT_PENDING"

    Scenario: expireReservationInvariants.assertAll throws RESERVATION_NOT_EXPIRED for pending and not expired
      Given a pending reservation expiring 1 hour from now
      When I call expireReservationInvariants.assertAll
      Then an InventoryInvariantError is thrown with code "RESERVATION_NOT_EXPIRED"

    Scenario: expireReservationInvariants.validateAll returns valid for pending and expired
      Given a pending reservation that expired 1 second ago
      When I call expireReservationInvariants.validateAll
      Then the validateAll result is valid

    Scenario: expireReservationInvariants.validateAll returns single violation for released and expired
      Given a released reservation with past expiry
      When I call expireReservationInvariants.validateAll
      Then the validateAll result is invalid
      And the violations include code "RESERVATION_NOT_PENDING"

    Scenario: expireReservationInvariants.validateAll returns single violation for pending and not expired
      Given a pending reservation expiring 1 hour from now
      When I call expireReservationInvariants.validateAll
      Then the validateAll result is invalid
      And the violations include code "RESERVATION_NOT_EXPIRED"
