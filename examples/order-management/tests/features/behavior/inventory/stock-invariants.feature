@unit-test @domain @inventory
Feature: Stock Invariants

  As a developer working with the Inventory bounded context
  I want pure stock invariant functions that validate quantity constraints
  So that stock over-allocation is prevented with structured error information

  # ============================================================================
  # Sufficient Stock Assertion
  # ============================================================================

  Rule: assertSufficientStock ensures requested quantity does not exceed available stock

    **Invariant:** assertSufficientStock must not throw when requestedQuantity <= availableQuantity;
    must throw InventoryInvariantError with code INSUFFICIENT_STOCK when requestedQuantity > availableQuantity,
    with context including productId, availableQuantity, and requestedQuantity.
    **Rationale:** Prevents over-allocation of stock, which would lead to unfulfillable orders
    **Verified by:** passes when stock is sufficient, passes for exact quantity, throws for insufficient stock, throws for zero stock

    @acceptance-criteria @happy-path
    Scenario: passes when stock is sufficient
      Given a product with available quantity 100
      When I assert sufficient stock for quantity 50
      Then no error is thrown

    Scenario: passes when requesting exact available quantity
      Given a product with available quantity 100
      When I assert sufficient stock for quantity 100
      Then no error is thrown

    @acceptance-criteria @validation
    Scenario: throws INSUFFICIENT_STOCK when stock is not enough
      Given a product with available quantity 10 and productId "prod_low"
      When I assert sufficient stock for quantity 20
      Then an InventoryInvariantError is thrown with code "INSUFFICIENT_STOCK"
      And the error context productId is "prod_low"
      And the error context availableQuantity is 10
      And the error context requestedQuantity is 20

    Scenario: throws INSUFFICIENT_STOCK when stock is zero
      Given a product with available quantity 0
      When I assert sufficient stock for quantity 1
      Then an InventoryInvariantError is thrown with code "INSUFFICIENT_STOCK"

  # ============================================================================
  # Stock Availability Check
  # ============================================================================

  Rule: checkStockAvailability returns availability status with optional deficit

    **Invariant:** checkStockAvailability must return { available: true } when requestedQuantity <= availableQuantity;
    must return { available: false, deficit: N } when requestedQuantity > availableQuantity,
    where deficit = requestedQuantity - availableQuantity.
    **Rationale:** Provides a non-throwing alternative for callers that need to inspect availability without exception handling
    **Verified by:** returns available when stock is sufficient, returns available for exact amount, returns unavailable with deficit when insufficient, returns correct deficit for zero stock

    @acceptance-criteria @happy-path
    Scenario: returns available when stock is sufficient
      Given a product with available quantity 100
      When I check stock availability for quantity 50
      Then the result shows stock is available

    Scenario: returns available when requesting exact amount
      Given a product with available quantity 100
      When I check stock availability for quantity 100
      Then the result shows stock is available

    @acceptance-criteria @validation
    Scenario: returns unavailable with deficit when stock is insufficient
      Given a product with available quantity 10
      When I check stock availability for quantity 25
      Then the result shows stock is not available
      And the deficit is 15

    Scenario: returns correct deficit for zero stock
      Given a product with available quantity 0
      When I check stock availability for quantity 10
      Then the result shows stock is not available
      And the deficit is 10
