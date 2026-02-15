@unit-test @domain @orders
Feature: Order Invariant Sets

  As a developer working with composed invariant sets
  I want checkAll, assertAll, and validateAll to enforce multiple invariants together
  So that command handlers get comprehensive validation with fail-fast or collect-all semantics

  # ============================================================================
  # Submit Invariants
  # ============================================================================

  Rule: orderSubmitInvariants composes orderIsDraft and orderHasItems for order submission

    **Invariant:** orderSubmitInvariants must validate that an order is in draft status
    AND has at least one item before submission. checkAll returns boolean, assertAll
    throws on first failure (fail-fast), validateAll collects all violations.
    **Rationale:** Submitting requires both a mutable state and at least one line item.
    **Verified by:** checkAll for valid/invalid states, assertAll fail-fast behavior,
    validateAll multi-violation collection.

    @acceptance-criteria @happy-path
    Scenario: checkAll returns true for draft order with items
      Given a draft order with items
      When I call orderSubmitInvariants.checkAll()
      Then the checkAll result is true

    Scenario: checkAll returns false for non-draft order with items
      Given a submitted order with items
      When I call orderSubmitInvariants.checkAll()
      Then the checkAll result is false

    Scenario: checkAll returns false for draft order without items
      Given a draft order with no items
      When I call orderSubmitInvariants.checkAll()
      Then the checkAll result is false

    Scenario: assertAll does not throw for valid draft order with items
      Given a draft order with items
      When I call orderSubmitInvariants.assertAll()
      Then no error is thrown

    @acceptance-criteria @validation
    Scenario: assertAll throws ORDER_NOT_IN_DRAFT for submitted order (fail-fast)
      Given a submitted order with items
      When I call orderSubmitInvariants.assertAll()
      Then an OrderInvariantError is thrown with code "ORDER_NOT_IN_DRAFT"

    Scenario: assertAll throws ORDER_HAS_NO_ITEMS for draft order with no items
      Given a draft order with no items
      When I call orderSubmitInvariants.assertAll()
      Then an OrderInvariantError is thrown with code "ORDER_HAS_NO_ITEMS"

    Scenario: validateAll returns valid result for draft order with items
      Given a draft order with items
      When I call orderSubmitInvariants.validateAll()
      Then the validation result is valid

    Scenario: validateAll returns both violations for submitted order with no items
      Given a submitted order with no items
      When I call orderSubmitInvariants.validateAll()
      Then the validation result is invalid with 2 violations
      And the violation codes include:
        | code               |
        | ORDER_NOT_IN_DRAFT |
        | ORDER_HAS_NO_ITEMS |

  # ============================================================================
  # Add Item Invariants
  # ============================================================================

  Rule: orderAddItemInvariants composes orderIsDraft and orderCanAddItem for adding items

    **Invariant:** orderAddItemInvariants must validate that an order is in draft status
    AND has room for more items (below MAX_ITEMS_PER_ORDER). checkAll returns boolean,
    assertAll throws on first failure, validateAll collects all violations.
    **Rationale:** Adding items requires both a mutable state and available capacity.
    **Verified by:** checkAll for valid/invalid states, assertAll fail-fast behavior,
    validateAll multi-violation collection.

    @acceptance-criteria @happy-path
    Scenario: checkAll returns true for draft order under item limit
      Given a draft order with items
      When I call orderAddItemInvariants.checkAll()
      Then the checkAll result is true

    Scenario: checkAll returns false for non-draft order
      Given a confirmed order with no items
      When I call orderAddItemInvariants.checkAll()
      Then the checkAll result is false

    Scenario: checkAll returns false for draft order at max capacity
      Given a draft order at max item capacity
      When I call orderAddItemInvariants.checkAll()
      Then the checkAll result is false

    Scenario: assertAll does not throw for valid draft order under limit
      Given a draft order with no items
      When I call orderAddItemInvariants.assertAll()
      Then no error is thrown

    @acceptance-criteria @validation
    Scenario: assertAll throws ORDER_NOT_IN_DRAFT for submitted order (fail-fast)
      Given a submitted order with no items
      When I call orderAddItemInvariants.assertAll()
      Then an OrderInvariantError is thrown with code "ORDER_NOT_IN_DRAFT"

    Scenario: assertAll throws MAX_ITEMS_EXCEEDED for draft order at capacity
      Given a draft order at max item capacity
      When I call orderAddItemInvariants.assertAll()
      Then an OrderInvariantError is thrown with code "MAX_ITEMS_EXCEEDED"

    Scenario: validateAll returns valid result for draft order under limit
      Given a draft order with no items
      When I call orderAddItemInvariants.validateAll()
      Then the validation result is valid

    Scenario: validateAll returns both violations for submitted order at capacity
      Given a submitted order at max item capacity
      When I call orderAddItemInvariants.validateAll()
      Then the validation result is invalid with 2 violations
      And the violation codes include:
        | code               |
        | ORDER_NOT_IN_DRAFT |
        | MAX_ITEMS_EXCEEDED |

  # ============================================================================
  # Cancel Invariants
  # ============================================================================

  Rule: orderCancelInvariants composes orderNotConfirmed and orderNotCancelled for cancellation

    **Invariant:** orderCancelInvariants must validate that an order is neither confirmed
    nor already cancelled before cancellation. checkAll returns boolean, assertAll throws
    on first failure, validateAll collects all violations.
    **Rationale:** Only draft or submitted orders can be cancelled; confirmed and cancelled
    are terminal states.
    **Verified by:** checkAll for each status, assertAll fail-fast for terminal statuses,
    validateAll single-violation collection.

    @acceptance-criteria @happy-path
    Scenario Outline: checkAll returns <expected> for <status> order
      Given an order in "<status>" status
      When I call orderCancelInvariants.checkAll()
      Then the checkAll result is <expected>

      Examples:
        | status    | expected |
        | draft     | true     |
        | submitted | true     |
        | confirmed | false    |
        | cancelled | false    |

    Scenario: assertAll does not throw for draft order
      Given an order in "draft" status
      When I call orderCancelInvariants.assertAll()
      Then no error is thrown

    Scenario: assertAll does not throw for submitted order
      Given an order in "submitted" status
      When I call orderCancelInvariants.assertAll()
      Then no error is thrown

    @acceptance-criteria @validation
    Scenario: assertAll throws ORDER_ALREADY_CONFIRMED for confirmed order
      Given an order in "confirmed" status
      When I call orderCancelInvariants.assertAll()
      Then an OrderInvariantError is thrown with code "ORDER_ALREADY_CONFIRMED"

    Scenario: assertAll throws ORDER_ALREADY_CANCELLED for cancelled order
      Given an order in "cancelled" status
      When I call orderCancelInvariants.assertAll()
      Then an OrderInvariantError is thrown with code "ORDER_ALREADY_CANCELLED"

    Scenario: validateAll returns valid result for draft order
      Given an order in "draft" status
      When I call orderCancelInvariants.validateAll()
      Then the validation result is valid

    Scenario: validateAll returns single violation for confirmed order
      Given an order in "confirmed" status
      When I call orderCancelInvariants.validateAll()
      Then the validation result is invalid with 1 violation
      And the violation codes include:
        | code                    |
        | ORDER_ALREADY_CONFIRMED |

    Scenario: validateAll returns single violation for cancelled order
      Given an order in "cancelled" status
      When I call orderCancelInvariants.validateAll()
      Then the validation result is invalid with 1 violation
      And the violation codes include:
        | code                    |
        | ORDER_ALREADY_CANCELLED |
