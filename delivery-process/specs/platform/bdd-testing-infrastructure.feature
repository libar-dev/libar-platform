@libar-docs
@libar-docs-release:v0.2.0
@libar-docs-pattern:BddTestingInfrastructure
@libar-docs-status:completed
@libar-docs-unlock-reason:2026-01-18-phase-19-completion
@libar-docs-phase:19
@libar-docs-effort:2w
@libar-docs-product-area:Platform
@libar-docs-depends-on:DeciderPattern
@libar-docs-executable-specs:platform-core/tests/features/behavior/testing
Feature: BDD Testing Infrastructure - Gherkin as Exclusive Testing Approach

  **Problem:** Domain logic tests require infrastructure (Docker, database).
  Duplicate step definitions cause conflicts. Platform packages lack BDD tests.

  **Solution:** Behavior-Driven Development using Gherkin as exclusive testing approach:
  - Pure deciders map perfectly to Given/When/Then
  - No Docker needed for domain logic tests
  - Living documentation for domain experts
  - Step definition organization prevents conflicts

  **Why It Matters for Convex-Native ES:**
  | Benefit | How |
  | Living documentation | Feature files describe behavior in business terms |
  | No infrastructure overhead | Pure deciders test without Docker/database |
  | Domain expert readability | Gherkin scenarios are human-readable specs |
  | Step reuse | Organized step definitions prevent conflicts |
  | Fast feedback | Unit-level BDD tests run in milliseconds |

  **Key Concepts:**
  | Concept | Description |
  | Pure Deciders | Business logic in pure functions enables infrastructure-free testing |
  | Step Organization | Separate files per domain prevent pattern conflicts |
  | Docker Restart | Clean state pattern for integration tests |
  | Test Namespace | Unique prefix per test prevents entity collisions |
  | Given/When/Then | State → Command → Outcome mapping for deciders |

  **Migration from .test.ts to .feature:**
  | From | To |
  | describe/it blocks with expect assertions | Scenario with Given/When/Then steps |
  | decideSubmitOrder(null, command, context) | Given no existing order, When SubmitOrder command |
  | expect(result.isSuccess).toBe(true) | Then the result should be success |
  | expect(result.event.type).toBe(...) | And OrderSubmitted event should be emitted |

  Background: Deliverables
    Given the following deliverables:
      | Deliverable | Status | Location | Tests | Test Type |
      | Decider test scenarios | complete | examples/order-management/tests/features/deciders/ | Yes | unit |
      | FSM test scenarios | complete | examples/order-management/tests/features/fsm/ | Yes | unit |
      | Step definition organization | complete | deps/libar-dev-packages/packages/platform/*/tests/steps/ | Yes | unit |
      | Integration test isolation | complete | deps/libar-dev-packages/packages/platform/core/tests/features/behavior/testing/ | Yes | unit |
      | Platform package features | complete | deps/libar-dev-packages/packages/platform/*/tests/features/ | Yes | unit |
      | Testing documentation | complete | docs/implementation/TESTING.md | No | - |

  Rule: All domain logic tests must be Gherkin
    Deciders, FSM, invariants use Given/When/Then format exclusively.

    @acceptance-criteria @happy-path
    Scenario: Decider test follows BDD pattern
      Given a decider for "SubmitOrder"
      When writing tests for the decider
      Then tests must be in .feature file format
      And steps must use Given (state) / When (command) / Then (outcome)

  Rule: Deciders enable perfect test isolation
    Pure functions = no mocking, no ctx, no database.

    @acceptance-criteria @happy-path
    Scenario: Decider test requires no infrastructure
      Given a pure decider function
      When running the test
      Then no database connection should be needed
      And no Docker containers should be required
      And test should complete in under 100ms

  Rule: Step definitions must be organized to prevent conflicts
    Separate step files per domain area, namespaced patterns.

    @acceptance-criteria @happy-path
    Scenario: Step definitions are domain-scoped
      Given step definitions for "orders" domain
      And step definitions for "inventory" domain
      When both are loaded
      Then no pattern conflicts should occur
      And each domain has its own step file

    @acceptance-criteria @validation
    Scenario: Duplicate step patterns cause conflict error
      Given step definitions with pattern "Given an order"
      And another step file with same pattern "Given an order"
      When both are loaded
      Then vitest-cucumber should report pattern conflict
      And error should identify the duplicate pattern

  Rule: Integration tests use action-focused steps
    Command lifecycle tests validate full flow with assertions.

    @acceptance-criteria @happy-path
    Scenario: Integration test validates command lifecycle
      Given a system with unique test namespace
      When I execute "SubmitOrder" command
      Then the command should succeed
      And projection should reflect submitted state
      And event should be in event store

  Rule: Platform packages must have feature coverage
    libar-dev/platform-* packages need BDD tests for public APIs.

    @acceptance-criteria @happy-path
    Scenario: Platform package has feature tests
      Given @libar-dev/platform-decider package
      When checking test coverage
      Then tests/features/ directory should exist
      And public API behaviors should have scenarios
