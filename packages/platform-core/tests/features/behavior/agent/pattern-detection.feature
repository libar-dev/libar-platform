@libar-docs
@libar-docs-status:completed
@libar-docs-implements:AgentAsBoundedContext
@libar-docs-phase:22
@libar-docs-product-area:Platform
@agent
Feature: Agent Pattern Detection

  As a platform developer
  I want agents to detect patterns across event streams
  So that business insights can be generated automatically

  This feature validates the pattern detection framework
  using LLM analysis and rule-based triggers.

  Background: Agent Module
    Given the agent module is imported from platform-core
    And the pattern detection framework is available

  # ============================================================================
  # Pattern Definition
  # ============================================================================

  Rule: Patterns are defined with detection criteria

    Patterns specify window, trigger, and analysis logic.

    @acceptance-criteria @happy-path
    Scenario: Define rule-based pattern
      Given a pattern definition "ChurnRisk"
      And window: 30 days, minimum 3 events
      And trigger: count(OrderCancelled) >= 3
      When I register the pattern
      Then pattern is available for detection

    @acceptance-criteria @happy-path
    Scenario: Define LLM-analyzed pattern
      Given a pattern definition "AnomalyDetection"
      And LLM analysis prompt for unusual activity
      When I register the pattern
      Then pattern uses LLM for analysis

  # ============================================================================
  # Pattern Window
  # ============================================================================

  Rule: Pattern window constrains event scope

    Events outside window are not considered.

    @acceptance-criteria @happy-path
    Scenario: Window respects time boundary
      Given pattern window of 30 days
      And events spanning 60 days
      When pattern detection runs
      Then only events from last 30 days are analyzed

    @acceptance-criteria @happy-path
    Scenario: Window respects event limit
      Given pattern window with eventLimit: 100
      And 150 events in time range
      When pattern detection runs
      Then only most recent 100 events are analyzed

    @acceptance-criteria @edge-case
    Scenario: Empty window returns no patterns
      Given pattern window with no events
      When pattern detection runs
      Then no patterns are detected
      And result includes "no_events" status

    @acceptance-criteria @edge-case
    Scenario: Pattern window loads events lazily for memory efficiency
      Given pattern window duration is 30 days
      And 1000 events exist within the pattern window
      When pattern trigger is evaluated
      Then events are loaded in batches
      And memory usage remains bounded
      And all relevant events are considered for pattern detection

  # ============================================================================
  # Pattern Detection
  # ============================================================================

  Rule: Patterns are detected from event sequences

    Trigger conditions activate pattern detection.

    @acceptance-criteria @happy-path
    Scenario: Detect ChurnRisk from cancellations
      Given events for customer "cust_123":
        | type | timestamp |
        | OrderCancelled | 2026-01-10 |
        | OrderCancelled | 2026-01-15 |
        | OrderCancelled | 2026-01-20 |
      When pattern detection runs
      Then "ChurnRisk" pattern is detected
      And confidence is calculated

    @acceptance-criteria @happy-path
    Scenario: Detect FraudRisk from frequency anomaly
      Given events showing 50 orders in 1 hour
      And normal rate is 5 orders per hour
      When pattern detection runs
      Then "FraudRisk" pattern is detected
      And confidence > 0.9

    @acceptance-criteria @edge-case
    Scenario: No pattern when threshold not met
      Given events for customer "cust_123":
        | type | timestamp |
        | OrderCancelled | 2026-01-10 |
        | OrderSubmitted | 2026-01-15 |
      When pattern detection runs
      Then "ChurnRisk" pattern is NOT detected

  # ============================================================================
  # LLM Analysis
  # ============================================================================

  Rule: LLM provides deeper pattern analysis

    Complex patterns use LLM for insight.

    @acceptance-criteria @happy-path
    Scenario: LLM analyzes event sequence
      Given events submitted to LLM analysis
      When analysis completes
      Then result includes detected patterns
      And result includes confidence scores
      And result includes reasoning text

    @acceptance-criteria @happy-path
    Scenario: LLM response includes suggested action
      Given a detected pattern with high confidence
      When LLM provides analysis
      Then suggestedCommand is included
      And reasoning explains why

    @acceptance-criteria @validation
    Scenario: LLM timeout handled gracefully
      Given LLM analysis times out
      When pattern detection runs
      Then fallback to rule-based detection
      And audit records timeout event
