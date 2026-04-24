@architect-pattern:TestEnvironmentGuards
@testing-infrastructure
@architect-pattern:TestEnvironmentGuards
@architect-status:completed
@architect-unlock-reason:Task-3-branch-wide-remediation-guard-unblock
@architect-phase:58
@architect-quarter:Q1-2026
@architect-effort:1h
@architect-effort-actual:1h
@architect-completed:2026-01-08
@architect-product-area:PlatformCore
@architect-business-value:prevent-test-utilities-in-production
@architect-priority:high
Feature: Test Environment Guards

  As a platform developer
  I want environment guards for test-only functions
  So that test utilities cannot be called in production

  The guards module provides security functions that prevent test-only
  utilities (like createTestEntity) from being called in production.
  This is critical for preventing accidental data manipulation in
  live environments.

  Background: Deliverables
    Given the following deliverables:
      | Deliverable | Status | Tests | Location |
      | ensureTestEnvironment() guard | Complete | Yes | src/testing/guards.ts |
      | isTestEnvironment() check | Complete | Yes | src/testing/guards.ts |
      | Production detection logic | Complete | Yes | src/testing/guards.ts |
      | Behavior test feature file | Complete | Yes | This file |
    And the platform-core testing module is imported

  # ============================================================================
  # ensureTestEnvironment
  # ============================================================================

  @acceptance-criteria @happy-path
  Scenario: Allow execution when __CONVEX_TEST_MODE__ is true
    Given globalThis.__CONVEX_TEST_MODE__ is true
    When I call ensureTestEnvironment()
    Then no error is thrown

  @acceptance-criteria @happy-path
  Scenario: Allow execution when IS_TEST env is set
    Given process.env.IS_TEST is "true"
    When I call ensureTestEnvironment()
    Then no error is thrown

  @acceptance-criteria @validation
  Scenario: Allow execution on self-hosted runtime without explicit test signal
    Given process.env exists
    And CONVEX_CLOUD_URL is not set
    And IS_TEST is not set
    And __CONVEX_TEST_MODE__ is not true
    When I call ensureTestEnvironment()
    Then no error is thrown

  @acceptance-criteria @validation
  Scenario: Block execution in cloud production
    Given process.env.CONVEX_CLOUD_URL is set
    And IS_TEST is not set
    And __CONVEX_TEST_MODE__ is not true
    When I call ensureTestEnvironment()
    Then an error is thrown with message containing "SECURITY"
    And the error message contains "Test-only function"

  # ============================================================================
  # isTestEnvironment
  # ============================================================================

  @acceptance-criteria @happy-path
  Scenario: isTestEnvironment returns true in test mode
    Given globalThis.__CONVEX_TEST_MODE__ is true
    When I call isTestEnvironment()
    Then I receive true

  @acceptance-criteria @happy-path
  Scenario: isTestEnvironment returns true with IS_TEST env
    Given process.env.IS_TEST is "true"
    When I call isTestEnvironment()
    Then I receive true

  @acceptance-criteria @validation
  Scenario: isTestEnvironment returns false in production
    Given process.env.CONVEX_CLOUD_URL is set
    And IS_TEST is not set
    When I call isTestEnvironment()
    Then I receive false
    # Unlike ensureTestEnvironment, this doesn't throw

  @acceptance-criteria @happy-path
  Scenario: isTestEnvironment is a safe boolean check
    When I call isTestEnvironment()
    Then I receive a boolean value
    And no error is ever thrown from this function
