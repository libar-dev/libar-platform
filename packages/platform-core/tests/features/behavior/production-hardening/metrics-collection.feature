@libar-docs
@libar-docs-implements:ProductionHardening
@acceptance-criteria
@libar-docs-status:roadmap
@libar-docs-phase:18
@libar-docs-product-area:Platform
Feature: Metrics Collection - System Health Tracking

  As a platform operator
  I want to collect system health metrics
  So that I can monitor projection lag, event throughput, and command latency

  This is the implementation proof for the roadmap spec at:
  delivery-process/specs/platform/production-hardening.feature

  # ===========================================================================
  # TEST CONTEXT
  # ===========================================================================

  Background:
    Given the test environment is initialized
    And a metrics collector is configured

  # ===========================================================================
  # Rule: Metrics track system health indicators
  #
  # vitest-cucumber SYNTAX: In step definitions, this becomes:
  #   Rule("Metrics track system health indicators", ({ RuleScenario }) => {...})
  # ===========================================================================

  Rule: Metrics track system health indicators

    Projection lag, event throughput, command latency, and DLQ size are the core metrics.
    Metrics are collected as structured JSON for export via Convex Log Streams.

    @happy-path
    Scenario: Projection lag is tracked
      # Implementation placeholder - stub scenario
      Given a projection with checkpoint at position 100
      And the latest event is at position 150
      When metrics are collected
      Then projection.lag_events should be 50
      And the metric should include projection name label

    @validation
    Scenario: Metrics collection handles missing checkpoints
      # Implementation placeholder - stub scenario
      Given a projection without a checkpoint entry
      When metrics are collected
      Then projection.lag_events should default to current global position
      And a warning should be logged

    @happy-path
    Scenario: Event throughput is calculated
      # Implementation placeholder - stub scenario
      Given 100 events were published in the last minute
      When metrics are collected
      Then events.throughput should be approximately 100 events/min

    @edge-case
    Scenario: Dead letter queue size is tracked
      # Implementation placeholder - stub scenario
      Given 5 dead letters exist for projection "orderSummaries"
      When metrics are collected
      Then dlq.size should be 5
      And the metric should include projection name label
