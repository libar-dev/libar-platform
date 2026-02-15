Feature: Agent Dead Letter Queue

  Pure domain functions for agent dead letter queue management:
  error message sanitization, factory functions, status transitions,
  type guards, validation, and Zod schema enforcement.

  Background:
    Given the module is imported from platform-core

  Rule: Error codes are well-defined constants
    **Invariant:** DEAD_LETTER_ERROR_CODES contains exactly 3 named error codes
    **Verified by:** Scenarios checking each code value and total count

    @acceptance-criteria @happy-path
    Scenario: Contains all expected error codes
      Then DEAD_LETTER_ERROR_CODES contains the following entries:
        | code                      | value                     |
        | DEAD_LETTER_NOT_FOUND     | DEAD_LETTER_NOT_FOUND     |
        | INVALID_STATUS_TRANSITION | INVALID_STATUS_TRANSITION |
        | ALREADY_PROCESSED         | ALREADY_PROCESSED         |

    Scenario: Has exactly 3 error codes
      Then DEAD_LETTER_ERROR_CODES has exactly 3 keys

  Rule: Status types enumerate all valid dead letter statuses
    **Invariant:** AGENT_DEAD_LETTER_STATUSES is a readonly tuple of pending, replayed, ignored
    **Verified by:** Scenarios checking tuple contents and type guard behavior

    Scenario: Contains all three statuses in order
      Then AGENT_DEAD_LETTER_STATUSES equals pending, replayed, ignored

    Scenario: Is a readonly tuple with 3 elements
      Then AGENT_DEAD_LETTER_STATUSES is an array with 3 elements

    Scenario: Type guard accepts valid statuses
      Then isAgentDeadLetterStatus returns true for the following values:
        | value    |
        | pending  |
        | replayed |
        | ignored  |

    Scenario: Type guard rejects invalid values
      Then isAgentDeadLetterStatus returns false for the following values:
        | value     |
        | invalid   |
        | PENDING   |
        | Replayed  |
        |           |

    Scenario: Type guard rejects non-string types
      Then isAgentDeadLetterStatus returns false for numbers, null, undefined, objects, and arrays

  Rule: Zod status schema validates status strings
    **Invariant:** AgentDeadLetterStatusSchema accepts only the 3 valid status strings
    **Verified by:** Scenarios for valid and invalid status values

    Scenario: Accepts all valid statuses
      Then AgentDeadLetterStatusSchema accepts all AGENT_DEAD_LETTER_STATUSES

    Scenario: Rejects invalid status values
      Then AgentDeadLetterStatusSchema rejects the following values:
        | value      |
        | processing |
        | PENDING    |
        | Ignored    |
        |            |

  Rule: Zod context schema validates dead letter context objects
    **Invariant:** AgentDeadLetterContextSchema accepts partial context and rejects unknown fields
    **Verified by:** Scenarios for full, partial, empty, and invalid contexts

    Scenario: Accepts valid context with all fields
      Given a test context with correlationId "corr-123" and errorCode "LLM_TIMEOUT" and triggeringPattern "churn-risk"
      Then AgentDeadLetterContextSchema accepts the context

    Scenario: Accepts context with only correlationId
      Given a context with only correlationId "corr-123"
      Then AgentDeadLetterContextSchema accepts the context

    Scenario: Accepts context with only errorCode
      Given a context with only errorCode "LLM_TIMEOUT"
      Then AgentDeadLetterContextSchema accepts the context

    Scenario: Accepts empty context object
      Given an empty context object
      Then AgentDeadLetterContextSchema accepts the context

    Scenario: Rejects context with unknown fields in strict mode
      Given a context with correlationId "corr-123" and an unknown field
      Then AgentDeadLetterContextSchema rejects the context

  Rule: Zod dead letter schema validates complete dead letter objects
    **Invariant:** AgentDeadLetterSchema enforces required fields, non-empty strings, and non-negative positions
    **Verified by:** Scenarios for valid, invalid, and edge-case dead letter objects

    Scenario: Accepts valid dead letter
      Given a valid test dead letter
      Then AgentDeadLetterSchema accepts the dead letter

    Scenario: Accepts dead letter with context
      Given a valid test dead letter with context
      Then AgentDeadLetterSchema accepts the dead letter

    Scenario: Rejects dead letter with empty agentId
      Given a test dead letter with agentId ""
      Then AgentDeadLetterSchema rejects the dead letter

    Scenario: Rejects dead letter with empty subscriptionId
      Given a test dead letter with subscriptionId ""
      Then AgentDeadLetterSchema rejects the dead letter

    Scenario: Rejects dead letter with empty eventId
      Given a test dead letter with eventId ""
      Then AgentDeadLetterSchema rejects the dead letter

    Scenario: Rejects dead letter with negative globalPosition
      Given a test dead letter with globalPosition -1
      Then AgentDeadLetterSchema rejects the dead letter

    Scenario: Accepts dead letter with globalPosition of 0
      Given a test dead letter with globalPosition 0
      Then AgentDeadLetterSchema accepts the dead letter

    Scenario: Rejects dead letter with non-positive attemptCount
      Given a test dead letter with attemptCount 0
      Then AgentDeadLetterSchema rejects the dead letter

    Scenario: Rejects dead letter with missing required fields
      Given a partial object with only agentId "test"
      Then AgentDeadLetterSchema rejects the dead letter

  Rule: Sanitization removes stack traces from error messages
    **Invariant:** sanitizeErrorMessage strips stack-trace-like content after " at " patterns
    **Verified by:** Scenarios covering path-like content, multi-line traces, and plain messages

    Scenario: Removes content after at when followed by path-like content
      When I sanitize the error "Error occurred at /app/src/agent.ts:42:10"
      Then the sanitized message is "Error occurred"
      And the sanitized message does not contain "/app/src/agent.ts:42:10"

    Scenario: Removes multi-line stack traces
      When I sanitize a multi-line error with stack traces
      Then the sanitized message does not contain "at processEvent"
      And the sanitized message does not contain "at runAgent"

    Scenario: Preserves the error message itself
      When I sanitize the error "LLM timeout during analysis"
      Then the sanitized message is "LLM timeout during analysis"

  Rule: Sanitization removes or replaces file paths
    **Invariant:** File paths are either stripped (when preceded by " at ") or replaced with [path]
    **Verified by:** Scenarios for .ts, .js, .mjs, .cjs paths with and without " at " prefix

    Scenario: Removes TypeScript file paths with at prefix
      When I sanitize the error "Failed at /app/src/agent.ts"
      Then the sanitized message is "Failed"

    Scenario: Replaces file paths without at prefix with path marker
      When I sanitize the error "Error in /dist/handler.js:100:5"
      Then the sanitized message is "Error in [path]"

    Scenario: Removes ESM file paths when preceded by at
      When I sanitize the error "Module error at /lib/module.mjs"
      Then the sanitized message is "Module error"

    Scenario: Replaces CJS file paths with path marker when not preceded by at
      When I sanitize the error "Require failed for /lib/module.cjs"
      Then the sanitized message is "Require failed for [path]"

    Scenario: Removes paths with line and column numbers
      When I sanitize the error "Error at /path/to/file.ts:42:10"
      Then the sanitized message does not contain ":42:10"

  Rule: Sanitization truncates at 500 characters
    **Invariant:** Messages longer than 500 characters are truncated to 500 ending with "..."
    **Verified by:** Scenarios for over, under, and exactly 500 character messages

    Scenario: Truncates long messages to 500 characters ending with ellipsis
      When I sanitize an error of 600 repeated "A" characters
      Then the sanitized message has length 500
      And the sanitized message ends with "..."

    Scenario: Does not truncate messages under 500 characters
      When I sanitize an error of 400 repeated "A" characters
      Then the sanitized message has length 400
      And the sanitized message does not end with "..."

    Scenario: Does not truncate messages of exactly 500 characters
      When I sanitize an error of 500 repeated "A" characters
      Then the sanitized message has length 500
      And the sanitized message does not end with "..."

  Rule: Sanitization handles different input types
    **Invariant:** sanitizeErrorMessage accepts Error objects, strings, objects with message, null, undefined
    **Verified by:** Scenarios for each input type

    Scenario: Handles Error objects
      When I sanitize an Error object with message "Test error message"
      Then the sanitized message contains "Test error message"

    Scenario: Handles string errors
      When I sanitize the error "String error message"
      Then the sanitized message is "String error message"

    Scenario: Handles objects with message property
      When I sanitize an object with message "Object error message"
      Then the sanitized message contains "Object error message"

    Scenario: Handles unknown error types
      When I sanitize an object without message property
      Then the sanitized message is "Unknown error"

    Scenario: Handles null
      When I sanitize null
      Then the sanitized message is "Unknown error"

    Scenario: Handles undefined
      When I sanitize undefined
      Then the sanitized message is "Unknown error"

    Scenario: Handles empty string
      When I sanitize the error ""
      Then the sanitized message is "Unknown error"

  Rule: Sanitization normalizes whitespace
    **Invariant:** Multiple spaces are collapsed, newlines removed, leading/trailing whitespace trimmed
    **Verified by:** Scenarios for multiple spaces, surrounding whitespace, and newlines

    Scenario: Collapses multiple spaces
      When I sanitize the error "Error    with    multiple    spaces"
      Then the sanitized message is "Error with multiple spaces"

    Scenario: Trims leading and trailing whitespace
      When I sanitize the error "   Error with surrounding whitespace   "
      Then the sanitized message is "Error with surrounding whitespace"

    Scenario: Handles newlines
      When I sanitize an error with newlines "Error\non\nmultiple\nlines"
      Then the sanitized message is "Error on multiple lines"

  Rule: Factory function creates dead letters with correct defaults
    **Invariant:** createAgentDeadLetter sets status=pending, attemptCount=1, failedAt=now, sanitizes error
    **Verified by:** Scenarios for required fields, defaults, optional context, and error sanitization

    Scenario: Creates dead letter with required fields
      Given the system time is "2024-01-15T12:00:00Z"
      When I create a dead letter with agentId "test-agent" subscriptionId "sub-001" eventId "evt-123" globalPosition 1000 and error "Error message"
      Then the dead letter has the following properties:
        | property       | value         |
        | agentId        | test-agent    |
        | subscriptionId | sub-001       |
        | eventId        | evt-123       |
        | globalPosition | 1000          |
        | error          | Error message |

    Scenario: Creates dead letter with pending status
      Given the system time is "2024-01-15T12:00:00Z"
      When I create a dead letter with agentId "agent" subscriptionId "sub" eventId "evt" globalPosition 0 and error "error"
      Then the dead letter status is "pending"

    Scenario: Sets attemptCount to 1
      Given the system time is "2024-01-15T12:00:00Z"
      When I create a dead letter with agentId "agent" subscriptionId "sub" eventId "evt" globalPosition 0 and error "error"
      Then the dead letter attemptCount is 1

    Scenario: Sets failedAt to current time
      Given the system time is "2024-01-15T12:00:00Z"
      When I create a dead letter with agentId "agent" subscriptionId "sub" eventId "evt" globalPosition 0 and error "error"
      Then the dead letter failedAt equals the current time

    Scenario: Includes context when provided
      Given the system time is "2024-01-15T12:00:00Z"
      When I create a dead letter with context containing correlationId "corr-123" errorCode "LLM_TIMEOUT" and triggeringPattern "churn-risk"
      Then the dead letter context matches the provided context

    Scenario: Does not include context when not provided
      Given the system time is "2024-01-15T12:00:00Z"
      When I create a dead letter with agentId "agent" subscriptionId "sub" eventId "evt" globalPosition 0 and error "error"
      Then the dead letter context is undefined

    Scenario: Sanitizes Error objects removing stack-like patterns
      Given the system time is "2024-01-15T12:00:00Z"
      When I create a dead letter with an Error object "Error at /app/src/handler.ts:42"
      Then the dead letter error is "Error"
      And the dead letter error does not contain "/app/src/handler.ts"

    Scenario: Sanitizes string errors
      Given the system time is "2024-01-15T12:00:00Z"
      When I create a dead letter with agentId "agent" subscriptionId "sub" eventId "evt" globalPosition 0 and error "Error at /app/src/handler.ts:42"
      Then the dead letter error is "Error"

    Scenario: Replaces paths in errors without at prefix
      Given the system time is "2024-01-15T12:00:00Z"
      When I create a dead letter with agentId "agent" subscriptionId "sub" eventId "evt" globalPosition 0 and error "Failed loading /app/src/handler.ts"
      Then the dead letter error is "Failed loading [path]"

    Scenario: Replaces paths with line column suffix
      Given the system time is "2024-01-15T12:00:00Z"
      When I create a dead letter with agentId "agent" subscriptionId "sub" eventId "evt" globalPosition 0 and error "Failed loading /app/src/handler.ts:42:10"
      Then the dead letter error is "Failed loading [path]"

    Scenario: Sanitizes unknown error types
      Given the system time is "2024-01-15T12:00:00Z"
      When I create a dead letter with an unknown error type
      Then the dead letter error is "Unknown error"

  Rule: Increment updates attempt count, error, and timestamp
    **Invariant:** incrementDeadLetterAttempt increments attemptCount, updates error (sanitized), and sets failedAt=now
    **Verified by:** Scenarios for increment, error update, sanitization, timestamp, field preservation, and chaining

    Scenario: Increments attemptCount
      Given the system time is "2024-01-15T12:00:00Z"
      And a test dead letter with attemptCount 1
      When I increment the dead letter attempt with error "New error"
      Then the dead letter attemptCount is 2

    Scenario: Updates error message
      Given the system time is "2024-01-15T12:00:00Z"
      And a test dead letter with error "Old error"
      When I increment the dead letter attempt with error "New error"
      Then the dead letter error is "New error"

    Scenario: Sanitizes new error message with at pattern
      Given the system time is "2024-01-15T12:00:00Z"
      And a test dead letter with attemptCount 1
      When I increment the dead letter attempt with error "Error at /app/file.ts:10"
      Then the dead letter error is "Error"

    Scenario: Sanitizes new error message with path replacement
      Given the system time is "2024-01-15T12:00:00Z"
      And a test dead letter with attemptCount 1
      When I increment the dead letter attempt with error "Failed loading /app/file.ts"
      Then the dead letter error is "Failed loading [path]"

    Scenario: Updates failedAt to current time
      Given the system time is "2024-01-15T12:00:00Z"
      And a test dead letter with failedAt 10000 ms ago
      When I increment the dead letter attempt with error "New error"
      Then the dead letter failedAt equals the current time
      And the dead letter failedAt is different from the old failedAt

    Scenario: Preserves other fields during increment
      Given the system time is "2024-01-15T12:00:00Z"
      And a test dead letter with agentId "my-agent" subscriptionId "my-sub" eventId "my-evt" globalPosition 500 status "pending" and context
      When I increment the dead letter attempt with error "New error"
      Then the dead letter preserves all original fields except attemptCount, error, and failedAt

    Scenario: Handles multiple increments
      Given the system time is "2024-01-15T12:00:00Z"
      And a test dead letter with attemptCount 1
      When I increment the dead letter attempt 3 times with errors "Retry 1", "Retry 2", "Retry 3"
      Then the dead letter attemptCount is 4
      And the dead letter error is "Retry 3"

  Rule: Status transition to replayed only from pending
    **Invariant:** markDeadLetterReplayed transitions pending to replayed, throws for other statuses
    **Verified by:** Scenarios for valid transition, field preservation, and invalid source statuses

    Scenario: Transitions pending to replayed
      Given a test dead letter with status "pending"
      When I mark the dead letter as replayed
      Then the dead letter status is "replayed"

    Scenario: Preserves all other fields when transitioning to replayed
      Given a test dead letter with status "pending" agentId "my-agent" attemptCount 3 and context
      When I mark the dead letter as replayed
      Then the dead letter preserves agentId "my-agent" and attemptCount 3 and context

    Scenario: Throws when marking replayed dead letter as replayed
      Given a test dead letter with status "replayed"
      Then marking the dead letter as replayed throws with message containing "replayed" and "pending"

    Scenario: Throws when marking ignored dead letter as replayed
      Given a test dead letter with status "ignored"
      Then marking the dead letter as replayed throws with message containing "ignored" and "pending"

  Rule: Status transition to ignored only from pending
    **Invariant:** markDeadLetterIgnored transitions pending to ignored, throws for other statuses
    **Verified by:** Scenarios for valid transition, field preservation, and invalid source statuses

    Scenario: Transitions pending to ignored
      Given a test dead letter with status "pending"
      When I mark the dead letter as ignored
      Then the dead letter status is "ignored"

    Scenario: Preserves all other fields when transitioning to ignored
      Given a test dead letter with status "pending" eventId "evt-456" and error "Original error"
      When I mark the dead letter as ignored
      Then the dead letter preserves eventId "evt-456" and error "Original error"

    Scenario: Throws when marking replayed dead letter as ignored
      Given a test dead letter with status "replayed"
      Then marking the dead letter as ignored throws with message containing "replayed" and "pending"

    Scenario: Throws when marking already ignored dead letter as ignored
      Given a test dead letter with status "ignored"
      Then marking the dead letter as ignored throws with message containing "ignored" and "pending"

  Rule: Type guards correctly identify dead letter statuses
    **Invariant:** isDeadLetterPending/Replayed/Ignored return true only for their respective status
    **Verified by:** Scenarios for each guard against all three statuses

    Scenario: isDeadLetterPending returns true only for pending
      Given a test dead letter with status "pending"
      Then isDeadLetterPending returns true
      And isDeadLetterReplayed returns false
      And isDeadLetterIgnored returns false

    Scenario: isDeadLetterReplayed returns true only for replayed
      Given a test dead letter with status "replayed"
      Then isDeadLetterPending returns false
      And isDeadLetterReplayed returns true
      And isDeadLetterIgnored returns false

    Scenario: isDeadLetterIgnored returns true only for ignored
      Given a test dead letter with status "ignored"
      Then isDeadLetterPending returns false
      And isDeadLetterReplayed returns false
      And isDeadLetterIgnored returns true

  Rule: Validation function checks complete dead letter structure
    **Invariant:** validateAgentDeadLetter returns true only for schema-compliant objects
    **Verified by:** Scenarios for valid, invalid, null, undefined, empty, and non-object inputs

    Scenario: Returns true for valid dead letter
      Given a valid test dead letter
      Then validateAgentDeadLetter returns true

    Scenario: Returns true for dead letter with context
      Given a valid test dead letter with context
      Then validateAgentDeadLetter returns true

    Scenario: Returns false for null
      Then validateAgentDeadLetter returns false for null

    Scenario: Returns false for undefined
      Then validateAgentDeadLetter returns false for undefined

    Scenario: Returns false for empty object
      Then validateAgentDeadLetter returns false for an empty object

    Scenario: Returns false for non-object types
      Then validateAgentDeadLetter returns false for non-object types including string, number, and boolean

    Scenario: Returns false for dead letter with invalid status
      Given a test dead letter with status "invalid"
      Then validateAgentDeadLetter returns false for the dead letter

    Scenario: Returns false for dead letter with missing fields
      Given a partial object with agentId "test" and status "pending"
      Then validateAgentDeadLetter returns false for the dead letter

  Rule: Dead letter lifecycle supports replay and ignore paths
    **Invariant:** Dead letters flow from creation through retries to either replayed or ignored terminal state
    **Verified by:** Scenarios for full replay lifecycle and ignore lifecycle

    Scenario: Failed event processing and replay lifecycle
      Given the system time is "2024-01-15T12:00:00Z"
      When I create a dead letter for agent "churn-agent" subscription "sub-001" event "evt-500" position 500 with Error "LLM timeout" and context correlationId "corr-abc" triggeringPattern "churn-risk"
      Then the dead letter status is "pending"
      And the dead letter attemptCount is 1
      And validateAgentDeadLetter returns true
      When I advance time by 5000 ms and increment with error "LLM timeout on retry"
      Then the dead letter attemptCount is 2
      And isDeadLetterPending returns true
      When I advance time by 10000 ms and increment with error "LLM still unavailable"
      Then the dead letter attemptCount is 3
      When I mark the dead letter as replayed
      Then the dead letter status is "replayed"
      And isDeadLetterReplayed returns true
      Then marking the dead letter as ignored throws
      And marking the dead letter as replayed throws

    Scenario: Obsolete event being ignored lifecycle
      Given the system time is "2024-01-15T12:00:00Z"
      When I create a dead letter for agent "inventory-agent" subscription "sub-002" event "evt-obsolete" position 100 with string error "Processing failed"
      Then isDeadLetterPending returns true
      When I mark the dead letter as ignored
      Then the dead letter status is "ignored"
      And isDeadLetterIgnored returns true
      Then marking the dead letter as replayed throws
