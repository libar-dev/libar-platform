@libar-docs
Feature: Command Logging Helpers

  As a platform developer
  I want structured logging helpers for command lifecycle events
  So that I can trace command execution with consistent field naming

  # ============================================================================
  # logCommandStart
  # ============================================================================

  Rule: logCommandStart logs at INFO level with full context

    **Invariant:** Every command start is logged at INFO with all context fields.
    **Verified by:** Level, message, and data assertions.

    @acceptance-criteria @happy-path
    Scenario: Command start is logged at INFO level
      Given a base command log context
      When I call logCommandStart
      Then the log has 1 entry at level "INFO" with message "Command started"
      And the log data equals the base context

    @acceptance-criteria @validation
    Scenario: Entity-specific fields are included in start log data
      Given a base command log context with extra fields
      When I call logCommandStart with the extended context
      Then the log data equals the extended context

  # ============================================================================
  # logCommandSuccess
  # ============================================================================

  Rule: logCommandSuccess logs at INFO level with version and eventType

    **Invariant:** Success logs merge context with result fields (version, eventType).
    **Verified by:** Level, message, and merged data assertions.

    @acceptance-criteria @happy-path
    Scenario: Command success is logged at INFO level with result
      Given a base command log context
      When I call logCommandSuccess with version 1 and eventType "OrderCreated"
      Then the success log data equals the base context merged with:
        | field     | value        |
        | version   | 1            |
        | eventType | OrderCreated |

    @acceptance-criteria @validation
    Scenario: Context fields are preserved alongside result fields
      Given a base command log context
      When I call logCommandSuccess with version 5 and eventType "OrderConfirmed"
      Then the log data has all expected properties:
        | property      | value          |
        | commandType   | CreateOrder    |
        | commandId     | cmd-123        |
        | correlationId | corr-456       |
        | orderId       | order-789      |
        | version       | 5              |
        | eventType     | OrderConfirmed |

  # ============================================================================
  # logCommandRejected
  # ============================================================================

  Rule: logCommandRejected logs at WARN level with rejection details

    **Invariant:** Rejection logs use prefixed field names (rejectionCode, rejectionMessage).
    **Verified by:** Level, message, and field name assertions.

    @acceptance-criteria @happy-path
    Scenario: Command rejection is logged at WARN level
      Given a base command log context
      When I call logCommandRejected with code "INVALID_STATE" and message "Order already confirmed"
      Then the rejection log data equals the base context merged with:
        | field            | value                   |
        | rejectionCode    | INVALID_STATE           |
        | rejectionMessage | Order already confirmed |

    @acceptance-criteria @validation
    Scenario: Rejection uses prefixed field names not raw code/message
      Given a base command log context
      When I call logCommandRejected with code "DUPLICATE" and message "Order ID already exists"
      Then the log data has expected properties:
        | property         | value                  |
        | rejectionCode    | DUPLICATE              |
        | rejectionMessage | Order ID already exists |
      And the log data does not have properties:
        | property |
        | code     |
        | message  |

  # ============================================================================
  # logCommandFailed
  # ============================================================================

  Rule: logCommandFailed logs business failures at WARN level

    **Invariant:** Business failure logs use failureReason (not reason) field name.
    **Verified by:** Level, message, and field name assertions.

    @acceptance-criteria @happy-path
    Scenario: Business failure is logged at WARN level
      Given a base command log context
      When I call logCommandFailed with eventType "ReservationFailed" and reason "Insufficient stock"
      Then the failure log data equals the base context merged with:
        | field         | value              |
        | eventType     | ReservationFailed  |
        | failureReason | Insufficient stock |

    @acceptance-criteria @validation
    Scenario: Business failure uses failureReason not reason
      Given a base command log context
      When I call logCommandFailed with eventType "PaymentFailed" and reason "Card declined"
      Then the log data has failureReason "Card declined"
      And the log data does not have property "reason"

  # ============================================================================
  # logCommandError
  # ============================================================================

  Rule: logCommandError logs unexpected errors at ERROR level

    **Invariant:** Error objects are decomposed to message+stack; non-Error values are stringified.
    **Verified by:** Level, message, and error serialization assertions.

    @acceptance-criteria @happy-path
    Scenario: Error object is logged at ERROR level with message and stack
      Given a base command log context
      When I call logCommandError with an Error "Database connection failed"
      Then the log has 1 entry at level "ERROR" with message "Command failed"
      And the log error data has message "Database connection failed"
      And the log error data has a stack trace containing "Database connection failed"

    @acceptance-criteria @validation
    Scenario: String error is logged directly
      Given a base command log context
      When I call logCommandError with string "Something went wrong"
      Then the log has 1 entry at level "ERROR" with message "Command failed"
      And the log data error field equals "Something went wrong"

    @acceptance-criteria @validation
    Scenario: Non-string non-Error values are stringified
      Given a base command log context
      When I call logCommandError with a plain object
      Then the log data error field equals "[object Object]"

    @acceptance-criteria @validation
    Scenario: Null error is stringified
      Given a base command log context
      When I call logCommandError with null
      Then the log data error field equals "null"

    @acceptance-criteria @validation
    Scenario: Undefined error is stringified
      Given a base command log context
      When I call logCommandError with undefined
      Then the log data error field equals "undefined"

    @acceptance-criteria @validation
    Scenario: Stack trace is preserved for debugging
      Given a base command log context
      When I call logCommandError with an Error "Test error"
      Then the log error data has a stack trace containing "Test error"

  # ============================================================================
  # Integration Patterns
  # ============================================================================

  Rule: Command lifecycle can be traced through sequential log entries

    **Invariant:** Each lifecycle phase produces exactly one log entry with correct level.
    **Verified by:** Log count and level distribution assertions.

    @acceptance-criteria @happy-path
    Scenario: Full success lifecycle produces start and success logs
      Given a base command log context
      When I log a full success lifecycle
      Then there are 2 log entries with messages:
        | message           |
        | Command started   |
        | Command succeeded |

    @acceptance-criteria @validation
    Scenario: Rejection lifecycle produces INFO and WARN logs
      Given a base command log context
      When I log a rejection lifecycle
      Then there are 2 log entries
      And the log level counts are:
        | level | count |
        | INFO  | 1     |
        | WARN  | 1     |

    @acceptance-criteria @validation
    Scenario: Error lifecycle produces INFO and ERROR logs
      Given a base command log context
      When I log an error lifecycle
      Then there are 2 log entries
      And the log level counts are:
        | level | count |
        | INFO  | 1     |
        | ERROR | 1     |
