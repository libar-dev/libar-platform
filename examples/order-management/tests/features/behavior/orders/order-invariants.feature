@unit-test @domain @orders
Feature: Order Invariants

  As a developer working with the Order aggregate
  I want pure invariant functions that validate order state
  So that invalid state transitions are prevented with structured error information

  # ============================================================================
  # Existence Assertions
  # ============================================================================

  Rule: assertOrderExists validates that an order reference is not null or undefined

    **Invariant:** assertOrderExists must pass for any non-null/non-undefined order
    and throw OrderInvariantError with code ORDER_NOT_FOUND otherwise.
    **Rationale:** Commands must verify aggregate existence before operating on it.
    **Verified by:** passes for valid order, throws for null reference, throws for
    undefined reference.

    @acceptance-criteria @happy-path
    Scenario: passes for a valid order
      Given a valid order
      When I call assertOrderExists
      Then no error is thrown

    @acceptance-criteria @validation
    Scenario: throws ORDER_NOT_FOUND for null order reference
      Given a null order reference
      When I call assertOrderExists
      Then an OrderInvariantError is thrown with code "ORDER_NOT_FOUND"

    Scenario: throws ORDER_NOT_FOUND for undefined order reference
      Given an undefined order reference
      When I call assertOrderExists
      Then an OrderInvariantError is thrown with code "ORDER_NOT_FOUND"

  # ============================================================================

  Rule: assertOrderDoesNotExist validates that an order reference is null or undefined

    **Invariant:** assertOrderDoesNotExist must pass for null/undefined and throw
    OrderInvariantError with code ORDER_ALREADY_EXISTS for existing orders,
    including orderId in the error context.
    **Rationale:** Create commands must ensure idempotency by rejecting duplicates.
    **Verified by:** passes for null, passes for undefined, throws for existing order
    with orderId in context.

    @acceptance-criteria @happy-path
    Scenario: passes for null order reference
      Given a null order reference
      When I call assertOrderDoesNotExist
      Then no error is thrown

    Scenario: passes for undefined order reference
      Given an undefined order reference
      When I call assertOrderDoesNotExist
      Then no error is thrown

    @acceptance-criteria @validation
    Scenario: throws ORDER_ALREADY_EXISTS for existing order
      Given an existing order with orderId "ord_existing"
      When I call assertOrderDoesNotExist
      Then an OrderInvariantError is thrown with code "ORDER_ALREADY_EXISTS"
      And the error context contains orderId "ord_existing"

  # ============================================================================
  # Status Invariants
  # ============================================================================

  Rule: orderIsDraft checks whether an order is in draft status

    **Invariant:** orderIsDraft.check() must return true only when order.status === "draft";
    orderIsDraft.assert() must throw OrderInvariantError with code ORDER_NOT_IN_DRAFT for any
    non-draft status, including currentStatus in the error context.
    **Rationale:** Draft is the only mutable state - items can only be added/removed while draft.
    **Verified by:** check returns true for draft order, check returns false for submitted order,
    assert passes for draft order, assert throws for non-draft statuses.

    @acceptance-criteria @happy-path
    Scenario: check returns true for draft order
      Given an order in "draft" status
      When I call orderIsDraft.check()
      Then the result is true

    Scenario: check returns false for submitted order
      Given an order in "submitted" status
      When I call orderIsDraft.check()
      Then the result is false

    Scenario: assert passes for draft order
      Given an order in "draft" status
      When I call orderIsDraft.assert()
      Then no error is thrown

    @acceptance-criteria @validation
    Scenario Outline: assert throws ORDER_NOT_IN_DRAFT for non-draft statuses
      Given an order in "<status>" status
      When I call orderIsDraft.assert()
      Then an OrderInvariantError is thrown with code "ORDER_NOT_IN_DRAFT"
      And the error context contains currentStatus "<status>"

      Examples:
        | status    |
        | submitted |
        | confirmed |
        | cancelled |

  # ============================================================================

  Rule: orderIsSubmitted checks whether an order is in submitted status

    **Invariant:** orderIsSubmitted.check() must return true only when
    order.status === "submitted"; orderIsSubmitted.assert() must throw
    OrderInvariantError with code ORDER_NOT_SUBMITTED for any non-submitted status.
    **Rationale:** Only submitted orders can be confirmed or processed.
    **Verified by:** check returns true for submitted, check returns false for draft,
    assert passes for submitted, assert throws for non-submitted statuses.

    @acceptance-criteria @happy-path
    Scenario: check returns true for submitted order
      Given an order in "submitted" status
      When I call orderIsSubmitted.check()
      Then the result is true

    Scenario: check returns false for draft order
      Given an order in "draft" status
      When I call orderIsSubmitted.check()
      Then the result is false

    Scenario: assert passes for submitted order
      Given an order in "submitted" status
      When I call orderIsSubmitted.assert()
      Then no error is thrown

    @acceptance-criteria @validation
    Scenario Outline: assert throws ORDER_NOT_SUBMITTED for non-submitted statuses
      Given an order in "<status>" status
      When I call orderIsSubmitted.assert()
      Then an OrderInvariantError is thrown with code "ORDER_NOT_SUBMITTED"

      Examples:
        | status    |
        | draft     |
        | confirmed |

  # ============================================================================

  Rule: orderNotCancelled checks whether an order has not been cancelled

    **Invariant:** orderNotCancelled.check() must return true for any non-cancelled
    status; orderNotCancelled.assert() must throw OrderInvariantError with code
    ORDER_ALREADY_CANCELLED for cancelled orders, including orderId in context.
    **Rationale:** Cancelled orders are terminal and must not be modified.
    **Verified by:** check returns true for draft/submitted, check returns false for
    cancelled, assert passes for non-cancelled, assert throws for cancelled.

    @acceptance-criteria @happy-path
    Scenario: check returns true for draft order
      Given an order in "draft" status
      When I call orderNotCancelled.check()
      Then the result is true

    Scenario: check returns true for submitted order
      Given an order in "submitted" status
      When I call orderNotCancelled.check()
      Then the result is true

    Scenario: check returns false for cancelled order
      Given an order in "cancelled" status
      When I call orderNotCancelled.check()
      Then the result is false

    Scenario: assert passes for draft order (not cancelled)
      Given an order in "draft" status
      When I call orderNotCancelled.assert()
      Then no error is thrown

    Scenario: assert passes for confirmed order (not cancelled)
      Given an order in "confirmed" status
      When I call orderNotCancelled.assert()
      Then no error is thrown

    @acceptance-criteria @validation
    Scenario: assert throws ORDER_ALREADY_CANCELLED for cancelled order
      Given a cancelled order with orderId "ord_cancelled"
      When I call orderNotCancelled.assert()
      Then an OrderInvariantError is thrown with code "ORDER_ALREADY_CANCELLED"
      And the error context contains orderId "ord_cancelled"

  # ============================================================================

  Rule: orderNotConfirmed checks whether an order has not been confirmed

    **Invariant:** orderNotConfirmed.check() must return true for any non-confirmed
    status; orderNotConfirmed.assert() must throw OrderInvariantError with code
    ORDER_ALREADY_CONFIRMED for confirmed orders, including orderId in context.
    **Rationale:** Confirmed orders are terminal and must not be modified.
    **Verified by:** check returns true for draft/submitted, check returns false for
    confirmed, assert passes for non-confirmed, assert throws for confirmed.

    @acceptance-criteria @happy-path
    Scenario: check returns true for draft order (not confirmed)
      Given an order in "draft" status
      When I call orderNotConfirmed.check()
      Then the result is true

    Scenario: check returns true for submitted order (not confirmed)
      Given an order in "submitted" status
      When I call orderNotConfirmed.check()
      Then the result is true

    Scenario: check returns false for confirmed order
      Given an order in "confirmed" status
      When I call orderNotConfirmed.check()
      Then the result is false

    Scenario: assert passes for draft order (not confirmed)
      Given an order in "draft" status
      When I call orderNotConfirmed.assert()
      Then no error is thrown

    Scenario: assert passes for cancelled order (not confirmed)
      Given an order in "cancelled" status
      When I call orderNotConfirmed.assert()
      Then no error is thrown

    @acceptance-criteria @validation
    Scenario: assert throws ORDER_ALREADY_CONFIRMED for confirmed order
      Given a confirmed order with orderId "ord_confirmed"
      When I call orderNotConfirmed.assert()
      Then an OrderInvariantError is thrown with code "ORDER_ALREADY_CONFIRMED"
      And the error context contains orderId "ord_confirmed"

  # ============================================================================
  # Item Invariants
  # ============================================================================

  Rule: orderHasItems checks whether an order contains at least one item

    **Invariant:** orderHasItems.check() must return true when items.length > 0;
    orderHasItems.assert() must throw OrderInvariantError with code ORDER_HAS_NO_ITEMS
    for empty items arrays, including orderId in context.
    **Rationale:** Orders cannot be submitted without at least one line item.
    **Verified by:** check returns true with items, check returns false without items,
    assert passes with items, assert throws for empty items.

    @acceptance-criteria @happy-path
    Scenario: check returns true when order has items
      Given an order with 1 item
      When I call orderHasItems.check()
      Then the result is true

    Scenario: check returns false when order has no items
      Given an order with 0 items
      When I call orderHasItems.check()
      Then the result is false

    Scenario: assert passes when order has items
      Given an order with 1 item
      When I call orderHasItems.assert()
      Then no error is thrown

    Scenario: assert passes when order has multiple items
      Given an order with 2 items
      When I call orderHasItems.assert()
      Then no error is thrown

    @acceptance-criteria @validation
    Scenario: assert throws ORDER_HAS_NO_ITEMS for empty order
      Given an order with 0 items and orderId "ord_empty"
      When I call orderHasItems.assert()
      Then an OrderInvariantError is thrown with code "ORDER_HAS_NO_ITEMS"
      And the error context contains orderId "ord_empty"

  # ============================================================================

  Rule: orderCanAddItem checks whether an order has room for more items

    **Invariant:** orderCanAddItem.check() must return true when items.length < MAX_ITEMS_PER_ORDER;
    orderCanAddItem.assert() must throw OrderInvariantError with code MAX_ITEMS_EXCEEDED
    when at max capacity, including currentCount in context.
    **Rationale:** A maximum item limit prevents unbounded order growth.
    **Verified by:** check returns true with room, check returns false at capacity,
    assert passes under limit, assert throws at capacity.

    @acceptance-criteria @happy-path
    Scenario: check returns true when order has room for items
      Given an order with 0 items
      When I call orderCanAddItem.check()
      Then the result is true

    Scenario: check returns false when order is at max capacity
      Given an order at max item capacity
      When I call orderCanAddItem.check()
      Then the result is false

    Scenario: assert passes when order has room for items
      Given an order with 0 items
      When I call orderCanAddItem.assert()
      Then no error is thrown

    Scenario: assert passes when order is one under max capacity
      Given an order one under max item capacity
      When I call orderCanAddItem.assert()
      Then no error is thrown

    @acceptance-criteria @validation
    Scenario: assert throws MAX_ITEMS_EXCEEDED at max capacity
      Given an order at max item capacity with orderId "ord_full"
      When I call orderCanAddItem.assert()
      Then an OrderInvariantError is thrown with code "MAX_ITEMS_EXCEEDED"
      And the error context contains currentCount equal to MAX_ITEMS_PER_ORDER

  # ============================================================================

  Rule: assertItemExists validates that a product exists in the order items

    **Invariant:** assertItemExists must pass when the specified productId exists
    in the order items array; must throw OrderInvariantError with code ITEM_NOT_FOUND
    when missing, including productId and orderId in context.
    **Rationale:** Item operations must target existing line items.
    **Verified by:** passes when item exists, passes when item is among many,
    throws for missing item, throws for empty items array.

    @acceptance-criteria @happy-path
    Scenario: passes when item exists in order
      Given an order with item productId "prod_target"
      When I call assertItemExists with productId "prod_target"
      Then no error is thrown

    Scenario: passes when item is one of many
      Given an order with items "prod_1", "prod_target", "prod_3"
      When I call assertItemExists with productId "prod_target"
      Then no error is thrown

    @acceptance-criteria @validation
    Scenario: throws ITEM_NOT_FOUND when item does not exist
      Given an order with item productId "prod_other" and orderId "ord_test"
      When I call assertItemExists with productId "prod_missing"
      Then an OrderInvariantError is thrown with code "ITEM_NOT_FOUND"
      And the error context contains productId "prod_missing"
      And the error context contains orderId "ord_test"

    Scenario: throws ITEM_NOT_FOUND when items array is empty
      Given an order with 0 items
      When I call assertItemExists with productId "prod_any"
      Then an OrderInvariantError is thrown with code "ITEM_NOT_FOUND"

  # ============================================================================
  # Item Validation
  # ============================================================================

  Rule: validateItem validates item data integrity

    **Invariant:** validateItem must pass for items with positive integer quantity,
    non-negative price, and non-empty productId/productName; must throw
    OrderInvariantError with appropriate code for each violation.
    **Rationale:** Line item data must be valid before being added to an order.
    **Verified by:** passes for valid item, passes for decimal/zero prices,
    throws for invalid quantity/price/data.

    @acceptance-criteria @happy-path
    Scenario: passes for valid item
      Given a valid item with quantity 1 and unitPrice 10
      When I call validateItem
      Then no error is thrown

    Scenario: passes for item with decimal price
      Given a valid item with quantity 1 and unitPrice 9.99
      When I call validateItem
      Then no error is thrown

    Scenario: passes for item with zero price (free item)
      Given a valid item with quantity 1 and unitPrice 0
      When I call validateItem
      Then no error is thrown

    @acceptance-criteria @validation
    Scenario: throws INVALID_QUANTITY for negative quantity
      Given an item with quantity -1
      When I call validateItem
      Then an OrderInvariantError is thrown with code "INVALID_QUANTITY"

    Scenario: throws INVALID_QUANTITY for zero quantity
      Given an item with quantity 0
      When I call validateItem
      Then an OrderInvariantError is thrown with code "INVALID_QUANTITY"

    Scenario: throws INVALID_QUANTITY for non-integer quantity
      Given an item with quantity 1.5
      When I call validateItem
      Then an OrderInvariantError is thrown with code "INVALID_QUANTITY"

    Scenario: throws INVALID_PRICE for negative price
      Given an item with unitPrice -5
      When I call validateItem
      Then an OrderInvariantError is thrown with code "INVALID_PRICE"

    Scenario: throws INVALID_ITEM_DATA for empty productId
      Given an item with empty productId
      When I call validateItem
      Then an OrderInvariantError is thrown with code "INVALID_ITEM_DATA"

    Scenario: throws INVALID_ITEM_DATA for empty productName
      Given an item with empty productName
      When I call validateItem
      Then an OrderInvariantError is thrown with code "INVALID_ITEM_DATA"

  # ============================================================================
  # Error Type
  # ============================================================================

  Rule: OrderInvariantError carries structured error information

    **Invariant:** OrderInvariantError must expose name, code, message, and optional
    context properties; must extend Error.
    **Rationale:** Structured errors enable programmatic error handling in command handlers.
    **Verified by:** correct name, code, message, context properties, undefined context,
    instanceof Error.

    @acceptance-criteria @happy-path
    Scenario: error has correct name property
      When I create an OrderInvariantError with code "ORDER_NOT_FOUND" and message "Test message"
      Then the error name is "OrderInvariantError"

    Scenario: error has correct code property
      When I create an OrderInvariantError with code "ORDER_NOT_IN_DRAFT" and message "Test message"
      Then the error code is "ORDER_NOT_IN_DRAFT"

    Scenario: error has correct message property
      When I create an OrderInvariantError with code "ORDER_NOT_FOUND" and message "Custom message"
      Then the error message is "Custom message"

    @acceptance-criteria @validation
    Scenario: error has correct context property
      When I create an OrderInvariantError with code "ORDER_NOT_FOUND" and message "Message" and context:
        | field   | value   |
        | orderId | ord_123 |
        | extra   | data    |
      Then the error context matches the provided context

    Scenario: error can have undefined context
      When I create an OrderInvariantError with code "ORDER_NOT_FOUND" and message "Message"
      Then the error context is undefined

    Scenario: error is an instance of Error
      When I create an OrderInvariantError with code "ORDER_NOT_FOUND" and message "Message"
      Then the error is an instance of Error
