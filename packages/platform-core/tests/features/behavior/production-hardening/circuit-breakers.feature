@libar-docs
@libar-docs-implements:ProductionHardening
@acceptance-criteria
@libar-docs-status:roadmap
@libar-docs-phase:18
@libar-docs-product-area:Platform
Feature: Circuit Breakers - Fault Isolation

  As a platform developer
  I want circuit breakers for external dependencies
  So that failures are isolated and the system degrades gracefully

  This is the implementation proof for the roadmap spec at:
  delivery-process/specs/platform/production-hardening.feature

  # ===========================================================================
  # TEST CONTEXT
  # ===========================================================================

  Background:
    Given the test environment is initialized
    And circuit breaker state table exists

  # ===========================================================================
  # Rule: Circuit breakers prevent cascade failures
  #
  # vitest-cucumber SYNTAX: In step definitions, this becomes:
  #   Rule("Circuit breakers prevent cascade failures", ({ RuleScenario }) => {...})
  # ===========================================================================

  Rule: Circuit breakers prevent cascade failures

    Open circuit after threshold failures, half-open for recovery testing.
    State persists in Convex table (not memory) for durability across function invocations.

    @happy-path
    Scenario: Circuit opens after repeated failures
      # Implementation placeholder - stub scenario
      Given a circuit breaker with threshold 5
      When 5 consecutive failures occur
      Then circuit state should be "OPEN"
      And subsequent calls should fail fast with "CIRCUIT_OPEN"

    @happy-path
    Scenario: Circuit transitions to half-open after timeout
      # Implementation placeholder - stub scenario
      Given a circuit in "OPEN" state
      When the reset timeout expires (via scheduled function)
      Then circuit state should be "HALF_OPEN"
      And one test request should be allowed through

    @happy-path
    Scenario: Successful half-open request closes circuit
      # Implementation placeholder - stub scenario
      Given a circuit in "HALF_OPEN" state
      When a request succeeds
      Then circuit state should be "CLOSED"
      And normal traffic should resume

    @validation
    Scenario: Failed half-open request reopens circuit
      # Implementation placeholder - stub scenario
      Given a circuit in "HALF_OPEN" state
      When a request fails
      Then circuit state should return to "OPEN"
      And timeout timer should reset

    @edge-case
    Scenario: Circuit state persists across function invocations
      # Implementation placeholder - stub scenario
      Given a circuit breaker in "OPEN" state
      When the Convex function completes and a new invocation starts
      Then the circuit state should still be "OPEN"
      And failure count should be preserved

    @edge-case
    Scenario: Multiple circuit breakers operate independently
      # Implementation placeholder - stub scenario
      Given circuit breaker "payment-gateway" in "OPEN" state
      And circuit breaker "email-service" in "CLOSED" state
      When a request to "email-service" is made
      Then the request should proceed normally
      And "payment-gateway" should remain "OPEN"
