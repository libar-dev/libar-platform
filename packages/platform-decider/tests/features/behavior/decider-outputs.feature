@libar-docs-pattern:DeciderOutputs
@acceptance-criteria
@libar-docs-status:completed
@libar-docs-phase:60
@libar-docs-quarter:Q1-2026
@libar-docs-effort:3h
@libar-docs-effort-actual:3h
@libar-docs-completed:2026-01-08
@libar-docs-product-area:PlatformDecider
@libar-docs-business-value:type-safe-command-outcome-handling
@libar-docs-priority:high
@libar-docs-implements:DeciderPattern
Feature: Decider Output Helpers and Type Guards

  The Decider pattern uses discriminated unions to represent command outcomes:
  - success: Command executed, event emitted, state updated
  - rejected: Business rule violation, no event, clear error code
  - failed: Unexpected failure, audit event, context preserved

  Helper functions create these outputs, and type guards enable safe narrowing.
  This is a core Functional Event Sourcing pattern.

  # NOTE: This is a reference implementation for PDR-003 behavior feature files.
  # - No Release column in DataTables (per PDR-003)
  # - Uses @acceptance-criteria tag for scenarios
  # - Links to pattern via @libar-docs-pattern tag

  Background:
    Given test event types are defined
    And test data types are defined
    And test state update types are defined

  # ==========================================================================
  # Success Output Helper
  # ==========================================================================

  @happy-path
  Scenario: success() creates output with correct status
    When creating a success output
    Then the output status should be "success"
    And the output data should have result "ok"
    And the output event should have type "TestEvent"
    And the output event payload should have testId "123"
    And the output stateUpdate should have status "completed"

  @happy-path
  Scenario: success() includes all required properties
    When creating a minimal success output
    Then the output should have all required properties:
      | property    |
      | status      |
      | data        |
      | event       |
      | stateUpdate |

  # ==========================================================================
  # Rejected Output Helper
  # ==========================================================================

  @business-failure
  Scenario: rejected() creates output with code and message
    When creating a rejected output with code "TEST_ERROR" and message "Something went wrong"
    Then the output status should be "rejected"
    And the output code should be "TEST_ERROR"
    And the output message should be "Something went wrong"
    And the output context should be undefined

  @business-failure
  Scenario: rejected() includes context when provided
    When creating a rejected output with code "TEST_ERROR" and message "Something went wrong" and detail "extra info"
    Then the output status should be "rejected"
    And the output context should have detail "extra info"

  # ==========================================================================
  # Failed Output Helper
  # ==========================================================================

  @business-failure
  Scenario: failed() creates output with reason and event
    When creating a failed output with reason "Operation failed" and eventType "TestEvent" and testId "456"
    Then the output status should be "failed"
    And the output reason should be "Operation failed"
    And the output event should have type "TestEvent"
    And the output event payload should have testId "456"
    And the output context should be undefined

  @business-failure
  Scenario: failed() includes context when provided
    When creating a failed output with reason "Operation failed" and attemptNumber 3
    Then the output status should be "failed"
    And the output context should have attemptNumber 3

  # ==========================================================================
  # Type Guards - isSuccess
  # ==========================================================================

  @validation
  Scenario: isSuccess() returns true for success output
    Given a success output is created
    When checking isSuccess on the output
    Then the type guard should return true

  @validation
  Scenario: isSuccess() returns false for rejected output
    Given a rejected output is created
    When checking isSuccess on the output
    Then the type guard should return false

  @validation
  Scenario: isSuccess() returns false for failed output
    Given a failed output is created
    When checking isSuccess on the output
    Then the type guard should return false

  @technical-constraint
  Scenario: isSuccess() enables type narrowing
    Given a success output is created
    When checking isSuccess on the output
    Then the output data property should be accessible

  # ==========================================================================
  # Type Guards - isRejected
  # ==========================================================================

  @validation
  Scenario: isRejected() returns true for rejected output
    Given a rejected output is created
    When checking isRejected on the output
    Then the type guard should return true

  @validation
  Scenario: isRejected() returns false for success output
    Given a success output is created
    When checking isRejected on the output
    Then the type guard should return false

  @validation
  Scenario: isRejected() returns false for failed output
    Given a failed output is created
    When checking isRejected on the output
    Then the type guard should return false

  @technical-constraint
  Scenario: isRejected() enables type narrowing
    Given a rejected output is created
    When checking isRejected on the output
    Then the output code property should be accessible

  # ==========================================================================
  # Type Guards - isFailed
  # ==========================================================================

  @validation
  Scenario: isFailed() returns true for failed output
    Given a failed output is created
    When checking isFailed on the output
    Then the type guard should return true

  @validation
  Scenario: isFailed() returns false for success output
    Given a success output is created
    When checking isFailed on the output
    Then the type guard should return false

  @validation
  Scenario: isFailed() returns false for rejected output
    Given a rejected output is created
    When checking isFailed on the output
    Then the type guard should return false

  @technical-constraint
  Scenario: isFailed() enables type narrowing
    Given a failed output is created
    When checking isFailed on the output
    Then the output reason property should be accessible

  # ==========================================================================
  # Edge Cases
  # ==========================================================================

  @edge-case
  Scenario Outline: Type guards are mutually exclusive
    Given a "<output_type>" output is created
    Then exactly one type guard should return true

    Examples:
      | output_type |
      | success     |
      | rejected    |
      | failed      |
