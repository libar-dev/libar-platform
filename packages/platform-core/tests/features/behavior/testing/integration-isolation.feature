@libar-docs
@libar-docs-phase:19
@libar-docs-product-area:PlatformCore
@testing-infrastructure
Feature: Integration Test Isolation

  As a platform developer
  I want integration tests to be properly isolated
  So that tests don't interfere with each other and produce reliable results

  This feature validates the Docker restart pattern for state cleanup,
  test namespacing for entity isolation, and the overall integration
  test infrastructure that enables BDD testing at the integration level.

  Key Concepts: Docker Restart (clean state between suites), Test Namespace
  (unique prefix per test), State Pollution (previous test data affects results),
  Workpool Isolation (background jobs don't leak between tests).

  Background: Integration Test Environment
    Given the integration test environment is configured
    And Docker backend is available on port 3210

  # ============================================================================
  # Docker Restart Pattern
  # ============================================================================

  Rule: Docker restart provides clean state between test suites

    Integration tests require a fresh database state. The Docker restart
    pattern ensures no state pollution from previous test runs.

    @acceptance-criteria @happy-path
    Scenario: Fresh state after Docker restart
      Given a previous test created entity "order-123"
      When Docker is restarted via "just restart"
      Then querying for "order-123" should return nothing
      And Workpool state should be empty
      And scheduled functions should be cleared

    @acceptance-criteria @validation
    Scenario: Detect state pollution without restart
      Given a test created entity with id "polluted-entity"
      And Docker was NOT restarted
      When a new test queries the database
      Then "polluted-entity" may still exist
      And this indicates potential state pollution

  # ============================================================================
  # Test Namespacing
  # ============================================================================

  Rule: Each test uses unique namespace to prevent collisions

    Test namespacing allows multiple tests to run without entity ID
    collisions, even when Docker is not restarted between individual tests.

    @acceptance-criteria @happy-path
    Scenario: Unique namespace per test
      Given test "test-1" with namespace "ns_abc123"
      And test "test-2" with namespace "ns_def456"
      When both tests create entity with logical id "order-1"
      Then test-1 creates "ns_abc123_order-1"
      And test-2 creates "ns_def456_order-1"
      And no collision occurs

    @acceptance-criteria @happy-path
    Scenario: Namespace applied to correlation IDs
      Given a test with namespace "ns_test"
      When executing a command
      Then correlationId should include namespace prefix
      And events can be traced to the specific test

  # ============================================================================
  # Workpool and Scheduler Isolation
  # ============================================================================

  Rule: Background jobs are isolated between tests

    Workpool jobs and scheduled functions from one test should not
    affect another test's results.

    @acceptance-criteria @validation
    Scenario: Workpool jobs from previous test don't interfere
      Given test-1 queued a Workpool job that takes 5 seconds
      And test-1 completed without waiting for the job
      When test-2 starts immediately
      Then test-2 should not see test-1's pending job
      And Docker restart is required for complete isolation

    @acceptance-criteria @happy-path
    Scenario: Scheduled functions use test-specific context
      Given a test schedules a function for 1 minute later
      When the test completes
      Then the scheduled function should include test namespace
      And cleanup can identify test-specific scheduled functions
