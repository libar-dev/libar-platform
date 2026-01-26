@libar-docs
@libar-docs-implements:ProductionHardening
@acceptance-criteria
@libar-docs-status:roadmap
@libar-docs-phase:18
@libar-docs-product-area:Platform
Feature: Distributed Tracing - Event Flow Visualization

  As a platform operator
  I want to trace event flows through the system
  So that I can debug issues and understand command-to-projection paths

  This is the implementation proof for the roadmap spec at:
  delivery-process/specs/platform/production-hardening.feature

  # ===========================================================================
  # TEST CONTEXT
  # ===========================================================================

  Background:
    Given the test environment is initialized
    And trace context propagation is enabled

  # ===========================================================================
  # Rule: Distributed tracing visualizes event flow
  #
  # vitest-cucumber SYNTAX: In step definitions, this becomes:
  #   Rule("Distributed tracing visualizes event flow", ({ RuleScenario }) => {...})
  # ===========================================================================

  Rule: Distributed tracing visualizes event flow

    Trace context propagates from command through events to projections using correlation IDs.
    Within Convex, this is conceptual tracing via metadata - external visualization via Log Streams.

    @happy-path
    Scenario: Trace spans command-to-projection flow
      # Implementation placeholder - stub scenario
      Given a SubmitOrder command with trace context
      When the command is processed
      And OrderSubmitted event is published
      And projection is updated
      Then all log entries should share the same trace ID
      And logs should show parent-child relationships via spanId

    @validation
    Scenario: Missing trace context uses default
      # Implementation placeholder - stub scenario
      Given a command without trace context
      When the command is processed
      Then a new trace ID should be generated
      And all downstream operations should use the generated trace

    @happy-path
    Scenario: Trace context is preserved in event metadata
      # Implementation placeholder - stub scenario
      Given a command with traceId "trace-abc" and spanId "span-001"
      When the command produces an event
      Then the event metadata should contain traceId "trace-abc"
      And the event metadata should contain a new spanId with parentSpanId "span-001"

    @edge-case
    Scenario: Multiple projections share same trace
      # Implementation placeholder - stub scenario
      Given an event with traceId "trace-xyz"
      When two different projections process the event
      Then both projection logs should include traceId "trace-xyz"
