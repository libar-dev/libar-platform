@agent-on-complete
Feature: Agent onComplete Handler

  As a system operator
  I want agent failures to create dead letters for retry
  So that no events are silently lost during processing

  Background: Fresh test context
    Given a fresh unit test context

  Rule: Successful and canceled results do not create dead letters

    **Invariant:** Only failed results create dead letter entries. Success and
    canceled results are normal completion states that require no error tracking.
    **Rationale:** Dead letters are an error-recovery mechanism. Creating entries
    for non-error states would pollute the dead letter queue and obscure real failures.
    **Verified by:** No dead letter on success, No dead letter on canceled

    @acceptance-criteria @happy-path
    Scenario: No dead letter on success
      When the onComplete handler receives a success result
      Then the dead letter count should be 0
      And the checkpoint should advance to the event global position

    Scenario: No dead letter on canceled
      When the onComplete handler receives a canceled result
      Then the dead letter count should be 0

  Rule: Failed results create dead letters with error details

    **Invariant:** A failed result must create exactly one dead letter entry with
    the error message, attempt count of 1, pending status, and the event's global position.
    **Rationale:** Dead letters capture all context needed for manual retry or investigation.
    The attempt count tracks redelivery attempts for escalation policies.
    **Verified by:** Creates dead letter on failure

    @acceptance-criteria @validation
    Scenario: Creates dead letter on failure
      When the onComplete handler receives a failed result with error "Test error"
      Then the dead letter count should be 1
      And the dead letter for the event should have:
        | field          | value      |
        | attemptCount   | 1          |
        | status         | pending    |
        | error          | Test error |
        | globalPosition | 100        |

  Rule: Repeated failures increment attempt count

    **Invariant:** When the same eventId fails again, the existing dead letter's
    attemptCount is incremented and the error is updated. No duplicate entries are created.
    **Rationale:** Deduplication by eventId prevents queue bloat from redeliveries.
    The latest error is preserved for debugging the most recent failure.
    **Verified by:** Increments attemptCount on repeated failure

    Scenario: Increments attemptCount on repeated failure
      Given a first failure with error "First error"
      When the onComplete handler receives a failed result with error "Second error"
      Then the dead letter count should be 1
      And the dead letter for the event should have:
        | field        | value        |
        | attemptCount | 2            |
        | error        | Second error |

  Rule: Terminal dead letters are not updated

    **Invariant:** Once a dead letter reaches a terminal state (e.g., ignored),
    subsequent failures for the same eventId must not modify it.
    **Rationale:** Terminal states represent operator decisions (ignore, resolved).
    Overwriting them with new failures would lose the operator's intent.
    **Verified by:** Does not update dead letter in terminal state

    Scenario: Does not update dead letter in terminal state
      Given a first failure with error "Original error"
      And the dead letter is marked as ignored with reason "Test ignore"
      When the onComplete handler receives a failed result with error "Should not overwrite"
      Then the dead letter for the event should have:
        | field        | value          |
        | status       | ignored        |
        | attemptCount | 1              |
        | error        | Original error |
