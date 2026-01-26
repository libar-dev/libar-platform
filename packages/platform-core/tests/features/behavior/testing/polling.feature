@libar-docs-pattern:PollingUtilities
@testing-infrastructure
@libar-docs-pattern:PollingUtilities
@libar-docs-status:completed
@libar-docs-phase:56
@libar-docs-quarter:Q1-2026
@libar-docs-effort:2h
@libar-docs-effort-actual:2h
@libar-docs-completed:2026-01-08
@libar-docs-product-area:PlatformCore
@libar-docs-business-value:enable-async-condition-waiting-in-tests
@libar-docs-priority:high
Feature: Polling Utilities for Integration Tests

  As a developer writing integration tests
  I want async polling utilities
  So that I can wait for eventual consistency patterns

  The polling module provides utilities for waiting on async conditions,
  essential when testing projections processed via Workpool or other
  eventually consistent patterns.

  Background: Deliverables
    Given the following deliverables:
      | Deliverable | Status | Tests | Location |
      | sleep() function | Complete | Yes | src/testing/polling.ts |
      | waitUntil() polling utility | Complete | Yes | src/testing/polling.ts |
      | waitFor() boolean predicate polling | Complete | Yes | src/testing/polling.ts |
      | DEFAULT_TIMEOUT_MS constant | Complete | Yes | src/testing/polling.ts |
      | DEFAULT_POLL_INTERVAL_MS constant | Complete | Yes | src/testing/polling.ts |
      | Behavior test feature file | Complete | Yes | This file |
    And the platform-core testing module is imported

  # ============================================================================
  # Sleep Function
  # ============================================================================

  @acceptance-criteria @happy-path
  Scenario: Sleep for specified duration
    When I call sleep(50)
    Then the function resolves after approximately 50ms
    And no error is thrown

  @acceptance-criteria @happy-path
  Scenario: Sleep returns a promise
    When I call sleep(10)
    Then I receive a Promise
    And I can await the result

  # ============================================================================
  # waitUntil - Polling with Return Value
  # ============================================================================

  @acceptance-criteria @happy-path
  Scenario: waitUntil returns truthy result immediately
    Given a check function that returns truthy on first call
    When I call waitUntil with the check function
    Then I receive the truthy value
    And the check was called once

  @acceptance-criteria @happy-path
  Scenario: waitUntil polls until condition is met
    Given a check function that returns truthy after 3 calls
    When I call waitUntil with the check function
    Then I receive the truthy value
    And the check was called 3 times

  @acceptance-criteria @validation
  Scenario: waitUntil throws on timeout
    Given a check function that always returns falsy
    When I call waitUntil with timeoutMs 100 and pollIntervalMs 20
    Then an error is thrown with message containing "within 100ms"

  @acceptance-criteria @happy-path
  Scenario: waitUntil uses custom timeout message
    Given a check function that always returns falsy
    When I call waitUntil with message "Order to be confirmed"
    Then an error is thrown with message containing "Order to be confirmed"

  @acceptance-criteria @happy-path
  Scenario: waitUntil respects pollIntervalMs
    Given a check function that tracks call timestamps
    When I call waitUntil with pollIntervalMs 50
    Then calls are spaced approximately 50ms apart

  # ============================================================================
  # waitFor - Polling with Boolean Predicate
  # ============================================================================

  @acceptance-criteria @happy-path
  Scenario: waitFor resolves when predicate returns true
    Given a predicate that returns true after 2 calls
    When I call waitFor with the predicate
    Then the function resolves without error
    And the predicate was called 2 times

  @acceptance-criteria @validation
  Scenario: waitFor throws on timeout
    Given a predicate that always returns false
    When I call waitFor with timeoutMs 100
    Then an error is thrown with message containing "100ms"

  # ============================================================================
  # Default Constants
  # ============================================================================

  @acceptance-criteria @happy-path
  Scenario: Default timeout is 30 seconds
    Then DEFAULT_TIMEOUT_MS equals 30000

  @acceptance-criteria @happy-path
  Scenario: Default poll interval is 100ms
    Then DEFAULT_POLL_INTERVAL_MS equals 100
