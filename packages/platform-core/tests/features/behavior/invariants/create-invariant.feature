@architect
@invariants
Feature: createInvariant

  As a domain developer
  I want a factory function to create invariants from a specification
  So that domain rules are reusable, composable, and produce structured violations

  # ============================================================================
  # Basic Invariant Creation
  # ============================================================================

  Rule: createInvariant produces an invariant with correct name, code, and methods

    **Invariant:** Every invariant created by the factory exposes name, code, check, assert, and validate.
    **Verified by:** Instantiating an invariant and inspecting its properties and method results.

    @acceptance-criteria @happy-path
    Scenario: Invariant has correct name and code
      Given a "isDraft" invariant with code "NOT_DRAFT" for draft status
      Then the invariant has the following identity:
        | property | value     |
        | name     | isDraft   |
        | code     | NOT_DRAFT |

    Scenario: check returns true when state satisfies the predicate
      Given a "isDraft" invariant with code "NOT_DRAFT" for draft status
      When I check a state with status "draft"
      Then the check result is true

    Scenario: check returns false when state violates the predicate
      Given a "isDraft" invariant with code "NOT_DRAFT" for draft status
      When I check a state with status "submitted"
      Then the check result is false

  # ============================================================================
  # assert() Method
  # ============================================================================

  Rule: assert does not throw for valid state and throws InvariantError for invalid state

    **Invariant:** assert is the throwing counterpart of check -- no-op on valid, structured error on invalid.
    **Verified by:** Calling assert on valid/invalid states and inspecting thrown errors.

    @acceptance-criteria @happy-path
    Scenario: assert does not throw when state is valid
      Given a "isDraft" invariant with code "NOT_DRAFT" for draft status
      When I assert a state with status "draft"
      Then no error is thrown

    Scenario: assert throws InvariantError when state is invalid
      Given a "isDraft" invariant with code "NOT_DRAFT" for draft status
      When I assert a state with status "submitted"
      Then an InvariantError is thrown

    Scenario: assert error has correct code for invalid state
      Given a "isDraft" invariant with code "NOT_DRAFT" for draft status
      When I assert a state with status "confirmed"
      Then the thrown error has code "NOT_DRAFT"

    Scenario: assert error has correct message for invalid state
      Given a "isDraft" invariant with code "NOT_DRAFT" for draft status
      When I assert a state with status "confirmed"
      Then the thrown error has message "Expected draft status, got confirmed"

    Scenario: assert error has correct context for invalid state
      Given a "isDraft" invariant with code "NOT_DRAFT" for draft status
      When I assert a state with orderId "order-123" and status "submitted"
      Then the thrown error has context:
        | key           | value     |
        | orderId       | order-123 |
        | currentStatus | submitted |

  # ============================================================================
  # validate() Method
  # ============================================================================

  Rule: validate returns structured result without throwing

    **Invariant:** validate never throws -- it returns { valid: true } or a violation object.
    **Verified by:** Calling validate on valid/invalid states and inspecting the result shape.

    @acceptance-criteria @happy-path
    Scenario: validate returns valid result for valid state
      Given a "isDraft" invariant with code "NOT_DRAFT" for draft status
      When I validate a state with status "draft"
      Then the validation result is valid

    Scenario: validate returns violation details for invalid state
      Given a "isDraft" invariant with code "NOT_DRAFT" for draft status
      When I validate a state with orderId "order-123" and status "submitted"
      Then the validation result is invalid with:
        | property | value                                |
        | code     | NOT_DRAFT                            |
        | message  | Expected draft status, got submitted |

  # ============================================================================
  # Without Context Function
  # ============================================================================

  Rule: Invariant without context function omits context from errors and results

    **Invariant:** When no context function is provided, error.context and result.context are undefined.
    **Verified by:** Creating an invariant without a context function and checking assert/validate output.

    @acceptance-criteria @happy-path
    Scenario: assert error has undefined context when no context function
      Given a "hasItems" invariant with code "NO_ITEMS" without context function
      When I assert the hasItems invariant with an empty items state
      Then the thrown error has undefined context

    Scenario: validate result has undefined context when no context function
      Given a "hasItems" invariant with code "NO_ITEMS" without context function
      When I validate the hasItems invariant with an empty items state
      Then the validation result is invalid without context with:
        | property | value                               |
        | code     | NO_ITEMS                            |
        | message  | Order must have at least one item   |

  # ============================================================================
  # Parameterized Invariant
  # ============================================================================

  Rule: Parameterized invariants pass extra arguments to check, message, and context

    **Invariant:** Extra parameters flow through to all invariant methods (check, assert, validate).
    **Verified by:** Creating a parameterized invariant and verifying parameter usage in each method.

    @acceptance-criteria @happy-path
    Scenario: check uses parameter to find matching item
      Given a parameterized "itemExists" invariant with code "ITEM_NOT_FOUND"
      And a state with items:
        | productId | quantity |
        | prod-1    | 2        |
      When I check the parameterized invariant with parameter "prod-1"
      Then the check result is true

    @validation
    Scenario: check returns false when parameter does not match
      Given a parameterized "itemExists" invariant with code "ITEM_NOT_FOUND"
      And a state with items:
        | productId | quantity |
        | prod-1    | 2        |
      When I check the parameterized invariant with parameter "prod-2"
      Then the check result is false

    Scenario: assert uses parameter in error message and context
      Given a parameterized "itemExists" invariant with code "ITEM_NOT_FOUND"
      And a state with orderId "order-123" and items:
        | productId | quantity |
        | prod-1    | 2        |
      When I assert the parameterized invariant with parameter "prod-missing"
      Then the thrown error has message "Item prod-missing not found in order order-123"
      And the thrown error has context:
        | key       | value        |
        | orderId   | order-123    |
        | productId | prod-missing |

    Scenario: validate uses parameter in result
      Given a parameterized "itemExists" invariant with code "ITEM_NOT_FOUND"
      And a state with orderId "order-456" and no items
      When I validate the parameterized invariant with parameter "prod-xyz"
      Then the validation result is invalid with:
        | property | value                                        |
        | message  | Item prod-xyz not found in order order-456    |

  # ============================================================================
  # Error Class Integration
  # ============================================================================

  Rule: createInvariant uses the provided error class for thrown errors

    **Invariant:** The error thrown by assert is an instance of both the provided class and InvariantError.
    **Verified by:** Creating an invariant with a custom error class and verifying instanceof checks.

    @acceptance-criteria @happy-path
    Scenario: assert throws error of the correct custom class
      Given an invariant using a custom "Order" error class
      When I assert the custom invariant with invalid state
      Then the thrown error is an instance of the custom error class
      And the thrown error is an instance of InvariantError
      And the thrown error has name "OrderInvariantError"
