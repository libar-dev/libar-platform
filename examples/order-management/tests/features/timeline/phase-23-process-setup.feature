Feature: Monorepo Process Setup
  Configure delivery process at monorepo level for automated documentation.

  **Problem:**
  - 23 feature files exist but lack Background: Deliverables DataTables
  - Schema validation fails on 9 files, warnings on others
  - Manual documentation in docs/project-management/ not connected to process
  - No ROADMAP.md, SESSION-CONTEXT.md, REMAINING-WORK.md generators wired
  - Generator configs exist in package but not exposed at monorepo level

  **Solution:**
  - Add Background: Deliverables DataTables to all 23 existing feature files
  - Wire existing generator configs to monorepo-level commands
  - Update root package.json with new docs:* commands
  - Ensure generators produce expected output with no validation errors

  Background: Deliverables
    Given the following deliverables:
      | Deliverable | Status | Tests | Location | Release |
      | Create phase-23-process-setup.feature | Complete | No | examples/order-management/tests/features/timeline/phase-23-process-setup.feature | - |
      | Create phase-24-old-roadmap-porting.feature | Complete | No | examples/order-management/tests/features/timeline/phase-24-old-roadmap-porting.feature | - |
      | Add DataTable to phase-00-initialization.feature | Pending | No | examples/order-management/tests/features/timeline/phase-00-initialization.feature | - |
      | Add DataTable to phase-01-core-infrastructure.feature | Pending | No | examples/order-management/tests/features/timeline/phase-01-core-infrastructure.feature | - |
      | Add DataTable to phase-02-event-store-orchestration.feature | Pending | No | examples/order-management/tests/features/timeline/phase-02-event-store-orchestration.feature | - |
      | Add DataTable to phase-03-command-bus.feature | Pending | No | examples/order-management/tests/features/timeline/phase-03-command-bus.feature | - |
      | Add DataTable to phase-04-orders-bc.feature | Pending | No | examples/order-management/tests/features/timeline/phase-04-orders-bc.feature | - |
      | Add DataTable to phase-05-inventory-bc.feature | Pending | No | examples/order-management/tests/features/timeline/phase-05-inventory-bc.feature | - |
      | Add DataTable to phase-06-cross-context-integration.feature | Pending | No | examples/order-management/tests/features/timeline/phase-06-cross-context-integration.feature | - |
      | Add DataTable to phase-07-projection-engine.feature | Pending | No | examples/order-management/tests/features/timeline/phase-07-projection-engine.feature | - |
      | Add DataTable to phase-08-documentation-polish.feature | Pending | No | examples/order-management/tests/features/timeline/phase-08-documentation-polish.feature | - |
      | Add DataTable to phase-09-event-system.feature | Pending | No | examples/order-management/tests/features/timeline/phase-09-event-system.feature | - |
      | Add DataTable to phase-10-command-system.feature | Pending | No | examples/order-management/tests/features/timeline/phase-10-command-system.feature | - |
      | Add DataTable to phase-11-bc-formalization.feature | Pending | No | examples/order-management/tests/features/timeline/phase-11-bc-formalization.feature | - |
      | Add DataTable to phase-12-repository-read-model.feature | Pending | No | examples/order-management/tests/features/timeline/phase-12-repository-read-model.feature | - |
      | Add DataTable to phase-13-process-manager.feature | Pending | No | examples/order-management/tests/features/timeline/phase-13-process-manager.feature | - |
      | Add DataTable to phase-14-decider-formalization.feature | Pending | No | examples/order-management/tests/features/timeline/phase-14-decider-formalization.feature | - |
      | Add DataTable to phase-15-projection-categories.feature | Pending | No | examples/order-management/tests/features/timeline/phase-15-projection-categories.feature | - |
      | Add DataTable to phase-16-dcb.feature | Pending | No | examples/order-management/tests/features/timeline/phase-16-dcb.feature | - |
      | Add DataTable to phase-17-reactive-projections.feature | Pending | No | examples/order-management/tests/features/timeline/phase-17-reactive-projections.feature | - |
      | Add DataTable to phase-18-production-hardening.feature | Pending | No | examples/order-management/tests/features/timeline/phase-18-production-hardening.feature | - |
      | Add DataTable to phase-19-testing-infrastructure.feature | Pending | No | examples/order-management/tests/features/timeline/phase-19-testing-infrastructure.feature | - |
      | Add DataTable to phase-20-service-independence.feature | Pending | No | examples/order-management/tests/features/timeline/phase-20-service-independence.feature | - |
      | Add DataTable to phase-21-integration-patterns.feature | Pending | No | examples/order-management/tests/features/timeline/phase-21-integration-patterns.feature | - |
      | Add DataTable to phase-22-agent-as-bc.feature | Pending | No | examples/order-management/tests/features/timeline/phase-22-agent-as-bc.feature | - |
      | Wire ROADMAP.md generator to root package.json | Complete | No | package.json | - |
      | Wire SESSION-CONTEXT.md generator to root package.json | Complete | No | package.json | - |
      | Wire REMAINING-WORK.md generator to root package.json | Complete | No | package.json | - |
      | Verify docs:patterns runs without validation errors | Pending | No | - | - |
      | Verify docs:roadmap produces expected output | Complete | No | docs-living/ROADMAP.md | - |
      | Update CLAUDE.md with new commands | Pending | No | CLAUDE.md | - |
      | Define timeline ordering strategy for legacy vs new phases | Pending | No | - | - |

  @acceptance-criteria
  Scenario: All feature files pass schema validation
    Given all timeline feature files have Background: Deliverables
    When running docs:patterns command
    Then no schema validation failures occur
    And no parsing warnings appear

  @acceptance-criteria
  Scenario: ROADMAP.md reflects planned phases
    Given docs:roadmap command is configured
    When running pnpm docs:roadmap
    Then docs-living/ROADMAP.md is generated
    And it shows phases 15-22 as planned
    And it shows dependency relationships
