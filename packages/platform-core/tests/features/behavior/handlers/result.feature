@unit @handlers
Feature: Handler Result Helpers

  Result helper functions for dual-write command handlers:
  - successResult: Create success results with event data
  - rejectedResult: Create rejection results for invariant failures
  - failedResult: Create failure results that still emit events

  Rule: successResult creates a success result with status, data, version, and event

    **Invariant:** A success result always contains status "success", typed data, version number, and event data.
    **Verified by:** Structure validation, type preservation, and status literal checks.

    @acceptance-criteria @happy-path
    Scenario: Success result has correct structure
      Given a data payload with orderId "order_123" and customerId "cust_456"
      And a test event
      And a version number 5
      When I create a success result
      Then the result has all expected fields:
        | field    | value      |
        | status   | success    |
        | version  | 5          |
        | orderId  | order_123  |
        | customerId | cust_456 |
      And the result event matches the test event

    Scenario: Success result preserves typed data
      Given a typed data payload with orderId "order_123" and customerId "cust_456"
      And a test event
      When I create a success result with version 1
      Then the result data fields are:
        | field       | value     |
        | orderId     | order_123 |
        | customerId  | cust_456  |

    @validation
    Scenario: Success result returns status as literal type
      Given an empty data payload
      And a test event
      When I create a success result with version 0
      Then the result status is "success"

  Rule: rejectedResult creates a rejection result with code, reason, and optional context

    **Invariant:** A rejected result always contains status "rejected", an error code, and a reason string. Context is included only when explicitly provided.
    **Verified by:** Structure validation, context inclusion/exclusion, and status literal checks.

    @acceptance-criteria @happy-path
    Scenario: Rejected result has code and reason
      When I create a rejected result with code "ORDER_NOT_FOUND" and reason "Order not found"
      Then the rejected result has all expected fields:
        | field  | value            |
        | status | rejected         |
        | code   | ORDER_NOT_FOUND  |
        | reason | Order not found  |

    Scenario: Rejected result includes context when provided
      When I create a rejected result with code "ORDER_NOT_FOUND" and reason "Order not found" and context
      Then the rejected result status is "rejected"
      And the rejected result code is "ORDER_NOT_FOUND"
      And the rejected result context contains orderId "order_123"
      And the rejected result context searchedAt is a number

    @validation
    Scenario: Rejected result omits context when not provided
      When I create a rejected result with code "VALIDATION_ERROR" and reason "Invalid input"
      Then the rejected result does not have a context property

    Scenario: Rejected result returns status as literal type
      When I create a rejected result with code "ERROR" and reason "message"
      Then the rejected result status is "rejected"

  Rule: failedResult creates a failure result with event data and optional fields

    **Invariant:** A failed result always contains status "failed", a reason, and event data. Optional expectedVersion and context are included only when explicitly provided.
    **Verified by:** Structure validation, optional field inclusion/exclusion, and status literal checks.

    @acceptance-criteria @happy-path
    Scenario: Failed result has event data
      Given a test event with eventType "ReservationFailed"
      When I create a failed result with reason "Insufficient stock"
      Then the failed result has all expected fields:
        | field  | value              |
        | status | failed             |
        | reason | Insufficient stock |
      And the failed result event matches the test event

    Scenario: Failed result includes expectedVersion when provided
      Given a test event
      When I create a failed result with reason "Operation failed" and expectedVersion 10
      Then the failed result status is "failed"
      And the failed result expectedVersion is 10

    Scenario: Failed result includes context when provided
      Given a test event
      When I create a failed result with reason "Operation failed" and context
      Then the failed result context is:
        | field             | value |
        | attemptedQuantity | 100   |
        | availableStock    | 50    |

    Scenario: Failed result includes both expectedVersion and context
      Given a test event
      When I create a failed result with reason "Operation failed" and expectedVersion 5 and context
      Then the failed result expectedVersion is 5
      And the failed result context contains detail "extra info"

    @validation
    Scenario: Failed result omits optional properties when not provided
      Given a test event
      When I create a failed result with reason "Simple failure"
      Then the failed result does not have expectedVersion property
      And the failed result does not have context property

    Scenario: Failed result returns status as literal type
      Given a test event
      When I create a failed result with reason "message"
      Then the failed result status is "failed"
