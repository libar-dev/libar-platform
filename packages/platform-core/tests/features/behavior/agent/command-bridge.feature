Feature: Agent Command Bridge Handler

  createCommandBridgeHandler() wires agent decisions to domain command
  execution: it looks up the route, validates registry membership,
  transforms args, calls the orchestrator, records audit events, and
  updates decision status. Failures at each stage produce structured
  audit trails without propagating to the caller.

  Background:
    Given the module is imported from platform-core

  Rule: Happy path routes command through the full pipeline
    **Invariant:** A known, registered command is routed through the orchestrator, an AgentCommandRouted audit event is recorded, and decision status is set to completed
    **Verified by:** Scenario asserting orchestrator call args, audit event shape, and status update

    @acceptance-criteria @happy-path
    Scenario: Routes command through registry, orchestrator, records audit, and updates status
      Given a standard mock component
      And a mock orchestrator that succeeds
      And a mock registry containing "SuggestCustomerOutreach"
      And a standard route map
      When the bridge handler is created and invoked with standard args
      Then the orchestrator was called once with the correct arguments
      And an AgentCommandRouted audit event was recorded with:
        | field         | value                    |
        | agentId       | test-agent               |
        | decisionId    | dec_test_42              |
        | commandType   | SuggestCustomerOutreach  |
        | boundedContext| agent                    |
        | correlationId | corr_123                 |
      And the decision status was updated to "completed"

  Rule: Unknown route records routing failure
    **Invariant:** A command type not in the route map produces an AgentCommandRoutingFailed audit with UNKNOWN_ROUTE code and sets status to failed
    **Verified by:** Scenario asserting orchestrator not called, audit code, and failed status

    Scenario: Records AgentCommandRoutingFailed audit and sets status to failed for unknown route
      Given a standard mock component
      And a mock orchestrator that succeeds
      And a mock registry containing "SuggestCustomerOutreach"
      And a standard route map
      When the bridge handler is invoked with commandType "NonExistentCommand"
      Then the orchestrator was not called
      And an AgentCommandRoutingFailed audit event was recorded for agent "test-agent" decision "dec_test_42"
      And the audit payload code is "UNKNOWN_ROUTE"
      And the decision status was updated to "failed"

  Rule: Command not in registry records routing failure
    **Invariant:** A command whose route exists but is not registered in the CommandRegistry produces COMMAND_NOT_REGISTERED error
    **Verified by:** Scenario asserting audit code, error message content, and failed status

    Scenario: Records COMMAND_NOT_REGISTERED error when registry does not contain the command
      Given a standard mock component
      And a mock orchestrator that succeeds
      And an empty mock registry
      And a standard route map
      When the bridge handler is created and invoked with standard args
      Then the orchestrator was not called
      And an AgentCommandRoutingFailed audit event was recorded
      And the audit payload code is "COMMAND_NOT_REGISTERED"
      And the audit payload error contains "not registered in CommandRegistry"
      And the decision status was updated to "failed"

  Rule: Transform failure records routing failure
    **Invariant:** If toOrchestratorArgs throws, an INVALID_TRANSFORM audit is recorded with the original error message
    **Verified by:** Scenario asserting audit code, error message containing both prefix and original message, and failed status

    Scenario: Records INVALID_TRANSFORM error when toOrchestratorArgs throws
      Given a standard mock component
      And a mock orchestrator that succeeds
      And a mock registry containing "SuggestCustomerOutreach"
      And a route map with a throwing transform for "SuggestCustomerOutreach"
      When the bridge handler is created and invoked with standard args
      Then the orchestrator was not called
      And an AgentCommandRoutingFailed audit event was recorded
      And the audit payload code is "INVALID_TRANSFORM"
      And the audit payload error contains "Transform failed"
      And the audit payload error contains "Missing required field: customerId"
      And the decision status was updated to "failed"

  Rule: Orchestrator failure records routing failure with error details
    **Invariant:** If orchestrator.execute() throws, the handler catches the error, records audit with the error message, and sets status to failed with the error
    **Verified by:** Scenario asserting orchestrator was called, audit payload, and failed status with error message

    Scenario: Records AgentCommandRoutingFailed audit and sets status to failed on orchestrator error
      Given a standard mock component
      And a mock orchestrator that throws "Orchestrator timeout"
      And a mock registry containing "SuggestCustomerOutreach"
      And a standard route map
      When the bridge handler is created and invoked with standard args
      Then the orchestrator was called once
      And an AgentCommandRoutingFailed audit event was recorded for agent "test-agent" decision "dec_test_42"
      And the audit payload error is "Orchestrator timeout"
      And the decision status was updated to "failed" with error "Orchestrator timeout"

  Rule: Audit failure does not propagate to caller
    **Invariant:** If audit recording throws, the handler swallows the error and logs it instead of propagating
    **Verified by:** Scenario asserting handler resolves, orchestrator was called, and error was logged

    Scenario: Does not throw when audit recording fails on success path
      Given a standard mock component
      And a mock orchestrator that succeeds
      And a mock registry containing "SuggestCustomerOutreach"
      And a standard route map
      And the audit mutation will throw "Audit store unavailable"
      And a mock logger is provided
      When the bridge handler is created and invoked with standard args
      Then the handler resolves without throwing
      And the orchestrator was called once
      And the logger recorded an error "Failed to record AgentCommandRouted audit" with agentId "test-agent" and error "Audit store unavailable"

  Rule: Status update failure does not propagate to caller
    **Invariant:** If updateStatus throws, the handler swallows the error so the caller is unaffected
    **Verified by:** Scenario asserting handler resolves, orchestrator was called, and audit was still recorded

    Scenario: Does not throw when updateStatus mutation fails on success path
      Given a standard mock component
      And a mock orchestrator that succeeds
      And a mock registry containing "SuggestCustomerOutreach"
      And a standard route map
      And the updateStatus mutation will throw "Status update failed"
      When the bridge handler is created and invoked with standard args
      Then the handler resolves without throwing
      And the orchestrator was called once
      And the audit mutation was still called

  Rule: Optional updateStatus is gracefully skipped
    **Invariant:** If commands.updateStatus is undefined, the handler skips status update without error on both success and failure paths
    **Verified by:** Scenarios covering success path and routing failure path

    Scenario: Skips status update without error when updateStatus is undefined on success path
      Given a mock component without updateStatus
      And a mock orchestrator that succeeds
      And a mock registry containing "SuggestCustomerOutreach"
      And a standard route map
      When the bridge handler is created and invoked with standard args
      Then the handler resolves without throwing
      And the orchestrator was called once
      And the audit mutation was still called
      And exactly 1 mutation call was made

    Scenario: Skips status update on routing failure when updateStatus is undefined
      Given a mock component without updateStatus
      And a mock orchestrator that succeeds
      And a mock registry containing "SuggestCustomerOutreach"
      And a standard route map
      When the bridge handler is invoked with commandType "NonExistent"
      Then the handler resolves without throwing
      And exactly 1 mutation call was made
      And the only mutation call was the audit record

  Rule: patternId propagation in audit events
    **Invariant:** patternId appears in audit payload only when present in args; absent args produce no patternId key
    **Verified by:** Scenarios covering presence and absence of patternId

    Scenario: Includes patternId in audit event payload when present in args
      Given a standard mock component
      And a mock orchestrator that succeeds
      And a mock registry containing "SuggestCustomerOutreach"
      And a standard route map
      When the bridge handler is invoked with patternId "churn-risk-v2"
      Then an AgentCommandRouted audit event was recorded with patternId "churn-risk-v2"

    Scenario: Does not include patternId in audit payload when absent from args
      Given a standard mock component
      And a mock orchestrator that succeeds
      And a mock registry containing "SuggestCustomerOutreach"
      And a standard route map
      When the bridge handler is created and invoked with standard args
      Then an AgentCommandRouted audit event was recorded without patternId
