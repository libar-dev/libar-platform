@libar-docs
Feature: Process Manager Types

  As a platform developer
  I want type guards and constants for process manager runtime types
  So that status values are validated at runtime with full type narrowing

  # ============================================================================
  # isProcessManagerStatus Type Guard
  # ============================================================================

  Rule: isProcessManagerStatus returns true for all valid PM statuses

    **Invariant:** The type guard accepts exactly the 4 PM statuses: idle, processing, completed, failed.
    **Verified by:** Direct checks and exhaustive iteration over PROCESS_MANAGER_STATUSES.

    @acceptance-criteria @happy-path
    Scenario: All valid PM statuses are accepted
      Then isProcessManagerStatus returns true for all of:
        | value      |
        | idle       |
        | processing |
        | completed  |
        | failed     |

    @acceptance-criteria @happy-path
    Scenario: Every entry in PROCESS_MANAGER_STATUSES passes the guard
      Then every value in PROCESS_MANAGER_STATUSES passes isProcessManagerStatus

  Rule: isProcessManagerStatus rejects invalid values

    **Invariant:** Any value not in the PM status set is rejected, including non-strings.
    **Verified by:** Invalid strings, non-string types, arrays, and case variants.

    @acceptance-criteria @validation
    Scenario: Invalid status strings are rejected
      Then isProcessManagerStatus returns false for strings:
        | value   |
        | invalid |
        | running |
        | pending |
        | active  |
        |         |

    @acceptance-criteria @validation
    Scenario: Non-string values are rejected by isProcessManagerStatus
      Then isProcessManagerStatus returns false for non-string values

    @acceptance-criteria @validation
    Scenario: Arrays containing valid statuses are rejected by isProcessManagerStatus
      Then isProcessManagerStatus returns false for arrays of valid statuses

    @acceptance-criteria @validation
    Scenario: isProcessManagerStatus is case-sensitive
      Then isProcessManagerStatus returns false for case variants:
        | value      |
        | IDLE       |
        | Idle       |
        | PROCESSING |
        | Processing |
        | COMPLETED  |
        | FAILED     |

  Rule: isProcessManagerStatus supports TypeScript type narrowing

    **Invariant:** After a positive guard check, the value narrows to ProcessManagerStatus.
    **Verified by:** Conditional narrowing and array filter usage.

    @acceptance-criteria @happy-path
    Scenario: Type narrowing works in conditionals
      Given an unknown value "processing"
      When I check isProcessManagerStatus on the value
      Then the narrowed PM status equals "processing"

    @acceptance-criteria @happy-path
    Scenario: Type guard works as array filter predicate
      Given an array of mixed values including PM statuses
      When I filter the array with isProcessManagerStatus
      Then the filtered PM result contains exactly:
        | value      |
        | idle       |
        | processing |
        | failed     |

  # ============================================================================
  # PROCESS_MANAGER_STATUSES Constant
  # ============================================================================

  Rule: PROCESS_MANAGER_STATUSES exports the canonical PM status list

    **Invariant:** The constant contains exactly 4 statuses in lifecycle order.
    **Verified by:** Equality check, length, containment, and index ordering.

    @acceptance-criteria @happy-path
    Scenario: PROCESS_MANAGER_STATUSES contains exactly 4 statuses in order
      Then PROCESS_MANAGER_STATUSES equals exactly:
        | value      |
        | idle       |
        | processing |
        | completed  |
        | failed     |

    @acceptance-criteria @happy-path
    Scenario: PROCESS_MANAGER_STATUSES is a readonly array with correct bounds
      Then PROCESS_MANAGER_STATUSES first element is "idle"
      And PROCESS_MANAGER_STATUSES last element is "failed"

    @acceptance-criteria @happy-path
    Scenario: PROCESS_MANAGER_STATUSES contains all lifecycle states
      Then PROCESS_MANAGER_STATUSES contains all of:
        | value      |
        | idle       |
        | processing |
        | completed  |
        | failed     |

    @acceptance-criteria @happy-path
    Scenario: PROCESS_MANAGER_STATUSES is in logical lifecycle order
      Then PM statuses are in lifecycle order:
        | before     | after      |
        | idle       | processing |
        | processing | completed  |

  # ============================================================================
  # isDeadLetterStatus Type Guard
  # ============================================================================

  Rule: isDeadLetterStatus returns true for all valid dead letter statuses

    **Invariant:** The type guard accepts exactly the 3 DL statuses: pending, replayed, ignored.
    **Verified by:** Direct checks and exhaustive iteration over DEAD_LETTER_STATUSES.

    @acceptance-criteria @happy-path
    Scenario: All valid dead letter statuses are accepted
      Then isDeadLetterStatus returns true for all of:
        | value    |
        | pending  |
        | replayed |
        | ignored  |

    @acceptance-criteria @happy-path
    Scenario: Every entry in DEAD_LETTER_STATUSES passes the guard
      Then every value in DEAD_LETTER_STATUSES passes isDeadLetterStatus

  Rule: isDeadLetterStatus rejects invalid values

    **Invariant:** Any value not in the DL status set is rejected, including PM statuses.
    **Verified by:** Invalid strings, PM-domain statuses, non-string types, arrays, case variants.

    @acceptance-criteria @validation
    Scenario: Invalid status strings are rejected by isDeadLetterStatus
      Then isDeadLetterStatus returns false for strings:
        | value     |
        | invalid   |
        | active    |
        | processed |
        | failed    |
        |           |

    @acceptance-criteria @validation
    Scenario: PM statuses are rejected by isDeadLetterStatus
      Then isDeadLetterStatus returns false for PM-domain statuses:
        | value      |
        | idle       |
        | processing |
        | completed  |

    @acceptance-criteria @validation
    Scenario: Non-string values are rejected by isDeadLetterStatus
      Then isDeadLetterStatus returns false for non-string values

    @acceptance-criteria @validation
    Scenario: Arrays containing valid DL statuses are rejected
      Then isDeadLetterStatus returns false for arrays of valid DL statuses

    @acceptance-criteria @validation
    Scenario: isDeadLetterStatus is case-sensitive
      Then isDeadLetterStatus returns false for case variants:
        | value    |
        | PENDING  |
        | Pending  |
        | REPLAYED |
        | Replayed |
        | IGNORED  |
        | Ignored  |

  Rule: isDeadLetterStatus supports TypeScript type narrowing

    **Invariant:** After a positive guard check, the value narrows to DeadLetterStatus.
    **Verified by:** Conditional narrowing and array filter usage.

    @acceptance-criteria @happy-path
    Scenario: DL type narrowing works in conditionals
      Given an unknown value "replayed"
      When I check isDeadLetterStatus on the value
      Then the narrowed DL status equals "replayed"

    @acceptance-criteria @happy-path
    Scenario: DL type guard works as array filter predicate
      Given an array of mixed values including DL statuses
      When I filter the array with isDeadLetterStatus
      Then the filtered DL result contains exactly:
        | value    |
        | pending  |
        | replayed |
        | ignored  |

  # ============================================================================
  # DEAD_LETTER_STATUSES Constant
  # ============================================================================

  Rule: DEAD_LETTER_STATUSES exports the canonical dead letter status list

    **Invariant:** The constant contains exactly 3 statuses in workflow order.
    **Verified by:** Equality check, length, containment, and index ordering.

    @acceptance-criteria @happy-path
    Scenario: DEAD_LETTER_STATUSES contains exactly 3 statuses in order
      Then DEAD_LETTER_STATUSES equals exactly:
        | value    |
        | pending  |
        | replayed |
        | ignored  |

    @acceptance-criteria @happy-path
    Scenario: DEAD_LETTER_STATUSES is a readonly array with correct bounds
      Then DEAD_LETTER_STATUSES first element is "pending"
      And DEAD_LETTER_STATUSES last element is "ignored"

    @acceptance-criteria @happy-path
    Scenario: DEAD_LETTER_STATUSES contains all dead letter states
      Then DEAD_LETTER_STATUSES contains all of:
        | value    |
        | pending  |
        | replayed |
        | ignored  |

    @acceptance-criteria @happy-path
    Scenario: DEAD_LETTER_STATUSES is in logical workflow order
      Then DL statuses are in workflow order:
        | before  | after    |
        | pending | replayed |
        | pending | ignored  |

  # ============================================================================
  # ProcessManagerDeadLetter Interface
  # ============================================================================

  Rule: ProcessManagerDeadLetter has correct structure with all fields

    **Invariant:** A dead letter with all fields set has correct types and values.
    **Verified by:** Full construction with all fields and property assertions.

    @acceptance-criteria @happy-path
    Scenario: Full dead letter with all fields has correct structure
      Given a dead letter with all fields populated
      Then the dead letter has processManagerName "testPM"
      And the dead letter has instanceId "inst-123"
      And the dead letter has eventId "evt-456"
      And the dead letter has error "Command execution failed"
      And the dead letter has attemptCount 3
      And the dead letter has status "pending"
      And the dead letter failedCommand has commandType "SendNotification"
      And the dead letter failedCommand has payload with orderId "ord-789"
      And the dead letter has context with retryable true
      And the dead letter has a positive failedAt timestamp

    @acceptance-criteria @happy-path
    Scenario: Dead letter with only required fields has undefined optionals
      Given a dead letter with only required fields
      Then the dead letter eventId is undefined
      And the dead letter failedCommand is undefined
      And the dead letter context is undefined

  Rule: ProcessManagerDeadLetter supports all dead letter statuses

    **Invariant:** The status field accepts all 3 dead letter statuses.
    **Verified by:** Construction with each individual status and loop over all.

    @acceptance-criteria @happy-path
    Scenario: Dead letter supports each status individually
      Then a dead letter can be created with each status:
        | status   |
        | pending  |
        | replayed |
        | ignored  |

  Rule: ProcessManagerDeadLetter failedCommand captures type and payload

    **Invariant:** The failedCommand field records commandType and arbitrary payload.
    **Verified by:** Complex payload and empty payload construction.

    @acceptance-criteria @happy-path
    Scenario: failedCommand captures command type and complex payload
      Given a dead letter with a complex failedCommand
      Then the dead letter failedCommand is defined
      And the failedCommand commandType is "SendOrderConfirmation"
      And the failedCommand payload has orderId "ord-123"
      And the failedCommand payload has customerId "cust-456"

    @acceptance-criteria @happy-path
    Scenario: failedCommand allows empty payload
      Given a dead letter with an empty failedCommand payload
      Then the dead letter failedCommand payload is an empty object

  Rule: ProcessManagerDeadLetter handles edge cases

    **Invariant:** The interface supports extreme values without loss.
    **Verified by:** High attempt counts, long error messages, and complex context objects.

    @acceptance-criteria @validation
    Scenario: Dead letter handles high attempt count
      Given a dead letter with attemptCount 999
      Then the dead letter has attemptCount 999

    @acceptance-criteria @validation
    Scenario: Dead letter handles long error messages
      Given a dead letter with a long error message
      Then the dead letter error matches the long error message

    @acceptance-criteria @validation
    Scenario: Dead letter handles complex context objects
      Given a dead letter with a complex context object
      Then the dead letter context has correlationId "corr-123"
      And the dead letter context has a metadata property
      And the dead letter context has a tags property
