# BddTestingInfrastructureExecutableTests

**Purpose:** Detailed patterns for BddTestingInfrastructureExecutableTests

---

## Summary

**Progress:** [████████████████████] 2/2 (100%)

| Status      | Count |
| ----------- | ----- |
| ✅ Completed | 2     |
| 🚧 Active   | 0     |
| 📋 Planned  | 0     |
| **Total**   | 2     |

---

## ✅ Completed Patterns

### ✅ Bdd Testing Infrastructure Executable Tests

| Property | Value     |
| -------- | --------- |
| Status   | completed |

As a platform developer
  I want integration tests to be properly isolated
  So that tests don't interfere with each other and produce reliable results

  This feature validates the Docker restart pattern for state cleanup,
  test namespacing for entity isolation, and the overall integration
  test infrastructure that enables BDD testing at the integration level.

  Key Concepts: Docker Restart (clean state between suites), Test Namespace
  (unique prefix per test), State Pollution (previous test data affects results),
  Workpool Isolation (background jobs don't leak between tests).

#### Acceptance Criteria

**Fresh state after Docker restart**

- Given a previous test created entity "order-123"
- When Docker is restarted via "just restart"
- Then querying for "order-123" should return nothing
- And Workpool state should be empty
- And scheduled functions should be cleared

**Detect state pollution without restart**

- Given a test created entity with id "polluted-entity"
- And Docker was NOT restarted
- When a new test queries the database
- Then "polluted-entity" may still exist
- And this indicates potential state pollution

**Unique namespace per test**

- Given test "test-1" with namespace "ns_abc123"
- And test "test-2" with namespace "ns_def456"
- When both tests create entity with logical id "order-1"
- Then test-1 creates "ns_abc123_order-1"
- And test-2 creates "ns_def456_order-1"
- And no collision occurs

**Namespace applied to correlation IDs**

- Given a test with namespace "ns_test"
- When executing a command
- Then correlationId should include namespace prefix
- And events can be traced to the specific test

**Workpool jobs from previous test don't interfere**

- Given test-1 queued a Workpool job that takes 5 seconds
- And test-1 completed without waiting for the job
- When test-2 starts immediately
- Then test-2 should not see test-1's pending job
- And Docker restart is required for complete isolation

**Scheduled functions use test-specific context**

- Given a test schedules a function for 1 minute later
- When the test completes
- Then the scheduled function should include test namespace
- And cleanup can identify test-specific scheduled functions

#### Business Rules

**Docker restart provides clean state between test suites**

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

_Verified by: Fresh state after Docker restart, Detect state pollution without restart_

**Each test uses unique namespace to prevent collisions**

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

_Verified by: Unique namespace per test, Namespace applied to correlation IDs_

**Background jobs are isolated between tests**

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

_Verified by: Workpool jobs from previous test don't interfere, Scheduled functions use test-specific context_

---

### ✅ Bdd Testing Infrastructure Executable Tests

| Property | Value     |
| -------- | --------- |
| Status   | completed |

As a platform maintainer
  I want all platform packages to have BDD test coverage
  So that public APIs are documented through executable specifications

  This feature validates that each @libar-dev/platform-* package has
  appropriate BDD test coverage for its public APIs, following the
  Gherkin-only testing policy.

  Coverage Requirements: All platform packages (core, decider, fsm, store, bus, bc)
  must have tests/features/behavior/ directories with BDD coverage for public APIs.

#### Acceptance Criteria

**Package has feature directory - platform-core**

- Given package @libar-dev/platform-core
- When checking test structure
- Then tests/features/ directory should exist
- And at least one .feature file should be present

**Package has feature directory - platform-decider**

- Given package @libar-dev/platform-decider
- When checking test structure
- Then tests/features/ directory should exist
- And at least one .feature file should be present

**Package has feature directory - platform-fsm**

- Given package @libar-dev/platform-fsm
- When checking test structure
- Then tests/features/ directory should exist
- And at least one .feature file should be present

**Package has feature directory - platform-store**

- Given package @libar-dev/platform-store
- When checking test structure
- Then tests/features/ directory should exist
- And at least one .feature file should be present

**Package has feature directory - platform-bus**

- Given package @libar-dev/platform-bus
- When checking test structure
- Then tests/features/ directory should exist
- And at least one .feature file should be present

**Package has feature directory - platform-bc**

- Given package @libar-dev/platform-bc
- When checking test structure
- Then tests/features/ directory should exist
- And at least one .feature file should be present

**Exported function has feature coverage**

- Given an exported function "createDeciderHandler"
- When checking BDD coverage
- Then a feature file should document its behavior
- And scenarios should cover happy path and edge cases

**Missing coverage is detected**

- Given an exported function without feature coverage
- When running coverage analysis
- Then a warning should be generated
- And the missing function should be listed

**Step definitions follow naming convention**

- Given package @libar-dev/platform-core
- When checking step definition organization
- Then steps should be in tests/steps/ directory
- And each feature area has its own step file
- And no duplicate step patterns exist across files

**Step file matches feature file**

- Given feature file "decider-outputs.feature"
- When looking for step definitions
- Then steps should be in "steps/decider/outputs.steps.ts" or "steps/decider.steps.ts"

#### Business Rules

**Each platform package must have a tests/features/ directory**

**Invariant:** Every @libar-dev/platform-* package contains a tests/features/
    directory with at least one .feature file. Public APIs are documented
    through executable BDD specifications, not standalone .test.ts files.

    **Rationale:** BDD as the exclusive testing approach for platform packages
    yields living documentation in business terms, ensures domain-expert
    readability of behavioural contracts, and prevents the package family from
    drifting back to opaque unit-test conventions.

    **Verified by:** Package has feature directory - platform-core,
    Package has feature directory - platform-decider,
    Package has feature directory - platform-fsm,
    Package has feature directory - platform-store,
    Package has feature directory - platform-bus,
    Package has feature directory - platform-bc

    Platform packages expose public APIs that need BDD coverage.
    The tests/features/ directory is the standard location.

_Verified by: Package has feature directory - platform-core, Package has feature directory - platform-decider, Package has feature directory - platform-fsm, Package has feature directory - platform-store, Package has feature directory - platform-bus, Package has feature directory - platform-bc_

**Public APIs must have corresponding feature files**

**Invariant:** Every exported function or type that is part of a platform
    package's public API has a feature file documenting its behaviour with
    happy-path and edge-case scenarios. Missing coverage is detected and
    surfaced by the coverage analyser.

    **Rationale:** Public-API drift between code and specification is the
    fastest way for living documentation to become misleading. Tying coverage
    to exports keeps the executable surface aligned with what consumers see.

    **Verified by:** Exported function has feature coverage,
    Missing coverage is detected

    Each exported function or type that is part of the public API
    should have BDD coverage demonstrating its behavior.

_Verified by: Exported function has feature coverage, Missing coverage is detected_

**Step definitions must be organized by domain**

**Invariant:** Step definitions are placed under tests/steps/ in per-domain
    files. No two step files declare the same Given/When/Then pattern; pattern
    conflicts are reported at load time rather than silently shadowing earlier
    bindings.

    **Rationale:** vitest-cucumber resolves duplicate step patterns by silently
    shadowing — only the last-loaded binding runs. Domain-scoped organisation
    prevents the silent-shadow class of bug entirely and keeps step ownership
    legible to reviewers.

    **Verified by:** Step definitions follow naming convention,
    Step file matches feature file

    To prevent step definition conflicts, each package organizes
    steps by feature area in separate files.

_Verified by: Step definitions follow naming convention, Step file matches feature file_

---

[← Back to Roadmap](../ROADMAP.md)
