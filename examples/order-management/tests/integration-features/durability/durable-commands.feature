@integration @durability @durable-commands
Feature: Durable Command Execution (App Integration)
  As a developer using event sourcing
  I want commands to be tracked with intent/completion bracketing
  So that crashed or hung commands can be detected and recovered

  Durable command execution wraps the standard CommandOrchestrator with:
  - Intent recording before execution (with scheduled timeout)
  - Completion recording after success/failure
  - Orphan detection for stuck commands

  Background:
    Given the backend is running and clean
    And durable command execution is configured with timeoutMs 5000

  Rule: Intent is recorded before command execution

    @intent-recording
    Scenario: Successful command records intent and completion
      Given a draft order exists for durable command test
      When I submit the order using durable execution
      Then an intent record should exist for the command
      And the intent status should be "completed"
      And the intent should have a completionEventId
      And the order status should be "submitted"

    @intent-recording
    Scenario: Intent record captures command metadata
      Given a draft order exists for durable command test
      When I submit the order using durable execution with correlationId "corr-dur-001"
      Then the intent record should have correlationId "corr-dur-001"
      And the intent record should have operationType "SubmitOrder"
      And the intent record should have boundedContext "orders"

  Rule: Failed commands are tracked

    @failure-tracking
    Scenario: Business rejection records failed intent
      Given an empty draft order exists for durable command test
      When I submit the order using durable execution
      Then an intent record should exist for the command
      And the intent status should be "failed"
      And the intent error should contain "EMPTY_ORDER"

    @failure-tracking
    Scenario: Technical failure records failed intent
      Given a non-existent order for durable command test
      When I attempt to submit the order using durable execution
      Then an intent record should exist for the command
      And the intent status should be "failed"

  Rule: Intent stats are queryable

    @monitoring
    Scenario: Intent statistics show correct counts
      Given multiple durable commands have been executed
      When I query intent stats
      Then stats should show pending, completed, failed, and abandoned counts
      And the total should match the sum of all statuses
