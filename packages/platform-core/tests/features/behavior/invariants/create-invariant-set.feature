@architect
@invariants
Feature: createInvariantSet

  As a domain developer
  I want to group invariants into a set and validate them together
  So that I can check, assert, or validate multiple domain rules in one call

  # ============================================================================
  # Set Creation
  # ============================================================================

  Rule: createInvariantSet creates a set with all invariants accessible and immutable

    **Invariant:** The invariant set exposes a frozen copy of the input array.
    **Verified by:** Inspecting the invariants property and verifying immutability.

    @acceptance-criteria @happy-path
    Scenario: Set contains all provided invariants
      Given an invariant set with "isDraft" and "hasItems"
      Then the set has the following invariant names:
        | name     |
        | isDraft  |
        | hasItems |

    Scenario: Invariants array is immutable and a frozen copy
      Given an invariant set with "isDraft" and "hasItems" from a mutable array
      Then the invariants array is frozen
      And mutating the original array does not affect the set

  # ============================================================================
  # checkAll()
  # ============================================================================

  Rule: checkAll returns true when all invariants pass and false when any fail

    **Invariant:** checkAll is a boolean aggregator over all invariants in the set.
    **Verified by:** Calling checkAll with various valid and invalid states.

    @acceptance-criteria @happy-path
    Scenario: checkAll returns true when all invariants pass
      Given an invariant set with "isDraft" and "hasItems"
      When I checkAll with status "draft" and 1 item
      Then the checkAll result is true

    Scenario: checkAll returns false when first invariant fails
      Given an invariant set with "isDraft" and "hasItems"
      When I checkAll with status "submitted" and 1 item
      Then the checkAll result is false

    Scenario: checkAll returns false when second invariant fails
      Given an invariant set with "isDraft" and "hasItems"
      When I checkAll with status "draft" and 0 items
      Then the checkAll result is false

    Scenario: checkAll returns false when all invariants fail
      Given an invariant set with "isDraft" and "hasItems"
      When I checkAll with status "submitted" and 0 items
      Then the checkAll result is false

  # ============================================================================
  # assertAll()
  # ============================================================================

  Rule: assertAll does not throw when all pass and throws on first failure with fail-fast

    **Invariant:** assertAll iterates invariants in order and throws on the first violation.
    **Verified by:** Calling assertAll with valid/invalid states and inspecting errors.

    @acceptance-criteria @happy-path
    Scenario: assertAll does not throw when all invariants pass
      Given an invariant set with "isDraft", "hasItems", and "notTooManyItems"
      When I assertAll with status "draft" and 1 item
      Then no assertAll error is thrown

    Scenario: assertAll throws on first failure with fail-fast
      Given an invariant set with "isDraft", "hasItems", and "notTooManyItems"
      When I assertAll with status "submitted" and 0 items
      Then the assertAll error has code "NOT_DRAFT"

    Scenario: assertAll throws correct error class
      Given an invariant set with "isDraft", "hasItems", and "notTooManyItems"
      When I assertAll with status "confirmed" and 1 item
      Then the assertAll error is an instance of TestInvariantError and InvariantError

    Scenario: assertAll throws error with context when provided
      Given an invariant set with "isDraft", "hasItems", and "notTooManyItems"
      When I assertAll with orderId "order-123" and status "submitted" and 1 item
      Then the assertAll error has context with orderId "order-123"

  # ============================================================================
  # validateAll()
  # ============================================================================

  Rule: validateAll collects all violations without short-circuiting

    **Invariant:** validateAll returns a structured result with all violations, not just the first.
    **Verified by:** Calling validateAll with various invalid states and inspecting violation lists.

    @acceptance-criteria @happy-path
    Scenario: validateAll returns valid when all invariants pass
      Given an invariant set with "isDraft", "hasItems", and "notTooManyItems"
      When I validateAll with status "draft" and 1 item
      Then the validateAll result is valid

    Scenario: validateAll collects single violation
      Given an invariant set with "isDraft", "hasItems", and "notTooManyItems"
      When I validateAll with orderId "order-123" and status "submitted" and 1 item
      Then the validateAll result is invalid with 1 violation
      And the validateAll violation 0 has:
        | property | value                        |
        | code     | NOT_DRAFT                    |
        | message  | Expected draft, got submitted |

    Scenario: validateAll collects multiple violations without short-circuiting
      Given an invariant set with "isDraft", "hasItems", and "notTooManyItems"
      When I validateAll with status "submitted" and 0 items
      Then the validateAll result is invalid with 2 violations
      And the validateAll violation codes include:
        | code      |
        | NOT_DRAFT |
        | NO_ITEMS  |

    Scenario: validateAll collects violations from non-adjacent invariants
      Given an invariant set with "isDraft", "hasItems", and "notTooManyItems"
      When I validateAll with status "submitted" and 15 items
      Then the validateAll result is invalid with 2 violations
      And the validateAll violation codes include:
        | code           |
        | NOT_DRAFT      |
        | TOO_MANY_ITEMS |

    Scenario: validateAll omits context when invariant has no context function
      Given an invariant set with "isDraft", "hasItems", and "notTooManyItems"
      When I validateAll with status "draft" and 0 items
      Then the validateAll result is invalid with 1 violation
      And the validateAll violation 0 has code "NO_ITEMS" and undefined context

  # ============================================================================
  # Empty and Single Invariant Sets
  # ============================================================================

  Rule: Empty invariant set always passes all operations

    **Invariant:** An empty set has no invariants to violate, so all operations succeed.
    **Verified by:** Calling checkAll, assertAll, and validateAll on an empty set.

    @acceptance-criteria @happy-path
    Scenario: Empty set passes all operations
      Given an empty invariant set
      Then checkAll returns true for the empty set
      And assertAll does not throw for the empty set
      And validateAll returns valid for the empty set

  Rule: Single invariant set works correctly

    **Invariant:** A set with one invariant behaves identically to calling that invariant directly.
    **Verified by:** Calling all three operations on a single-invariant set with valid state.

    Scenario: Single invariant set passes all operations with valid state
      Given a single invariant set with "isDraft"
      When I operate on the single set with status "draft"
      Then the single set checkAll result is true
      And the single set assertAll does not throw
      And the single set validateAll returns valid
