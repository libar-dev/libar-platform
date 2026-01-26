@libar-docs-pattern:BDDWorld
@testing-infrastructure
@libar-docs-pattern:BDDWorld
@libar-docs-status:completed
@libar-docs-phase:57
@libar-docs-quarter:Q1-2026
@libar-docs-effort:2h
@libar-docs-effort-actual:2h
@libar-docs-completed:2026-01-08
@libar-docs-product-area:PlatformCore
@libar-docs-business-value:manage-scenario-context-across-steps
@libar-docs-priority:high
Feature: BDD Test World State Management

  As a BDD test author
  I want world/state management utilities
  So that I can manage scenario context across steps

  The "World" in BDD testing is the shared context across all steps within
  a single scenario. This module provides base interfaces and factory
  functions for creating test worlds for both unit and integration tests.

  Background: Deliverables
    Given the following deliverables:
      | Deliverable | Status | Tests | Location |
      | BaseUnitTestWorld interface | Complete | Yes | src/testing/world.ts |
      | BaseIntegrationTestWorld interface | Complete | Yes | src/testing/world.ts |
      | createBaseUnitTestWorld() factory | Complete | Yes | src/testing/world.ts |
      | createBaseIntegrationTestWorld() factory | Complete | Yes | src/testing/world.ts |
      | resetWorldState() utility | Complete | Yes | src/testing/world.ts |
      | Behavior test feature file | Complete | Yes | This file |
    And the platform-core testing module is imported

  # ============================================================================
  # Unit Test World
  # ============================================================================

  @acceptance-criteria @happy-path
  Scenario: Create base unit test world
    Given a mock ConvexTest instance
    When I call createBaseUnitTestWorld(t)
    Then I receive a BaseUnitTestWorld object
    And the world.t is the mock instance
    And the world.lastResult is null
    And the world.lastError is null
    And the world.scenario is an empty object

  @acceptance-criteria @happy-path
  Scenario: Unit test world supports scenario context
    Given a BaseUnitTestWorld instance
    When I set world.scenario.orderId to "order-123"
    Then world.scenario.orderId is "order-123"

  @acceptance-criteria @happy-path
  Scenario: Unit test world tracks last result
    Given a BaseUnitTestWorld instance
    When I set world.lastResult to a success object
    Then world.lastResult contains the success object

  @acceptance-criteria @happy-path
  Scenario: Unit test world tracks last error
    Given a BaseUnitTestWorld instance
    When I set world.lastError to an Error
    Then world.lastError is the Error instance

  # ============================================================================
  # Integration Test World
  # ============================================================================

  @acceptance-criteria @happy-path
  Scenario: Create base integration test world
    Given a mock ConvexTestingHelper instance
    When I call createBaseIntegrationTestWorld(t)
    Then I receive a BaseIntegrationTestWorld object
    And the world.t is the mock instance
    And the world.backendUrl is set

  @acceptance-criteria @happy-path
  Scenario: Integration test world uses custom backend URL
    Given a mock ConvexTestingHelper instance
    When I call createBaseIntegrationTestWorld(t, "http://custom:3210")
    Then world.backendUrl is "http://custom:3210"

  @acceptance-criteria @happy-path
  Scenario: Integration test world defaults to localhost
    Given a mock ConvexTestingHelper instance
    And no CONVEX_URL environment variable is set
    When I call createBaseIntegrationTestWorld(t)
    Then world.backendUrl contains "127.0.0.1:3210"

  # ============================================================================
  # World State Reset
  # ============================================================================

  @acceptance-criteria @happy-path
  Scenario: Reset world state clears all fields
    Given a BaseUnitTestWorld instance with populated state
    When I call resetWorldState(world)
    Then world.lastResult is null
    And world.lastError is null
    And world.scenario is an empty object

  @acceptance-criteria @happy-path
  Scenario: Reset preserves test backend reference
    Given a BaseUnitTestWorld instance with a mock t
    When I call resetWorldState(world)
    Then world.t is still the original mock instance
