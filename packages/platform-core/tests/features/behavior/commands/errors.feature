@acceptance-criteria
Feature: Command Error Categorization and Recovery

  As a platform developer
  I want a structured error system with categories and recovery semantics
  So that command failures are classified, serializable, and recoverable

  Command errors are classified into four categories: domain, validation,
  concurrency, and infrastructure. Each category has specific recovery
  semantics. Factory functions provide convenient creation patterns, and
  retry delay helpers compute category-aware backoff strategies.

  # ============================================================================
  # ErrorCategory Constants
  # ============================================================================

  Rule: ERROR_CATEGORIES contains all four error categories

    **Invariant:** The constant is a tuple of exactly four categories.
    **Verified by:** Length check and element containment assertions.

    @happy-path
    Scenario: ERROR_CATEGORIES has exactly four entries with correct values
      Given the ERROR_CATEGORIES constant
      Then it has length 4
      And it contains all categories:
        | category    |
        | domain      |
        | validation  |
        | concurrency |
        | infra       |

  Rule: ErrorCategory enum maps to correct string values

    **Invariant:** Each enum member resolves to its expected lowercase string.
    **Verified by:** Direct equality assertions for each member.

    @happy-path
    Scenario: ErrorCategory members have correct string values
      Then the ErrorCategory enum values are:
        | member         | value       |
        | DOMAIN         | domain      |
        | VALIDATION     | validation  |
        | CONCURRENCY    | concurrency |
        | INFRASTRUCTURE | infra       |

  # ============================================================================
  # isErrorCategory Type Guard
  # ============================================================================

  Rule: isErrorCategory returns true only for valid category strings

    **Invariant:** Only the four lowercase category strings pass the type guard.
    **Verified by:** Boolean return value assertions for valid and invalid inputs.

    @happy-path
    Scenario: Type guard accepts valid error categories
      When isErrorCategory is called with valid values:
        | value       |
        | domain      |
        | validation  |
        | concurrency |
        | infra       |
      Then each isErrorCategory call returns true

    @validation
    Scenario: Type guard rejects invalid values
      When isErrorCategory is called with invalid values:
        | value     | type      |
        | invalid   | string    |
        | DOMAIN    | string    |
        | null      | null      |
        | undefined | undefined |
        | 123       | number    |
      Then each isErrorCategory call returns false

  # ============================================================================
  # CommandError Constructor
  # ============================================================================

  Rule: CommandError constructor creates error with all properties

    **Invariant:** All constructor arguments are stored as accessible properties.
    **Verified by:** Property equality assertions after construction.

    @happy-path
    Scenario: CommandError is created with all properties
      When a CommandError is created with category "domain", code "ORDER_NOT_FOUND", message "Order was not found", recoverable false, and context orderId "123"
      Then the error has all expected properties:
        | property    | value           |
        | category    | domain          |
        | code        | ORDER_NOT_FOUND |
        | message     | Order was not found |
        | recoverable | false           |
        | name        | CommandError    |
      And the error context has orderId "123"

  Rule: CommandError extends Error

    **Invariant:** CommandError is an instance of Error.
    **Verified by:** instanceof check.

    @happy-path
    Scenario: CommandError is an instance of Error
      When a CommandError is created with category "domain", code "TEST", and message "test message"
      Then it is an instance of Error

  # ============================================================================
  # CommandError.from Static Method
  # ============================================================================

  Rule: CommandError.from returns CommandError instances unchanged

    **Invariant:** Passing a CommandError to from() returns the same reference.
    **Verified by:** Reference identity check.

    @happy-path
    Scenario: CommandError.from returns existing CommandError unchanged
      Given a CommandError with category "domain", code "TEST", and message "test"
      When CommandError.from is called with that error
      Then the result is the same reference as the original

  Rule: CommandError.from wraps non-CommandError values as infrastructure errors

    **Invariant:** Regular errors, strings, and unknown values are wrapped as recoverable infrastructure errors.
    **Verified by:** Category, code, message, and recoverable property assertions.

    @validation
    Scenario: CommandError.from wraps a regular Error
      When CommandError.from is called with a regular Error "Something went wrong" and code "WRAPPED_ERROR"
      Then the wrapped error has category "infra", code "WRAPPED_ERROR", message "Something went wrong", and is recoverable
      And the wrapped error context has originalError "Error"

    @validation
    Scenario: CommandError.from wraps a string value
      When CommandError.from is called with string "string error"
      Then the wrapped error has category "infra" and message "string error"

    @validation
    Scenario: CommandError.from wraps an unknown value
      When CommandError.from is called with number 123
      Then the wrapped error has message "123"

  # ============================================================================
  # CommandError.toJSON
  # ============================================================================

  Rule: CommandError.toJSON serializes to a plain object

    **Invariant:** toJSON returns a plain object with all error properties.
    **Verified by:** Deep equality assertion against expected shape.

    @happy-path
    Scenario: toJSON serializes error with context
      Given a CommandError with category "domain", code "ORDER_NOT_FOUND", message "Order was not found", recoverable false, and context orderId "123"
      When toJSON is called
      Then the JSON contains all properties:
        | property    | value               |
        | name        | CommandError        |
        | category    | domain              |
        | code        | ORDER_NOT_FOUND     |
        | message     | Order was not found |
        | recoverable | false               |
      And the JSON context has orderId "123"

    @validation
    Scenario: toJSON handles undefined context
      Given a CommandError with category "domain", code "TEST", message "test", and no context
      When toJSON is called on it
      Then the JSON context is undefined

  # ============================================================================
  # CommandErrors Factory Functions
  # ============================================================================

  Rule: CommandErrors.domain creates non-recoverable domain errors

    **Invariant:** Domain errors have category "domain" and recoverable false.
    **Verified by:** Property assertions on factory output.

    @happy-path
    Scenario: Factory creates domain error
      When CommandErrors.domain is called with code "ORDER_ALREADY_SUBMITTED" and message "Order has already been submitted"
      Then the factory error has category "domain", code "ORDER_ALREADY_SUBMITTED", and is not recoverable

  Rule: CommandErrors.validation creates non-recoverable validation errors

    **Invariant:** Validation errors have category "validation" and recoverable false.
    **Verified by:** Property assertions on factory output.

    @happy-path
    Scenario: Factory creates validation error
      When CommandErrors.validation is called with code "INVALID_EMAIL" and message "Email format is invalid"
      Then the factory error has category "validation" and is not recoverable

  Rule: CommandErrors.concurrency creates recoverable concurrency errors

    **Invariant:** Concurrency errors have category "concurrency" and recoverable true.
    **Verified by:** Property assertions on factory output.

    @happy-path
    Scenario: Factory creates concurrency error
      When CommandErrors.concurrency is called with code "VERSION_CONFLICT" and message "Resource was modified by another request"
      Then the factory error has category "concurrency" and is recoverable

  Rule: CommandErrors.infrastructure creates recoverable infrastructure errors

    **Invariant:** Infrastructure errors have category "infra" and recoverable true.
    **Verified by:** Property assertions on factory output.

    @happy-path
    Scenario: Factory creates infrastructure error
      When CommandErrors.infrastructure is called with code "DATABASE_UNAVAILABLE" and message "Database connection failed"
      Then the factory error has category "infra" and is recoverable

  Rule: CommandErrors.notFound creates domain errors with formatted messages

    **Invariant:** Not-found errors include entity type, ID, and formatted message.
    **Verified by:** Code, message, category, and context property assertions.

    @happy-path
    Scenario: Factory creates not found error
      When CommandErrors.notFound is called with entity "Order" and id "ord_123"
      Then the error has code "ORDER_NOT_FOUND" and message 'Order with ID "ord_123" was not found'
      And the error has category "domain" and context entityType "Order" and entityId "ord_123"

  Rule: CommandErrors.alreadyExists creates domain errors with formatted messages

    **Invariant:** Already-exists errors include entity type, ID, and formatted message.
    **Verified by:** Code and message assertions.

    @happy-path
    Scenario: Factory creates already exists error
      When CommandErrors.alreadyExists is called with entity "Order" and id "ord_123"
      Then the error has code "ORDER_ALREADY_EXISTS" and message 'Order with ID "ord_123" already exists'

  Rule: CommandErrors.invalidState creates domain errors with state info

    **Invariant:** Invalid-state errors include entity type, current state, and required state.
    **Verified by:** Code, message, and context assertions.

    @happy-path
    Scenario: Factory creates invalid state error
      When CommandErrors.invalidState is called with entity "Order", current "draft", and required "submitted"
      Then the error has code "INVALID_ORDER_STATE" and message 'Order is in "draft" state but "submitted" is required'
      And the error context has entityType "Order", currentState "draft", and requiredState "submitted"

  Rule: CommandErrors.unauthorized creates domain errors for denied actions

    **Invariant:** Unauthorized errors have code "UNAUTHORIZED" and formatted message.
    **Verified by:** Code and message assertions.

    @happy-path
    Scenario: Factory creates unauthorized error
      When CommandErrors.unauthorized is called with action "delete order"
      Then the error has code "UNAUTHORIZED" and message "Not authorized to perform action: delete order"

  Rule: CommandErrors.rateLimited creates recoverable infrastructure errors with retry info

    **Invariant:** Rate-limited errors are recoverable with retryAfterMs in context.
    **Verified by:** Category, recoverable, and context assertions.

    @happy-path
    Scenario: Factory creates rate limited error
      When CommandErrors.rateLimited is called with retryAfterMs 5000
      Then the error has code "RATE_LIMITED", category "infra", is recoverable, and context retryAfterMs 5000

  # ============================================================================
  # isCommandErrorOfCategory
  # ============================================================================

  Rule: isCommandErrorOfCategory checks category membership

    **Invariant:** Returns true only for CommandError instances with matching category.
    **Verified by:** Boolean assertions for matching, non-matching, and non-CommandError inputs.

    @happy-path
    Scenario: Returns true for matching category
      Given a CommandError with category "domain"
      Then isCommandErrorOfCategory returns true for category "domain"

    @validation
    Scenario: Returns false for non-matching category
      Given a CommandError with category "domain"
      Then isCommandErrorOfCategory returns false for category "validation"

    @validation
    Scenario: Returns false for non-CommandError
      Given a regular Error "test"
      Then isCommandErrorOfCategory returns false for any category

  # ============================================================================
  # isRecoverableError
  # ============================================================================

  Rule: isRecoverableError checks recovery semantics

    **Invariant:** Recoverable CommandErrors and unknown errors return true; non-recoverable return false.
    **Verified by:** Boolean assertions for concurrency, domain, and regular errors.

    @happy-path
    Scenario: Recoverable errors are identified correctly
      Then isRecoverableError returns true for a concurrency error
      And isRecoverableError returns false for a domain error
      And isRecoverableError returns true for a regular Error

  # ============================================================================
  # getRetryDelay
  # ============================================================================

  Rule: getRetryDelay returns -1 for non-recoverable errors

    **Invariant:** Non-recoverable errors cannot be retried.
    **Verified by:** Return value of -1 for domain errors.

    @validation
    Scenario: Non-recoverable error gets delay of -1
      When getRetryDelay is called with a domain error at attempt 1
      Then the delay is -1

  Rule: getRetryDelay computes quick backoff for concurrency errors capped at 500ms

    **Invariant:** Concurrency delays are 50*2^(attempt-1) capped at 500ms.
    **Verified by:** Delay value assertions at multiple attempts.

    @happy-path
    Scenario: Concurrency error delays escalate then cap
      Then getRetryDelay for concurrency errors returns:
        | attempt | delay |
        | 1       | 50    |
        | 2       | 100   |
        | 3       | 200   |
        | 10      | 500   |

  Rule: getRetryDelay computes exponential backoff for infrastructure errors capped at 30s

    **Invariant:** Infrastructure delays are 1000*2^(attempt-1) capped at 30000ms.
    **Verified by:** Delay value assertions at multiple attempts.

    @happy-path
    Scenario: Infrastructure error delays escalate then cap
      Then getRetryDelay for infrastructure errors returns:
        | attempt | delay |
        | 1       | 1000  |
        | 2       | 2000  |
        | 3       | 4000  |
        | 10      | 30000 |

  Rule: getRetryDelay treats unknown errors like infrastructure errors

    **Invariant:** Unknown errors use infrastructure backoff strategy.
    **Verified by:** Delay matches infrastructure delay for same attempt.

    @happy-path
    Scenario: Unknown error gets infrastructure-style delay
      When getRetryDelay is called with a regular Error at attempt 1
      Then the delay is 1000
