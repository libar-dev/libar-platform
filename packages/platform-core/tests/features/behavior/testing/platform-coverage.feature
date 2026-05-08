@architect
@architect-pattern:BddTestingInfrastructureExecutableTests
@architect-implements:BddTestingInfrastructure
@architect-status:completed
@architect-unlock-reason:refactoring-carve-out-executable-tests-for-shipped-pattern-predates-implements-convention
@architect-phase:19
@architect-product-area:PlatformCore
@testing-infrastructure
Feature: Platform Package BDD Coverage

  As a platform maintainer
  I want all platform packages to have BDD test coverage
  So that public APIs are documented through executable specifications

  This feature validates that each @libar-dev/platform-* package has
  appropriate BDD test coverage for its public APIs, following the
  Gherkin-only testing policy.

  Coverage Requirements: All platform packages (core, decider, fsm, store, bus, bc)
  must have tests/features/behavior/ directories with BDD coverage for public APIs.

  Background: Platform Package Structure
    Given the monorepo contains @libar-dev/platform-* packages
    And each package follows the standard directory structure

  # ============================================================================
  # Package Feature Directory Structure
  # ============================================================================

  Rule: Each platform package must have a tests/features/ directory

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

    @acceptance-criteria @happy-path
    Scenario: Package has feature directory - platform-core
      Given package @libar-dev/platform-core
      When checking test structure
      Then tests/features/ directory should exist
      And at least one .feature file should be present

    @acceptance-criteria @happy-path
    Scenario: Package has feature directory - platform-decider
      Given package @libar-dev/platform-decider
      When checking test structure
      Then tests/features/ directory should exist
      And at least one .feature file should be present

    @acceptance-criteria @happy-path
    Scenario: Package has feature directory - platform-fsm
      Given package @libar-dev/platform-fsm
      When checking test structure
      Then tests/features/ directory should exist
      And at least one .feature file should be present

    @acceptance-criteria @happy-path
    Scenario: Package has feature directory - platform-store
      Given package @libar-dev/platform-store
      When checking test structure
      Then tests/features/ directory should exist
      And at least one .feature file should be present

    @acceptance-criteria @happy-path
    Scenario: Package has feature directory - platform-bus
      Given package @libar-dev/platform-bus
      When checking test structure
      Then tests/features/ directory should exist
      And at least one .feature file should be present

    @acceptance-criteria @happy-path
    Scenario: Package has feature directory - platform-bc
      Given package @libar-dev/platform-bc
      When checking test structure
      Then tests/features/ directory should exist
      And at least one .feature file should be present

  # ============================================================================
  # Public API Coverage
  # ============================================================================

  Rule: Public APIs must have corresponding feature files

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

    @acceptance-criteria @happy-path
    Scenario: Exported function has feature coverage
      Given an exported function "createDeciderHandler"
      When checking BDD coverage
      Then a feature file should document its behavior
      And scenarios should cover happy path and edge cases

    @acceptance-criteria @validation
    Scenario: Missing coverage is detected
      Given an exported function without feature coverage
      When running coverage analysis
      Then a warning should be generated
      And the missing function should be listed

  # ============================================================================
  # Step Definition Organization
  # ============================================================================

  Rule: Step definitions must be organized by domain

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

    @acceptance-criteria @happy-path
    Scenario: Step definitions follow naming convention
      Given package @libar-dev/platform-core
      When checking step definition organization
      Then steps should be in tests/steps/ directory
      And each feature area has its own step file
      And no duplicate step patterns exist across files

    @acceptance-criteria @happy-path
    Scenario: Step file matches feature file
      Given feature file "decider-outputs.feature"
      When looking for step definitions
      Then steps should be in "steps/decider/outputs.steps.ts" or "steps/decider.steps.ts"

  # ============================================================================
  # Non-executable Invariants
  # ============================================================================

  # Invariant: Domain logic — deciders, FSM transitions, invariants — is tested
  # exclusively through .feature files using Given/When/Then. No describe/it/.test.ts
  # files exist for domain logic in platform packages or in example apps under
  # tests/features/.
  # Rationale: Pure deciders map cleanly onto State (Given) → Command (When) →
  # Outcome (Then). Mixing styles fragments the documentation surface and lets
  # opaque assertion-style tests grow back into the codebase. A single style
  # produces uniform living documentation.

  # Invariant: Decider unit tests run without Docker, without a database connection,
  # and without any external infrastructure. A decider unit test suite completes in
  # under 100ms per scenario on developer hardware.
  # Rationale: Pure functions have no I/O surface to mock — Given is just state,
  # When is just a command record, Then asserts on the returned event or error.
  # Removing infrastructure from the test path is what makes BDD feedback loops
  # fast enough to run on every save.
