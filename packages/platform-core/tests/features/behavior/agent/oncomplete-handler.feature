Feature: Agent onComplete Handler

  The createAgentOnCompleteHandler() factory produces a workpool onComplete
  callback that processes agent action results. It handles canceled, failed,
  and successful outcomes with appropriate persistence, idempotency guards,
  and NO-THROW guarantees.

  Background:
    Given the module is imported from platform-core

  Rule: Canceled results are no-ops
    **Invariant:** A canceled workpool result triggers no mutations
    **Verified by:** Scenario confirming zero runMutation calls

    @acceptance-criteria @happy-path
    Scenario: Returns immediately without calling any mutations
      Given a handler with default config
      And args with a canceled result
      When the handler is invoked
      Then runMutation is not called

  Rule: Failed results record dead letter and audit without checkpoint
    **Invariant:** Failed results persist error context but never advance the checkpoint
    **Verified by:** Scenario verifying dead letter, audit, and absence of checkpoint calls

    Scenario: Records dead letter and audit event but does not advance checkpoint
      Given a handler with default config
      And args with a failed result with error "LLM timeout after 30s"
      When the handler is invoked
      Then the dead letter is recorded with fields:
        | field              | value                  |
        | agentId            | test-agent             |
        | subscriptionId     | sub_test-agent         |
        | eventId            | evt_123                |
        | globalPosition     | 42                     |
        | error              | LLM timeout after 30s  |
      And the audit is recorded with eventType "AgentAnalysisFailed" and agentId "test-agent"
      And the checkpoint update is not called
      And the checkpoint loadOrCreate is not called

  Rule: Success with null returnValue is a no-op
    **Invariant:** A null returnValue (skipped event) triggers no mutations
    **Verified by:** Scenario confirming zero runMutation calls

    Scenario: Returns immediately when returnValue is null
      Given a handler with default config
      And args with a success result with null returnValue
      When the handler is invoked
      Then runMutation is not called

  Rule: Success with decision persists audit, command, approval, and checkpoint
    **Invariant:** Persistence operations execute in strict order: loadOrCreate, audit, commands, approvals, checkpoint update
    **Verified by:** Scenarios covering ordering, checkpoint args, approval timeout, and conditional recording

    Scenario: Persists in correct order when requiresApproval is true
      Given a handler with default config and fake timers at "2024-01-15T12:00:00Z"
      And args with a success result containing a decision with requiresApproval true
      When the handler is invoked
      Then the persistence order is:
        | step              |
        | loadOrCreate      |
        | audit             |
        | commands          |
        | approvals         |
        | checkpoint_update |

    Scenario: Updates checkpoint with correct args
      Given a handler with default config and fake timers at "2024-01-15T12:00:00Z"
      And args with a success result and context agentId "my-agent" subscriptionId "sub_my-agent" eventId "evt_999" globalPosition 150
      When the handler is invoked
      Then the checkpoint update is called with:
        | field                    | value        |
        | agentId                  | my-agent     |
        | subscriptionId           | sub_my-agent |
        | lastProcessedPosition    | 150          |
        | lastEventId              | evt_999      |
        | incrementEventsProcessed | true         |

    Scenario: Uses default 24h timeout for approval expiresAt
      Given a handler with default config and fake timers at "2024-01-15T12:00:00Z"
      And args with a success result containing a decision with requiresApproval true
      When the handler is invoked
      Then the approval expiresAt equals Date.now() plus 86400000 ms

    Scenario: Records command but not approval when requiresApproval is false
      Given a handler with default config and fake timers at "2024-01-15T12:00:00Z"
      And args with a success result containing a decision with requiresApproval false
      When the handler is invoked
      Then the commands record is called
      And the approvals create is not called

    Scenario: Does not create approval when requiresApproval is true but command is null
      Given a handler with default config and fake timers at "2024-01-15T12:00:00Z"
      And args with a success result containing a decision with null command and requiresApproval true
      When the handler is invoked
      Then the approvals create is not called
      And the commands record is not called
      And the checkpoint update is called

    Scenario: Uses custom approvalTimeoutMs for approval expiresAt
      Given a handler with approvalTimeoutMs 3600000 and fake timers at "2024-01-15T12:00:00Z"
      And args with a success result containing a decision with requiresApproval true
      When the handler is invoked
      Then the approval expiresAt equals Date.now() plus 3600000 ms

  Rule: Success with no-command decision skips command and approval recording
    **Invariant:** A decision with null command records audit and checkpoint but not command or approval
    **Verified by:** Scenario verifying selective mutation calls

    Scenario: Records audit and checkpoint but skips command and approval
      Given a handler with default config and fake timers at "2024-01-15T12:00:00Z"
      And args with a success result containing a no-command decision
      When the handler is invoked
      Then the audit record is called
      And the commands record is not called
      And the approvals create is not called
      And the checkpoint update is called

  Rule: Idempotency via checkpoint position
    **Invariant:** Events at or below the checkpoint position are skipped entirely
    **Verified by:** Scenario verifying only loadOrCreate is called when position is already processed

    Scenario: Skips when checkpoint position equals event position
      Given a handler with default config and fake timers at "2024-01-15T12:00:00Z"
      And args with a success result and context globalPosition 42
      And the checkpoint loadOrCreate returns lastProcessedPosition 42
      When the handler is invoked
      Then the checkpoint loadOrCreate is called
      And the checkpoint update is not called
      And the audit record is not called
      And the commands record is not called
      And the approvals create is not called

  Rule: NO-THROW zone catches errors and records dead letter fallback
    **Invariant:** The handler never throws; errors produce dead letters and log entries
    **Verified by:** Scenarios covering primary failure, audit failure, double failure, and failed-result dead letter failure

    Scenario: Catches checkpoint error and creates dead letter instead of throwing
      Given a handler with default config and a logger
      And the checkpoint loadOrCreate will throw "Database connection lost"
      And args with a success result containing a standard decision
      When the handler is invoked
      Then the handler resolves without throwing
      And the dead letter is recorded with fields:
        | field   | value                    |
        | agentId | test-agent               |
        | eventId | evt_123                  |
        | error   | Database connection lost  |
      And the logger error is called with message "Unexpected error in agent onComplete" and agentId "test-agent" and error "Database connection lost"

    Scenario: Continues to record commands and checkpoint when audit throws
      Given a handler with default config and a logger
      And the checkpoint loadOrCreate returns lastProcessedPosition 0
      And the audit record will throw "Audit store unavailable"
      And args with a success result containing a decision with command and requiresApproval false
      When the handler is invoked
      Then the handler resolves without throwing
      And the audit record is called
      And the commands record is called
      And the checkpoint update is called
      And the logger error is called with message "Failed to record audit in onComplete" and agentId "test-agent" and error "Audit store unavailable"

    Scenario: Does not throw even when dead letter recording also fails
      Given a handler with default config and a logger
      And the checkpoint loadOrCreate will throw "Primary failure"
      And the dead letter record will throw "Dead letter also failed"
      And args with a success result containing a standard decision
      When the handler is invoked
      Then the handler resolves without throwing
      And the logger error is called with message "Unexpected error in agent onComplete"
      And the logger error is called with message "Failed to record dead letter in catch-all" and agentId "test-agent" and eventId "evt_123"

    Scenario: Does not throw when failed result dead letter recording fails
      Given a handler with default config and a logger
      And the dead letter record will throw "Dead letter store unavailable"
      And args with a failed result with error "Action failed"
      When the handler is invoked
      Then the handler resolves without throwing
      And the logger error is called with message "Failed to record dead letter for action failure" and agentId "test-agent" and error "Dead letter store unavailable"
