@unit-test @domain @inventory
Feature: Product Invariants

  As a developer working with the Inventory aggregate
  I want pure invariant functions that validate product state
  So that invalid state transitions are prevented with structured error information

  # ============================================================================
  # Existence Assertions
  # ============================================================================

  Rule: assertProductExists validates that a product reference is not null or undefined

    **Invariant:** assertProductExists must pass for any non-null/non-undefined product
    and throw InventoryInvariantError with code PRODUCT_NOT_FOUND otherwise.
    **Rationale:** Commands must verify aggregate existence before operating on it.
    **Verified by:** passes for valid product, throws for null reference, throws for
    undefined reference.

    @acceptance-criteria @happy-path
    Scenario: passes for a valid product
      Given a valid product
      When I call assertProductExists
      Then no error is thrown

    @acceptance-criteria @validation
    Scenario: throws PRODUCT_NOT_FOUND for null product reference
      Given a null product reference
      When I call assertProductExists
      Then an InventoryInvariantError is thrown with code "PRODUCT_NOT_FOUND"

    Scenario: throws PRODUCT_NOT_FOUND for undefined product reference
      Given an undefined product reference
      When I call assertProductExists
      Then an InventoryInvariantError is thrown with code "PRODUCT_NOT_FOUND"

  # ============================================================================

  Rule: assertProductDoesNotExist validates that a product reference is null or undefined

    **Invariant:** assertProductDoesNotExist must pass for null/undefined and throw
    InventoryInvariantError with code PRODUCT_ALREADY_EXISTS for existing products,
    including productId in the error context.
    **Rationale:** Create commands must ensure idempotency by rejecting duplicates.
    **Verified by:** passes for null, passes for undefined, throws for existing product
    with productId in context.

    @acceptance-criteria @happy-path
    Scenario: passes for null product reference
      Given a null product reference
      When I call assertProductDoesNotExist
      Then no error is thrown

    Scenario: passes for undefined product reference
      Given an undefined product reference
      When I call assertProductDoesNotExist
      Then no error is thrown

    @acceptance-criteria @validation
    Scenario: throws PRODUCT_ALREADY_EXISTS for existing product
      Given an existing product with productId "prod_existing"
      When I call assertProductDoesNotExist
      Then an InventoryInvariantError is thrown with code "PRODUCT_ALREADY_EXISTS"
      And the error context contains productId "prod_existing"

  # ============================================================================
  # Field Validation
  # ============================================================================

  Rule: assertValidSku validates that a SKU string is non-empty

    **Invariant:** assertValidSku must pass for any non-empty, non-whitespace SKU string
    and throw InventoryInvariantError with code INVALID_SKU otherwise.
    **Rationale:** SKU is a required product identifier that must contain meaningful characters.
    **Verified by:** passes for standard SKU, passes for SKU with special characters,
    throws for empty string, throws for whitespace-only string.

    @acceptance-criteria @happy-path
    Scenario: passes for standard SKU
      Given the SKU value "SKU-123"
      When I call assertValidSku
      Then no error is thrown

    Scenario: passes for SKU with special characters
      Given the SKU value "SKU_ABC-123/XYZ"
      When I call assertValidSku
      Then no error is thrown

    @acceptance-criteria @validation
    Scenario: throws INVALID_SKU for empty SKU
      Given an empty SKU value
      When I call assertValidSku
      Then an InventoryInvariantError is thrown with code "INVALID_SKU"

    Scenario: throws INVALID_SKU for whitespace-only SKU
      Given a whitespace-only SKU value
      When I call assertValidSku
      Then an InventoryInvariantError is thrown with code "INVALID_SKU"

  # ============================================================================

  Rule: assertValidProductName validates that a product name is non-empty

    **Invariant:** assertValidProductName must pass for any non-empty, non-whitespace
    product name and throw InventoryInvariantError with code INVALID_PRODUCT_NAME otherwise.
    **Rationale:** Product name is a required field for display and identification.
    **Verified by:** passes for standard name, passes for name with numbers,
    throws for empty string, throws for whitespace-only string.

    @acceptance-criteria @happy-path
    Scenario: passes for standard product name
      Given the product name "Test Product"
      When I call assertValidProductName
      Then no error is thrown

    Scenario: passes for product name with numbers
      Given the product name "Widget 2000"
      When I call assertValidProductName
      Then no error is thrown

    @acceptance-criteria @validation
    Scenario: throws INVALID_PRODUCT_NAME for empty product name
      Given an empty product name
      When I call assertValidProductName
      Then an InventoryInvariantError is thrown with code "INVALID_PRODUCT_NAME"

    Scenario: throws INVALID_PRODUCT_NAME for whitespace-only product name
      Given a whitespace-only product name
      When I call assertValidProductName
      Then an InventoryInvariantError is thrown with code "INVALID_PRODUCT_NAME"

  # ============================================================================
  # Quantity Validation
  # ============================================================================

  Rule: assertPositiveQuantity validates that a quantity is a positive integer

    **Invariant:** assertPositiveQuantity must pass for any positive integer and throw
    InventoryInvariantError with code INVALID_QUANTITY for zero, negative, or non-integer
    values, including quantity in the error context.
    **Rationale:** Stock operations require whole positive numbers to maintain integrity.
    **Verified by:** passes for positive integers, throws for zero, throws for negative,
    throws for non-integer, includes context string in error message.

    @acceptance-criteria @happy-path
    Scenario: passes for positive integer 10
      Given the quantity value 10
      When I call assertPositiveQuantity
      Then no error is thrown

    Scenario: passes for positive integer 1
      Given the quantity value 1
      When I call assertPositiveQuantity
      Then no error is thrown

    @acceptance-criteria @validation
    Scenario: throws INVALID_QUANTITY for zero
      Given the quantity value 0
      When I call assertPositiveQuantity
      Then an InventoryInvariantError is thrown with code "INVALID_QUANTITY"

    Scenario: throws INVALID_QUANTITY for negative number
      Given the quantity value -5
      When I call assertPositiveQuantity
      Then an InventoryInvariantError is thrown with code "INVALID_QUANTITY"
      And the error context contains quantity -5

    Scenario: throws INVALID_QUANTITY for non-integer
      Given the quantity value 1.5
      When I call assertPositiveQuantity
      Then an InventoryInvariantError is thrown with code "INVALID_QUANTITY"

    Scenario: includes context string in error message
      Given the quantity value 0 with context "adding stock"
      When I call assertPositiveQuantity with context
      Then the error message contains "adding stock"
