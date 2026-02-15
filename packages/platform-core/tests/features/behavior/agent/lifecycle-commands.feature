Feature: Lifecycle Commands

  Agent lifecycle command types, error codes, result types, and Convex
  validator exports for the discriminated-union command model.

  Rule: Command types construct with correct discriminated union fields
    **Invariant:** Each command variant carries its type discriminator and required fields
    **Verified by:** Scenarios constructing each command variant and verifying fields

    @acceptance-criteria @happy-path
    Scenario: StartAgentCommand carries type and required fields
      Given a StartAgentCommand with commandId "cmd-001" agentId "agent-001" correlationId "corr-001"
      Then the command has the following properties:
        | property      | value     |
        | type          | StartAgent |
        | commandId     | cmd-001   |
        | agentId       | agent-001 |
        | correlationId | corr-001  |

    Scenario: PauseAgentCommand carries optional reason when provided
      Given a PauseAgentCommand with commandId "cmd-002" agentId "agent-001" correlationId "corr-002" reason "maintenance window"
      Then the command type is "PauseAgent"
      And the command reason is "maintenance window"

    Scenario: PauseAgentCommand has undefined reason when omitted
      Given a PauseAgentCommand with commandId "cmd-003" agentId "agent-001" correlationId "corr-003" and no reason
      Then the command reason is undefined

    Scenario: ResumeAgentCommand carries correct type
      Given a ResumeAgentCommand with commandId "cmd-004" agentId "agent-001" correlationId "corr-004"
      Then the command type is "ResumeAgent"

    Scenario: StopAgentCommand carries optional reason when provided
      Given a StopAgentCommand with commandId "cmd-005" agentId "agent-001" correlationId "corr-005" reason "budget exceeded"
      Then the command type is "StopAgent"
      And the command reason is "budget exceeded"

    Scenario: ReconfigureAgentCommand carries configOverrides with nested fields
      Given a ReconfigureAgentCommand with config overrides
      Then the command type is "ReconfigureAgent"
      And the config overrides have the following properties:
        | property                        | value |
        | confidenceThreshold             | 0.95  |
        | rateLimits.maxRequestsPerMinute | 30    |
        | rateLimits.costBudget.daily     | 50    |

    Scenario: Discriminated union narrows by type field at runtime
      Given an AgentLifecycleCommand of type PauseAgent with reason "test"
      Then narrowing by type "PauseAgent" yields reason "test"
      And narrowing by type "ReconfigureAgent" does not execute

  Rule: AgentConfigOverrides allows partial and nested optional fields
    **Invariant:** All fields in AgentConfigOverrides are optional at every nesting level
    **Verified by:** Scenarios with empty overrides, partial rateLimits, and nested costBudget

    Scenario: All fields are optional in AgentConfigOverrides
      Given an empty AgentConfigOverrides object
      Then the overrides have all undefined top-level fields:
        | field                 |
        | confidenceThreshold   |
        | patternWindowDuration |
        | rateLimits            |

    Scenario: Partial rateLimits with only maxRequestsPerMinute
      Given an AgentConfigOverrides with only maxRequestsPerMinute 10
      Then the overrides rateLimits.maxRequestsPerMinute is 10
      And the overrides rateLimits.maxConcurrent is undefined
      And the overrides rateLimits.costBudget is undefined

    Scenario: Nested costBudget overrides with only daily
      Given an AgentConfigOverrides with only costBudget daily 25
      Then the overrides rateLimits.costBudget.daily is 25
      And the overrides rateLimits.costBudget.alertThreshold is undefined

  Rule: AGENT_LIFECYCLE_ERROR_CODES defines exactly the expected constants
    **Invariant:** Error codes object contains exactly INVALID_LIFECYCLE_TRANSITION and AGENT_NOT_FOUND
    **Verified by:** Scenarios checking each code value and total count

    Scenario: Error codes contain expected values and count
      Then the AGENT_LIFECYCLE_ERROR_CODES have the following entries:
        | key                          | value                        |
        | INVALID_LIFECYCLE_TRANSITION | INVALID_LIFECYCLE_TRANSITION |
        | AGENT_NOT_FOUND              | AGENT_NOT_FOUND              |
      And there are exactly 2 error codes

  Rule: Result types construct success and failure variants with discrimination
    **Invariant:** AgentLifecycleResult discriminates on the success boolean field
    **Verified by:** Scenarios constructing success/failure results and narrowing

    Scenario: Success result carries state transition fields
      Given a success result with agentId "agent-001" previousState "stopped" newState "active"
      Then the result has the following properties:
        | property      | value     |
        | success       | true      |
        | agentId       | agent-001 |
        | previousState | stopped   |
        | newState      | active    |

    Scenario: Failure result with error code carries message and state
      Given a failure result with agentId "agent-001" code "INVALID_LIFECYCLE_TRANSITION" message "Cannot PAUSE from stopped state" currentState "stopped"
      Then the result success is false
      And the failure has the following properties:
        | property     | value                           |
        | code         | INVALID_LIFECYCLE_TRANSITION    |
        | currentState | stopped                         |
      And the failure message contains "PAUSE"

    Scenario: Failure result without currentState for agent not found
      Given a failure result with agentId "nonexistent" code "AGENT_NOT_FOUND" message "Agent not found" and no currentState
      Then the failure currentState is undefined

    Scenario: Discriminated union narrows to success branch
      Given a success result with agentId "agent-001" previousState "active" newState "paused"
      Then narrowing on success yields previousState "active" and newState "paused"

    Scenario: Discriminated union narrows to failure branch
      Given a failure result with agentId "agent-001" code "AGENT_NOT_FOUND" message "Agent not found" and no currentState
      Then narrowing on failure yields code "AGENT_NOT_FOUND"

  Rule: Convex validators are exported and defined
    **Invariant:** All lifecycle-related Convex validators are exported as non-undefined values
    **Verified by:** Scenario checking each validator export exists

    Scenario: All lifecycle validators are exported
      Then the following validators are defined:
        | validator                      |
        | lifecycleStateValidator        |
        | costBudgetOverridesValidator   |
        | rateLimitOverridesValidator    |
        | configOverridesValidator       |
        | startAgentArgsValidator        |
        | pauseAgentArgsValidator        |
        | resumeAgentArgsValidator       |
        | stopAgentArgsValidator         |
        | reconfigureAgentArgsValidator  |
