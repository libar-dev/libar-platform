@libar-docs-pattern:TestIsolation
@testing-infrastructure
Feature: Test Isolation via Namespace Prefixing

  As a test author
  I want automatic namespace isolation for test data
  So that tests don't interfere with each other

  The platform-core/testing module provides test isolation utilities that
  prefix entity IDs with a unique test run identifier. This prevents test
  pollution where one test's data affects another test's assertions.

  Background:
    Given the platform-core testing module is imported

  @acceptance-criteria @happy-path
  Scenario: Generate unique test run ID
    When I call generateTestRunId()
    Then I receive a unique string identifier
    And subsequent calls return different IDs

  @acceptance-criteria @happy-path
  Scenario: Module-level testRunId is stable within a test run
    Given a test run has started
    When I access testRunId multiple times
    Then the same value is returned each time

  @acceptance-criteria @happy-path
  Scenario: Prefix entity IDs with test run namespace
    Given a testRunId has been generated
    When I call withPrefix("order-123")
    Then the result contains the testRunId prefix
    And the original ID is preserved after the prefix
    And the format is "{testRunId}_order-123"

  @acceptance-criteria
  Scenario: Custom prefix for specific isolation
    When I call withCustomPrefix("mytest", "order-123")
    Then the result is "mytest_order-123"

  @acceptance-criteria @happy-path
  Scenario: Test isolation prevents cross-test pollution
    Given test A creates an entity with withPrefix("entity-1")
    And test B has a different testRunId
    When test B queries for entities
    Then test B does not see test A's entity
    # This is verified by namespace prefixing - each test's entities have unique prefixes
