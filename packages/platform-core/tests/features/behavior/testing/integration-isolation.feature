@architect
@architect-pattern:BddTestingInfrastructureExecutableTests
@architect-implements:BddTestingInfrastructure
@architect-status:completed
@architect-unlock-reason:refactoring-carve-out-executable-tests-for-shipped-pattern-predates-implements-convention
@architect-phase:19
@architect-product-area:PlatformCore
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

    **Invariant:** Between integration test suites, a Docker restart wipes the
    backend database, Workpool queue, and scheduled-function table. After
    restart, no entity, queued job, or scheduled function from a prior run
    is observable.

    **Rationale:** Workpool and Scheduler internal state is opaque — there is
    no programmatic cleanup API. Docker restart is the only deterministic way
    to guarantee a fresh state, which is required for integration tests to be
    reproducible. Skipping the restart causes state pollution to leak across
    suites in non-obvious ways.

    **Verified by:** Fresh state after Docker restart,
    Detect state pollution without restart

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

    **Invariant:** Every test prefixes its logical entity ids and correlation
    ids with a unique per-test namespace. Two tests creating entities with the
    same logical id produce distinct stored ids and never collide.

    **Rationale:** Within a Docker-restart boundary, multiple individual tests
    share state. A unique namespace per test is what allows them to run
    independently within that boundary, and propagating the namespace into
    correlation ids enables event-trace attribution back to the specific test.

    **Verified by:** Unique namespace per test,
    Namespace applied to correlation IDs

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

    **Invariant:** Workpool jobs and scheduled functions enqueued by one test
    are isolated from subsequent tests. Pending jobs from a previous test are
    not observable to the next test, and scheduled functions carry the
    originating test's namespace so cleanup can identify them.

    **Rationale:** Background jobs run asynchronously and may outlive the test
    that scheduled them. Without isolation, slow jobs from test-1 silently
    influence test-2's assertions. Namespacing scheduled functions allows
    targeted cleanup; full isolation across suites still requires a Docker
    restart.

    **Verified by:** Workpool jobs from previous test don't interfere,
    Scheduled functions use test-specific context

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
