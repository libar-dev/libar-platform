Feature: Testing Infrastructure
  Comprehensive BDD migration with Gherkin feature files for all domain logic.

  Complete BDD migration for platform packages and remaining application code. Fix
  integration test duplicate step issue. Establish patterns for testing Deciders
  (pure Given/When/Then), handlers (with Docker), projections, and sagas. Create
  testing utilities for common scenarios (event builders, state factories, assertion
  helpers). Document testing strategy per layer (unit vs integration boundaries).
  Enable test isolation via namespace prefixing (testRunId) replacing clearAll
  anti-pattern.

  Sessions:
  - 19.1: Test Isolation Strategy (namespace-based) — Complete
  - 19.2: Platform Testing Module Extraction — Complete
  - 19.3: Example App Integration — Complete
  - 19.4: PDR-003 Directory Restructure — In Progress
  - 19.5: Platform Package BDD Coverage — Planned

  Key Deliverables:
  - Testing utilities (event builders, state factories, assertion helpers)
  - Test isolation via namespace prefixing (testRunId)
  - Decider testing patterns (pure Given/When/Then)
  - FSM testing patterns (transition assertions)
  - Handler testing patterns (integration with Docker)
  - Integration test helpers (testMutation, testQuery, testAction)
  - BDD feature files for all platform packages (@libar-dev/*)
  - Testing strategy documentation per layer
  - Directory restructure per PDR-003

  Major Patterns Introduced:
  - Namespace-based test isolation (testRunId + withPrefix)
  - Pure decider testing (no Docker)
  - Layer-appropriate testing boundaries
  - BDD test organization patterns
  - Testing utility patterns
  - Platform testing module extraction pattern

  Platform Testing Modules Created:
  - @libar-dev/platform-core/testing: test-run-id, polling, data-table, integration-helpers, world, guards
  - @libar-dev/platform-decider/testing: scenario-state, assertions (12 helpers)
  - @libar-dev/platform-fsm/testing: assertions (8 helpers + 4 utilities)

  Implemented in: examples/order-management/tests/, deps/libar-dev-packages/packages/platform/*/tests/

  Background: Key Deliverables
    Given the following deliverables are planned:
      | Deliverable                             | Status      | Tests | Location                                             |
      | Testing utilities module                | Complete    | Yes   | @libar-dev/platform-core/src/testing/                |
      | Namespace-based test isolation          | Complete    | Yes   | @libar-dev/platform-core/src/testing/test-run-id.ts  |
      | Decider testing patterns                | Complete    | Yes   | @libar-dev/platform-decider/src/testing/             |
      | FSM testing patterns                    | Complete    | Yes   | @libar-dev/platform-fsm/src/testing/                 |
      | Handler testing patterns                | Complete    | Yes   | examples/order-management/tests/steps/deciders/      |
      | Integration test helpers                | Complete    | Yes   | @libar-dev/platform-core/src/testing/                |
      | BDD feature files for platform          | Pending     | No    | deps/libar-dev-packages/packages/platform/*/tests/features/ |
      | Directory restructure (PDR-003)         | Pending     | No    | examples/order-management/tests/features/behavior/   |
      | Testing strategy documentation          | Partial     | No    | docs/implementation/TESTING.md                       |
