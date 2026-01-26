Feature: Old Roadmap Porting
  Port completed milestones from old roadmap to feature file DataTables.

  **Problem:**
  - Rich detail in docs/project-management/roadmap/*.md (23 files)
  - Tasks, deliverables, verification steps not captured in feature files
  - Historical context needed for future work and pattern understanding
  - Manual docs will drift without connection to process

  **Solution:**
  - Extract deliverables from each completed phase's .md file
  - Populate DataTables with Location, Tests, Release info
  - Link to CHANGELOG entries for version history
  - Mark manual roadmap docs as deprecated once ported

  Background: Deliverables
    Given the following deliverables:
      | Deliverable | Status | Tests | Location | Release |
      | Port phase-00 deliverables from 00-project-initialization.md | Pending | No | phase-00-initialization.feature | v0.1.0 |
      | Port phase-01 deliverables from 01-core-infrastructure.md | Pending | No | phase-01-core-infrastructure.feature | v0.1.0 |
      | Port phase-02 deliverables from 02-event-store-orchestration.md | Pending | No | phase-02-event-store-orchestration.feature | v0.1.0 |
      | Port phase-03 deliverables from 03-command-bus-component.md | Pending | No | phase-03-command-bus.feature | v0.1.0 |
      | Port phase-04 deliverables from 04-orders-bounded-context.md | Pending | No | phase-04-orders-bc.feature | v0.1.0 |
      | Port phase-05 deliverables from 05-inventory-bounded-context.md | Pending | No | phase-05-inventory-bc.feature | v0.2.0 |
      | Port phase-06 deliverables from 06-cross-context-integration.md | Pending | No | phase-06-cross-context-integration.feature | v0.2.0 |
      | Port phase-08 deliverables from 08-documentation-polish.md | Pending | No | phase-08-documentation-polish.feature | v0.2.1 |
      | Port phase-09 deliverables from 09-event-system-enhancement.md | Pending | No | phase-09-event-system.feature | v0.3.0 |
      | Port phase-10 deliverables from 10-command-system-enhancement.md | Pending | No | phase-10-command-system.feature | v0.3.0 |
      | Port phase-11a deliverables from 11a-bounded-context-formalization.md | Pending | No | phase-11-bc-formalization.feature | v0.5.0 |
      | Port phase-12 deliverables from 12-repository-read-model.md | Pending | No | phase-12-repository-read-model.feature | v0.8.0 |
      | Port phase-13 deliverables from 13-process-manager.md | Pending | No | phase-13-process-manager.feature | v0.10.0 |
      | Port phase-14 deliverables (already detailed in feature file) | Pending | No | phase-14-decider-formalization.feature | v0.13.0 |
      | Review Phase 7 & 11B incomplete work at pivot midpoint | Pending | No | - | - |
      | Add deprecation notice to docs/project-management/ROADMAP.md | Pending | No | docs/project-management/ROADMAP.md | - |
      | Verify COMPLETED-MILESTONES.md shows all ported history | Pending | No | docs-living/timeline/COMPLETED-MILESTONES.md | - |
      | Implement ordering: completed legacy phases appear before new roadmap phases | Pending | No | - | - |

  @acceptance-criteria
  Scenario: Historical deliverables are preserved
    Given old roadmap phases have task tables
    When porting to feature file DataTables
    Then each task becomes a deliverable row
    And Location matches actual code paths
    And Release links to CHANGELOG entries

  @acceptance-criteria
  Scenario: Incomplete phases deferred appropriately
    Given Phase 7 (Projection Engine) is deferred
    And Phase 11B has incomplete sessions
    When reviewing at pivot midpoint
    Then assess whether to port based on architecture needs
    And document decision in ADR
