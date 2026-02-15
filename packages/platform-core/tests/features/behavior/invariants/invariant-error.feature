@libar-docs
@invariants
Feature: InvariantError

  As a domain developer
  I want a base invariant error class with factory and type guards
  So that domain rule violations are expressed as typed, inspectable errors

  # ============================================================================
  # Constructor
  # ============================================================================

  Rule: InvariantError constructor creates a properly structured error

    **Invariant:** Every InvariantError has a code, message, name, and is an Error instance.

    @acceptance-criteria @happy-path
    Scenario: Creating an error with code and message
      Given an InvariantError with code "ORDER_NOT_FOUND" and message "Order not found"
      Then the error is an instance of Error
      And the error is an instance of InvariantError
      And the error has the following properties:
        | property | value            |
        | code     | ORDER_NOT_FOUND  |
        | message  | Order not found  |
        | name     | InvariantError   |

    Scenario: Including context when provided
      Given an InvariantError with code "VALIDATION_ERROR" and message "Invalid quantity" and context:
        | key       | value    |
        | productId | prod_123 |
        | quantity  | -5       |
      Then the error context equals the provided context

    Scenario: Context is undefined when not provided
      Given an InvariantError with code "SOME_ERROR" and message "message" without context
      Then the error context is undefined

    Scenario: Error has proper stack trace
      Given an InvariantError with code "ERROR" and message "message" without context
      Then the error stack is defined
      And the error stack contains "InvariantError"

  # ============================================================================
  # forContext Factory
  # ============================================================================

  Rule: forContext factory creates context-specific error classes

    **Invariant:** Each context produces a uniquely named InvariantError subclass.

    @acceptance-criteria @happy-path
    Scenario: Creating a context-specific error class
      Given a context-specific error class for "Order"
      When I create an error with code "ORDER_NOT_FOUND" and message "Order not found"
      Then the error is an instance of InvariantError
      And the error has the following properties:
        | property | value                  |
        | name     | OrderInvariantError    |
        | code     | ORDER_NOT_FOUND        |

    Scenario: Different contexts produce different classes
      Given a context-specific error class for "Order"
      And a context-specific error class for "Inventory"
      When I create an Order error with code "ORDER_NOT_FOUND" and message "not found"
      And I create an Inventory error with code "PRODUCT_NOT_FOUND" and message "not found"
      Then the Order error name is "OrderInvariantError"
      And the Inventory error name is "InventoryInvariantError"
      And both errors are instances of InvariantError

    Scenario: Typed error codes are supported
      Given a context-specific error class for "Order" with typed codes
      When I create errors with each typed code
      Then all errors compile and instantiate successfully

    Scenario: Context-specific errors include context data
      Given a context-specific error class for "Product"
      When I create an error with code "OUT_OF_STOCK" and message "Product out of stock" and context:
        | key       | value    |
        | productId | prod_456 |
        | requested | 10       |
        | available | 0        |
      Then the error context equals the provided context

    Scenario: Context-specific class has proper constructor name
      Given a context-specific error class for "Customer"
      Then the class name is "CustomerInvariantError"

  # ============================================================================
  # isInvariantError Type Guard
  # ============================================================================

  Rule: isInvariantError type guard identifies InvariantError instances

    **Invariant:** Only actual InvariantError instances return true.

    @acceptance-criteria @happy-path
    Scenario: Returns true for InvariantError instances
      Given an InvariantError with code "CODE" and message "message" without context
      Then isInvariantError returns true

    Scenario: Returns true for context-specific error instances
      Given a context-specific error class for "Order"
      When I create an error with code "CODE" and message "message"
      Then isInvariantError returns true for the context error

    @validation
    Scenario: Returns false for regular Error instances
      Given a regular Error with message "message"
      Then isInvariantError returns false

    @validation
    Scenario: Returns false for non-error values
      Then isInvariantError returns false for all of:
        | value     |
        | null      |
        | undefined |
        | string    |
        | object    |

  # ============================================================================
  # hasCode Type Guard
  # ============================================================================

  Rule: hasCode type guard checks error codes

    **Invariant:** hasCode returns true only for InvariantError instances with the matching code.

    @acceptance-criteria @happy-path
    Scenario: Returns true when error has the specified code
      Given an InvariantError with code "ORDER_NOT_FOUND" and message "message" without context
      Then hasCode with "ORDER_NOT_FOUND" returns true

    @validation
    Scenario: Returns false when error has a different code
      Given an InvariantError with code "ORDER_NOT_FOUND" and message "message" without context
      Then hasCode with "ORDER_ALREADY_EXISTS" returns false

    @validation
    Scenario: Returns false for non-InvariantError values
      Then hasCode returns false for all of:
        | value       | code |
        | regularError | CODE |
        | null         | CODE |

    Scenario: Works with context-specific errors
      Given a context-specific error class for "Inventory"
      When I create an error with code "OUT_OF_STOCK" and message "message"
      Then hasCode with "OUT_OF_STOCK" returns true for the context error
      And hasCode with "OTHER_CODE" returns false for the context error
