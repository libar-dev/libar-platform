@integration @durability @orphan-detection
Feature: Orphan Intent Detection (App Integration)
  As a developer using event sourcing
  I want orphaned intents to be detected and flagged
  So that stuck commands can be investigated and recovered

  Orphan detection finds intents that were recorded but never completed
  within their timeout period. This indicates a command that:
  - Crashed before completing
  - Hung indefinitely
  - Failed without recording completion

  Background:
    Given the backend is running and clean
    And orphan detection is configured

  Rule: Pending intents exceeding timeout are detected

    @orphan-detection
    Scenario: Intent exceeding timeout is flagged as abandoned
      Given a pending intent exists with timeout 100ms
      And the intent was created more than 100ms ago
      When the orphan detection runs
      Then the intent should be marked as "abandoned"
      And the intent should have an error message about timeout

    @orphan-detection
    Scenario: Intent within timeout is not flagged
      Given a pending intent exists with timeout 60000ms
      And the intent was created recently
      When the orphan detection runs
      Then the intent should still be "pending"

  Rule: Completed intents are never flagged

    @no-false-positives
    Scenario: Completed intent is not flagged even if old
      Given a completed intent exists from long ago
      When the orphan detection runs
      Then the intent should still be "completed"

    @no-false-positives
    Scenario: Failed intent is not flagged even if old
      Given a failed intent exists from long ago
      When the orphan detection runs
      Then the intent should still be "failed"

  Rule: Abandoned intents are queryable

    @admin
    Scenario: List abandoned intents for investigation
      Given multiple intents have been abandoned
      When I query abandoned intents
      Then I should receive a list of abandoned intents
      And each intent should have intentKey, operationType, and error

  Rule: Scheduled timeout handler marks orphan

    @timeout-handler
    Scenario: Timeout handler marks pending intent as abandoned
      Given a pending intent exists with intentKey "timeout-test-001"
      When the timeout handler fires for intentKey "timeout-test-001"
      Then the intent status should be "abandoned"
      And the result should be "abandoned"

    @timeout-handler
    Scenario: Timeout handler no-ops for completed intent
      Given a completed intent exists with intentKey "timeout-test-002"
      When the timeout handler fires for intentKey "timeout-test-002"
      Then the intent status should still be "completed"
      And the result should be "already_completed"
