@libar-docs
@libar-docs-implements:EventReplayInfrastructure
@acceptance-criteria
Feature: Replay Progress Calculator

  Progress calculation utilities for replay operations including
  percentage completion, time estimation, and status checks.

  # ============================================================================
  # calculatePercentComplete
  # ============================================================================

  @happy-path
  Scenario: Percentage is 50 when half events processed
    Given 500 events processed out of 1000 total
    When calculating percent complete
    Then the result should be 50

  @happy-path
  Scenario: Percentage is 100 when all events processed
    Given 1000 events processed out of 1000 total
    When calculating percent complete
    Then the result should be 100

  @edge-case
  Scenario: Percentage is 100 when total events is zero
    Given 0 events processed out of 0 total
    When calculating percent complete
    Then the result should be 100

  @edge-case
  Scenario: Percentage has one decimal place precision
    Given 333 events processed out of 1000 total
    When calculating percent complete
    Then the result should be 33.3

  # ============================================================================
  # estimateRemainingTime
  # ============================================================================

  @happy-path
  Scenario: Remaining time estimated from throughput
    Given 100 events processed in 10000ms with 1000 total events
    When estimating remaining time
    Then the estimated time should be 90000ms

  @edge-case
  Scenario: Remaining time is undefined when no events processed
    Given 0 events processed in 5000ms with 1000 total events
    When estimating remaining time
    Then the estimated time should be undefined

  @edge-case
  Scenario: Remaining time is undefined when elapsed time is zero
    Given 100 events processed in 0ms with 1000 total events
    When estimating remaining time
    Then the estimated time should be undefined

  @edge-case
  Scenario: Remaining time is zero when all events processed
    Given 1000 events processed in 10000ms with 1000 total events
    When estimating remaining time
    Then the estimated time should be 0

  # ============================================================================
  # calculateProgress (combined)
  # ============================================================================

  @happy-path
  Scenario: Calculate progress for running replay
    Given a running checkpoint with 500 of 1000 events processed
    And the replay started 10 seconds ago
    When calculating full progress
    Then the progress status should be "running"
    And the progress percentComplete should be 50
    And the progress should have an estimatedRemainingMs value

  @happy-path
  Scenario: Calculate progress for completed replay
    Given a completed checkpoint with 1000 of 1000 events processed
    When calculating full progress
    Then the progress status should be "completed"
    And the progress percentComplete should be 100
    And the progress should NOT have an estimatedRemainingMs value

  @validation
  Scenario: Calculate progress includes error for failed replay
    Given a failed checkpoint with error "Projection handler threw exception"
    When calculating full progress
    Then the progress status should be "failed"
    And the progress error should be "Projection handler threw exception"

  # ============================================================================
  # isActiveReplay
  # ============================================================================

  @happy-path
  Scenario: Running status is active
    Given a replay with status "running"
    When checking if replay is active
    Then the result should be true

  @happy-path
  Scenario: Paused status is active
    Given a replay with status "paused"
    When checking if replay is active
    Then the result should be true

  @validation
  Scenario: Completed status is not active
    Given a replay with status "completed"
    When checking if replay is active
    Then the result should be false

  @validation
  Scenario: Failed status is not active
    Given a replay with status "failed"
    When checking if replay is active
    Then the result should be false

  # ============================================================================
  # isTerminalReplayStatus
  # ============================================================================

  @happy-path
  Scenario: Completed status is terminal
    Given a replay with status "completed"
    When checking if status is terminal
    Then the result should be true

  @happy-path
  Scenario: Failed status is terminal
    Given a replay with status "failed"
    When checking if status is terminal
    Then the result should be true

  @happy-path
  Scenario: Cancelled status is terminal
    Given a replay with status "cancelled"
    When checking if status is terminal
    Then the result should be true

  @validation
  Scenario: Running status is not terminal
    Given a replay with status "running"
    When checking if status is terminal
    Then the result should be false

  @validation
  Scenario: Paused status is not terminal
    Given a replay with status "paused"
    When checking if status is terminal
    Then the result should be false
