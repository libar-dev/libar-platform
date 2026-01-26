@libar-docs
@libar-docs-implements:ProductionHardening
@acceptance-criteria
@libar-docs-status:roadmap
@libar-docs-phase:18
@libar-docs-product-area:Platform
Feature: Durable Function Integration - Reliable Execution Patterns

  As a platform developer
  I want durable function components integrated with platform patterns
  So that external calls, retries, and conflict handling are reliable

  This is the implementation proof for the roadmap spec at:
  delivery-process/specs/platform/production-hardening.feature

  # ===========================================================================
  # TEST CONTEXT
  # ===========================================================================

  Background:
    Given the test environment is initialized
    And action retrier component is configured
    And workpool component is configured

  # ===========================================================================
  # Rule: Durable functions provide reliable execution patterns
  #
  # vitest-cucumber SYNTAX: In step definitions, this becomes:
  #   Rule("Durable functions provide reliable execution patterns", ({ RuleScenario }) => {...})
  # ===========================================================================

  Rule: Durable functions provide reliable execution patterns

    Production systems use @convex-dev durable function components for reliability.
    Each component serves a specific purpose - choosing the right one is critical.

    # ===========================================================================
    # Circuit Breaker + Action Retrier Integration
    # ===========================================================================

    @happy-path
    Scenario: Circuit breaker uses action retrier for half-open probe
      # Implementation placeholder - stub scenario
      Given a circuit breaker "payment-api" in "HALF_OPEN" state
      When a test request is initiated
      Then action retrier should execute with maxFailures=0
      And circuit state should update to "CLOSED" on success

    @validation
    Scenario: Failed half-open probe reopens circuit via action retrier
      # Implementation placeholder - stub scenario
      Given a circuit breaker "payment-api" in "HALF_OPEN" state
      When the probe action fails
      Then onCircuitProbeComplete should transition to "OPEN"
      And timeout should be rescheduled for next half-open transition

    @edge-case
    Scenario: Closed circuit uses action retrier with configured retries
      # Implementation placeholder - stub scenario
      Given a circuit breaker "payment-api" in "CLOSED" state
      And retry config has maxFailures=3 and initialBackoffMs=250
      When an external operation is executed
      Then action retrier should use the configured retry settings
      And onOperationComplete should update circuit state on completion

    # ===========================================================================
    # DCB Conflict Retry via Workpool
    # ===========================================================================

    @happy-path
    Scenario: DCB conflict triggers Workpool-based retry
      # Implementation placeholder - stub scenario
      Given a DCB operation with scope "tenant:t1:reservation:r1"
      And expectedVersion is 5 but currentVersion is 6
      When conflict is detected
      Then Workpool should enqueue retry mutation with backoff
      And partition key should be "dcb:tenant:t1:reservation:r1"
      And only one retry should run at a time for that scope

    @edge-case
    Scenario: DCB retry respects exponential backoff with jitter
      # Implementation placeholder - stub scenario
      Given a DCB conflict on attempt 3
      When calculateBackoff is called
      Then delay should be approximately 400ms (100 * 2^2)
      And jitter should add 0-50% randomness
      And maximum delay should be capped at 30 seconds

    @validation
    Scenario: DCB retry uses latest version after conflict
      # Implementation placeholder - stub scenario
      Given a DCB conflict with currentVersion 10
      When retry is enqueued via Workpool
      Then the retry config should have expectedVersion=10
      And the retry attempt counter should increment

    @edge-case
    Scenario: DCB retry partition key prevents concurrent retries
      # Implementation placeholder - stub scenario
      Given two DCB conflicts for scope "tenant:t1:reservation:r1"
      When both conflicts trigger retries
      Then Workpool partition key should serialize execution
      And the second retry should wait for the first to complete

    # ===========================================================================
    # Dead Letter Queue Retry with Action Retrier
    # ===========================================================================

    @happy-path
    Scenario: Dead letter retry uses action retrier for external calls
      # Implementation placeholder - stub scenario
      Given a dead letter with status "pending" and eventId "evt-123"
      When admin triggers retry
      Then action retrier should execute processEvent action
      And dead letter status should be "retrying"
      And retryRunId should track the action run

    @validation
    Scenario: Failed DLQ retry returns to pending status
      # Implementation placeholder - stub scenario
      Given a dead letter in "retrying" status
      When action retrier exhausts all retry attempts
      Then onDLQRetryComplete should update status to "pending"
      And lastError should contain the failure reason
      And item should be available for manual review

    @happy-path
    Scenario: Successful DLQ retry marks item resolved
      # Implementation placeholder - stub scenario
      Given a dead letter in "retrying" status
      When action retrier completes successfully
      Then onDLQRetryComplete should update status to "resolved"
      And resolvedAt timestamp should be set

    @edge-case
    Scenario: DLQ retry tracks retry count
      # Implementation placeholder - stub scenario
      Given a dead letter with retryCount=2
      When admin triggers another retry
      Then retryCount should increment to 3
      And lastRetryAt should be updated
