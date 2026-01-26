@libar-docs
@libar-docs-phase:19
@libar-docs-product-area:PlatformCore
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
