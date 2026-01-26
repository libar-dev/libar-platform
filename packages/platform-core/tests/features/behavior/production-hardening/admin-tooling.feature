@libar-docs
@libar-docs-implements:ProductionHardening
@acceptance-criteria
@libar-docs-status:roadmap
@libar-docs-phase:18
@libar-docs-product-area:Platform
Feature: Admin Tooling - Operational Tasks

  As a platform operator
  I want admin endpoints for operational tasks
  So that I can rebuild projections, manage dead letters, and diagnose issues

  This is the implementation proof for the roadmap spec at:
  delivery-process/specs/platform/production-hardening.feature

  # ===========================================================================
  # TEST CONTEXT
  # ===========================================================================

  Background:
    Given the test environment is initialized
    And admin endpoints are configured

  # ===========================================================================
  # Rule: Admin tooling enables operational tasks
  #
  # vitest-cucumber SYNTAX: In step definitions, this becomes:
  #   Rule("Admin tooling enables operational tasks", ({ RuleScenario }) => {...})
  # ===========================================================================

  Rule: Admin tooling enables operational tasks

    Projection rebuild, DLQ inspection/retry, event flow tracing, system diagnostics.
    Build on existing patterns from sagas/admin.ts and projections/deadLetters.ts.

    @happy-path
    Scenario: Projection rebuild re-processes events
      # Implementation placeholder - stub scenario
      Given a corrupted projection at position 500
      When admin triggers rebuild from position 0
      Then checkpoint should reset to position 0
      And projection status should be "rebuilding"
      And workpool should re-process all events

    @happy-path
    Scenario: Dead letter retry re-enqueues event
      # Implementation placeholder - stub scenario
      Given a dead letter with status "pending"
      When admin retries the dead letter
      Then dead letter status should be "retrying"
      And event should be re-enqueued to workpool

    @validation
    Scenario: Event flow trace returns full history
      # Implementation placeholder - stub scenario
      Given events with correlation ID "corr-123"
      When admin requests event flow trace
      Then response should include command, events, and projection updates
      And entries should be ordered by timestamp

    @happy-path
    Scenario: Rebuild status shows progress
      # Implementation placeholder - stub scenario
      Given a rebuild in progress for projection "orderSummaries"
      When admin queries rebuild status
      Then response should include current position
      And response should include total events to process
      And response should include estimated time remaining

    @edge-case
    Scenario: Bulk dead letter retry processes all pending
      # Implementation placeholder - stub scenario
      Given 10 dead letters with status "pending" for projection "inventory"
      When admin triggers bulk retry
      Then all 10 dead letters should transition to "retrying"
      And response should include count of retried items

    @validation
    Scenario: System diagnostics returns comprehensive state
      # Implementation placeholder - stub scenario
      Given the system is running
      When admin requests system diagnostics
      Then response should include projection statuses
      And response should include workpool queue depths
      And response should include circuit breaker states
      And response should include dead letter counts
