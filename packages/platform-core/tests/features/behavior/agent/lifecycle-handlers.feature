Feature: Lifecycle Handlers

  Agent lifecycle handler functions and the createLifecycleHandlers factory.
  Each handler loads the checkpoint, validates the FSM transition via a pure
  decider, and atomically writes the new status plus an audit event.

  Background:
    Given the module is imported from platform-core

  Rule: handleStartAgent transitions stopped to active with AgentStarted audit
    **Invariant:** START command on a stopped agent produces active status and AgentStarted audit event
    **Verified by:** Happy-path scenario and two rejection scenarios

    @acceptance-criteria @happy-path
    Scenario: Happy path - stopped to active with AgentStarted audit
      Given an agent in "stopped" state with lastProcessedPosition 25
      And a logger is attached
      When handleStartAgent is invoked with agentId "test-agent" and correlationId "corr_001"
      Then the result is successful with previousState "stopped" and newState "active"
      And transitionLifecycle was called with status "active" and audit event type "AgentStarted"
      And the AgentStarted audit payload contains:
        | property            | value   |
        | previousState       | stopped |
        | correlationId       | corr_001 |
        | resumeFromPosition  | 26      |
      And the logger info was called with "Agent started" and agentId "test-agent"

    Scenario: Rejects START from active state
      Given an agent in "active" state
      When handleStartAgent is invoked with agentId "test-agent" and correlationId "corr_002"
      Then the result is a failure with code INVALID_LIFECYCLE_TRANSITION
      And the failure message contains "START" and "active"
      And the failure currentState is "active"
      And transitionLifecycle was not called

    Scenario: Rejects START from paused state
      Given an agent in "paused" state
      When handleStartAgent is invoked with agentId "test-agent" and correlationId "corr_003"
      Then the result is a failure with code INVALID_LIFECYCLE_TRANSITION
      And the failure currentState is "paused"

  Rule: handlePauseAgent transitions active to paused with AgentPaused audit
    **Invariant:** PAUSE command on an active agent produces paused status and AgentPaused audit event with reason
    **Verified by:** Happy-path scenario and one rejection scenario

    Scenario: Happy path - active to paused with AgentPaused audit and reason
      Given an agent in "active" state with lastProcessedPosition 50 and eventsProcessed 20
      And a logger is attached
      When handlePauseAgent is invoked with agentId "test-agent" correlationId "corr_010" and reason "Maintenance window"
      Then the result is successful with previousState "active" and newState "paused"
      And transitionLifecycle was called with status "paused" and audit event type "AgentPaused"
      And the AgentPaused audit payload contains:
        | property                | value              |
        | reason                  | Maintenance window |
        | correlationId           | corr_010           |
        | pausedAtPosition        | 50                 |
        | eventsProcessedAtPause  | 20                 |

    Scenario: Rejects PAUSE from stopped state
      Given an agent in "stopped" state
      When handlePauseAgent is invoked with agentId "test-agent" and correlationId "corr_011"
      Then the result is a failure with code INVALID_LIFECYCLE_TRANSITION
      And the failure message contains "PAUSE" and "stopped"
      And the failure currentState is "stopped"

  Rule: handleResumeAgent transitions paused to active with AgentResumed audit
    **Invariant:** RESUME command on a paused agent produces active status and AgentResumed audit event with resumeFromPosition
    **Verified by:** Happy-path scenario and one rejection scenario

    Scenario: Happy path - paused to active with AgentResumed audit
      Given an agent in "paused" state with lastProcessedPosition 75
      And a logger is attached
      When handleResumeAgent is invoked with agentId "test-agent" and correlationId "corr_020"
      Then the result is successful with previousState "paused" and newState "active"
      And transitionLifecycle was called with status "active" and audit event type "AgentResumed"
      And the AgentResumed audit payload contains:
        | property            | value    |
        | resumeFromPosition  | 76       |
        | correlationId       | corr_020 |

    Scenario: Rejects RESUME from stopped state
      Given an agent in "stopped" state
      When handleResumeAgent is invoked with agentId "test-agent" and correlationId "corr_021"
      Then the result is a failure with code INVALID_LIFECYCLE_TRANSITION
      And the failure message contains "RESUME" and "stopped"
      And the failure currentState is "stopped"

  Rule: handleStopAgent transitions active, paused, or error_recovery to stopped with AgentStopped audit
    **Invariant:** STOP command produces stopped status from active, paused, or error_recovery states
    **Verified by:** Three happy-path scenarios and one rejection scenario

    Scenario: Happy path - active to stopped with AgentStopped audit
      Given an agent in "active" state with lastProcessedPosition 100
      And a logger is attached
      When handleStopAgent is invoked with agentId "test-agent" correlationId "corr_030" and reason "Decommissioning"
      Then the result is successful with previousState "active" and newState "stopped"
      And transitionLifecycle was called with status "stopped" and audit event type "AgentStopped"
      And the AgentStopped audit payload contains:
        | property          | value            |
        | previousState     | active           |
        | reason            | Decommissioning  |
        | correlationId     | corr_030         |
        | stoppedAtPosition | 100              |

    Scenario: Happy path - paused to stopped as universal escape hatch
      Given an agent in "paused" state with lastProcessedPosition 60
      When handleStopAgent is invoked with agentId "test-agent" and correlationId "corr_031"
      Then the result is successful with previousState "paused" and newState "stopped"
      And the AgentStopped audit payload has previousState "paused" and stoppedAtPosition 60

    Scenario: Happy path - error_recovery to stopped
      Given an agent in "error_recovery" state with lastProcessedPosition 88
      When handleStopAgent is invoked with agentId "test-agent" and correlationId "corr_032"
      Then the result is successful with previousState "error_recovery" and newState "stopped"

    Scenario: Rejects STOP from already stopped state
      Given an agent in "stopped" state
      When handleStopAgent is invoked with agentId "test-agent" and correlationId "corr_033"
      Then the result is a failure with code INVALID_LIFECYCLE_TRANSITION
      And the failure message contains "STOP" and "stopped"
      And the failure currentState is "stopped"

  Rule: handleReconfigureAgent patches config overrides and transitions to active
    **Invariant:** RECONFIGURE command merges configOverrides and transitions to active with AgentReconfigured audit
    **Verified by:** Active reconfigure, paused reconfigure, rejection, and first-time overrides scenarios

    Scenario: Reconfigures active agent with merged overrides
      Given an agent in "active" state with existing config overrides
      And a logger is attached
      When handleReconfigureAgent is invoked with agentId "test-agent" correlationId "corr_040" and new overrides
      Then the result is successful with previousState "active" and newState "active"
      And patchConfigOverrides was called with merged overrides
      And the AgentReconfigured audit payload contains previous and new overrides

    Scenario: Reconfigures paused agent transitioning to active
      Given an agent in "paused" state with no config overrides
      When handleReconfigureAgent is invoked with agentId "test-agent" correlationId "corr_041" and paused overrides
      Then the result is successful with previousState "paused" and newState "active"
      And patchConfigOverrides was called with paused agent overrides
      And transitionLifecycle was called with status "active" for paused reconfigure

    Scenario: Rejects RECONFIGURE from stopped state
      Given an agent in "stopped" state
      When handleReconfigureAgent is invoked with agentId "test-agent" correlationId "corr_042" and overrides
      Then the result is a failure with code INVALID_LIFECYCLE_TRANSITION
      And the failure message contains "RECONFIGURE" and "stopped"
      And the failure currentState is "stopped"

    Scenario: Handles first-time config overrides when checkpoint has none
      Given an agent in "active" state with no existing config overrides
      When handleReconfigureAgent is invoked with agentId "test-agent" correlationId "corr_043" and first-time overrides
      Then the result is successful
      And patchConfigOverrides was called with first-time overrides only
      And the AgentReconfigured audit payload has undefined previousOverrides

  Rule: createLifecycleHandlers factory returns all 5 handler functions
    **Invariant:** The factory produces a record with all five lifecycle handler functions
    **Verified by:** Factory shape scenario and round-trip scenario

    Scenario: Factory returns all 5 handler functions
      When createLifecycleHandlers is invoked with a mock component
      Then the result contains all handler functions:
        | handler                |
        | handleStartAgent       |
        | handlePauseAgent       |
        | handleResumeAgent      |
        | handleStopAgent        |
        | handleReconfigureAgent |

    Scenario: Factory handlers complete a start-pause-stop round trip
      When a round-trip lifecycle sequence is executed via factory handlers
      Then all three operations succeed

  Rule: Lifecycle handlers use logger correctly
    **Invariant:** Handlers use no-op logger when none provided and log warnings on invalid transitions
    **Verified by:** No-op logger scenario and warning log scenario

    Scenario: Uses no-op logger when none provided
      Given an agent in "stopped" state
      When handleStartAgent is invoked without a logger with agentId "test-agent" and correlationId "corr_200"
      Then the result is successful

    Scenario: Logs warning on invalid transition
      Given an agent in "active" state
      And a logger is attached
      When handleStartAgent is invoked with logger with agentId "test-agent" and correlationId "corr_201"
      Then the logger warn was called with "Invalid lifecycle transition" and command "StartAgent" and currentState "active"
