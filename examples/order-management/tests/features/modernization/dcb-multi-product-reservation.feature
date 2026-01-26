@libar-docs-phase:23
@libar-docs-product-area:ExampleApp
@libar-docs-pattern:DCBMultiProductReservation
@libar-docs-status:completed
@acceptance-criteria
Feature: DCB Multi-Product Reservation

  As a platform developer
  I want to see DCB demonstrated in the order submission flow
  So that I understand how to use executeWithDCB for multi-entity operations

  Background: Test environment setup
    Given the inventory bounded context is initialized
    And the test run has a unique namespace

  # ============================================================================
  # Happy Path
  # ============================================================================

  Rule: Order submission uses DCB for atomic multi-product reservation

    @happy-path
    Scenario: Multi-product order uses DCB for atomic reservation
      Given products exist with sufficient inventory:
        | productId | availableQuantity |
        | prod-001  | 100               |
        | prod-002  | 50                |
        | prod-003  | 25                |
      And an order with the following items:
        | productId | quantity |
        | prod-001  | 10       |
        | prod-002  | 5        |
        | prod-003  | 2        |
      When the order is submitted using executeWithDCB
      Then all inventory reservations should succeed atomically
      And a single ReservationCreated event should be emitted
      And each product's available quantity should be reduced

  # ============================================================================
  # Validation
  # ============================================================================

    @validation
    Scenario: Insufficient inventory for one product rejects entire reservation
      Given products exist with inventory:
        | productId | availableQuantity |
        | prod-001  | 100               |
        | prod-002  | 3                 |
        | prod-003  | 25                |
      And an order with the following items:
        | productId | quantity |
        | prod-001  | 10       |
        | prod-002  | 5        |
        | prod-003  | 2        |
      When the order is submitted using executeWithDCB
      Then the entire reservation should be rejected
      And no inventory should be reserved for any product
      And rejection reason should indicate "prod-002" has insufficient stock

    @validation
    Scenario: DCB handles concurrent reservation conflicts
      Given a product with available quantity 10
      And two concurrent orders each requesting quantity 8
      When both orders are submitted simultaneously
      Then exactly one order should succeed
      And one order should be rejected with conflict error
      And total reserved should not exceed available

    @validation
    Scenario: Duplicate product IDs are rejected
      # Duplicate product IDs in reservation items should be rejected upfront.
      # This prevents masking bugs in calling code and follows fail-fast principle.
      Given products exist with sufficient inventory:
        | productId | availableQuantity |
        | prod-001  | 100               |
      When attempting to reserve with duplicate product IDs:
        | productId | quantity |
        | prod-001  | 3        |
        | prod-001  | 4        |
      Then the reservation should be rejected with code "DUPLICATE_PRODUCT_IDS"
      And the error context should include the duplicate product IDs

  # ============================================================================
  # Future Edge Cases (See Phase 18 Production Hardening)
  # ============================================================================
  # The following validations are not yet implemented:
  # - Zero quantity rejection (INVALID_QUANTITY)
  # - Negative quantity rejection (INVALID_QUANTITY)
  # - Empty items array rejection (EMPTY_RESERVATION)
  #
  # These should be added as part of Production Hardening Phase 18 which
  # includes comprehensive input validation for all command handlers.
