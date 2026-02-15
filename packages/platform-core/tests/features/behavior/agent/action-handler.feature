Feature: Agent Action Handler

  createAgentActionHandler() factory creates the ACTION half of the Workpool
  action/mutation split. It loads state, checks idempotency via checkpoint
  position, checks agent active status, and runs pattern executor.

  Rule: Idempotency via checkpoint position
    **Invariant:** Handler returns null when event globalPosition <= checkpoint lastProcessedPosition
    **Verified by:** Scenarios for equal position and exceeded position

    @acceptance-criteria @happy-path
    Scenario: Returns null when checkpoint position equals event position
      Given an agent config with default test pattern
      And a checkpoint with lastProcessedPosition 100 and status "active"
      When I invoke the handler with globalPosition 100
      Then the result is null

    Scenario: Returns null when checkpoint position exceeds event position
      Given an agent config with default test pattern
      And a checkpoint with lastProcessedPosition 200 and status "active"
      When I invoke the handler with globalPosition 100
      Then the result is null

  Rule: Inactive agent handling
    **Invariant:** Handler returns null when agent checkpoint status is not "active"
    **Verified by:** Scenarios for paused, stopped, and error_recovery statuses

    Scenario: Returns null when agent status is paused
      Given an agent config with default test pattern
      And a checkpoint with lastProcessedPosition 50 and status "paused"
      When I invoke the handler with globalPosition 100
      Then the result is null

    Scenario: Returns null when agent status is stopped
      Given an agent config with default test pattern
      And a checkpoint with lastProcessedPosition 50 and status "stopped"
      When I invoke the handler with globalPosition 100
      Then the result is null

    Scenario: Returns null when agent status is error_recovery
      Given an agent config with default test pattern
      And a checkpoint with lastProcessedPosition 50 and status "error_recovery"
      When I invoke the handler with globalPosition 100
      Then the result is null

  Rule: Normal processing for new events
    **Invariant:** Handler processes normally when checkpoint is null or position is ahead
    **Verified by:** Scenarios for null checkpoint and rule-based analysis

    Scenario: Processes normally when checkpoint is null (first event)
      Given an agent config with default test pattern
      And a null checkpoint
      When I invoke the handler with globalPosition 1
      Then the result is not null
      And the result has the following properties:
        | property       | value             |
        | analysisMethod | rule-based        |
        | decisionId     | dec_test-agent_1  |
      And the decision is not null

    Scenario: Returns rule-based analysis when pattern has no analyze function
      Given an agent config with default test pattern
      And a null checkpoint
      When I invoke the handler with default args
      Then the result is not null
      And the result analysisMethod is "rule-based"
      And the result llmMetrics is undefined

  Rule: Error propagation for Workpool retry
    **Invariant:** Handler re-throws errors from pattern trigger and loadState for Workpool retry
    **Verified by:** Scenarios for trigger throw and loadState rejection

    Scenario: Re-throws when pattern trigger throws
      Given an agent config with a throwing pattern "Handler crashed"
      And a null checkpoint
      When I invoke the handler with default args expecting error
      Then the error message is "Handler crashed"

    Scenario: Propagates loadState errors for Workpool retry
      Given an agent config with default test pattern
      And a loadState that rejects with "DB connection lost"
      When I invoke the handler with default args expecting error
      Then the error message is "DB connection lost"

  Rule: Deterministic decisionId format
    **Invariant:** decisionId is always dec_{agentId}_{globalPosition}
    **Verified by:** Scenarios for specific agentId/position and deterministic replay

    Scenario: Generates deterministic decisionId from agentId and globalPosition
      Given an agent config with default test pattern
      And a null checkpoint
      When I invoke the handler with agentId "churn-risk-agent" and globalPosition 42
      Then the result is not null
      And the result decisionId is "dec_churn-risk-agent_42"

    Scenario: Generates same decisionId for same inputs (deterministic)
      Given an agent config with default test pattern
      And a null checkpoint
      When I invoke the handler twice with agentId "agent-x" and globalPosition 99
      Then both results have decisionId "dec_agent-x_99"

  Rule: Patterns mode integration
    **Invariant:** Handler invokes pattern executor and returns correct patternId, analysisMethod, and decision
    **Verified by:** Scenarios for triggering pattern, LLM analyze, no match, runtime isolation, and pattern error

    Scenario: Returns patternId and rule-based decision when pattern triggers
      Given an agent config with a "churn-risk" pattern that always triggers
      And a null checkpoint
      When I invoke the handler with default args
      Then the result is not null
      And the result has the following pattern properties:
        | property       | value      |
        | patternId      | churn-risk |
        | analysisMethod | rule-based |
      And the decision is not null
      And the decision command is null

    Scenario: Returns llm analysis method when pattern has analyze function
      Given an agent config with a "fraud-detection" pattern that has LLM analyze
      And a null checkpoint
      When I invoke the handler with default args
      Then the result is not null
      And the result has the following pattern properties:
        | property       | value           |
        | patternId      | fraud-detection |
        | analysisMethod | llm             |
      And the decision command is "FlagFraud"
      And the decision confidence is 0.95

    Scenario: Returns no patternId when no pattern matches
      Given an agent config with a pattern that never triggers
      And a null checkpoint
      When I invoke the handler with default args
      Then the result is not null
      And the result patternId is undefined
      And the decision is null

    Scenario: Does not invoke LLM enrichment via runtime
      Given an agent config with a rule-only pattern and a spy runtime
      And a null checkpoint
      When I invoke the handler with default args
      Then the result is not null
      And the runtime analyze was not called
      And the result llmMetrics is undefined

    Scenario: Re-throws when pattern executor fails
      Given an agent config with a throwing pattern "Trigger exploded"
      And a null checkpoint
      When I invoke the handler with default args expecting error
      Then the error message is "Trigger exploded"
