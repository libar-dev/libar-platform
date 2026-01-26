@libar-docs-release:vNEXT
@process-enhancements
@foundation
@libar-docs-pattern:ProcessMetadataExpansion
@libar-docs-status:completed
@libar-docs-phase:100
@libar-docs-quarter:Q1-2026
@libar-docs-effort:2h
@libar-docs-effort-actual:2h
@libar-docs-completed:2026-01-08
@libar-docs-product-area:DeliveryProcess
@libar-docs-business-value:enable-variance-and-governance-tracking
@libar-docs-priority:high
Feature: Process Metadata Expansion

  **Problem:**
  The monorepo's delivery process lacked metadata tags for variance tracking, governance, and hierarchical views.
  Missing tag categories included:
  - Variance tracking (planned vs actual effort)
  - Progressive governance (risk-based filtering)
  - Backlog ordering (priority)
  - Time distribution analysis (workflow types)
  - Hierarchical roadmap views (epic→phase→task)

  Without these tags, opportunities 2-8 from the convergence roadmap could not
  be implemented. The tag registry needed expansion to enable future capabilities.

  **Solution:**
  Added 6 new metadata tags to delivery-process/tag-registry.json:
  - @libar-process-risk:{low|medium|high} - Progressive governance (Opp 6)
  - @libar-process-effort-actual:Nw - Variance tracking (Opp 3)
  - @libar-process-workflow:{design|impl|docs|testing|discovery} - Time distribution
  - @libar-process-priority:{high|medium|low} - Backlog ordering
  - @libar-process-level:{epic|phase|task} - Hierarchy support (Opp 8)
  - @libar-process-parent:PatternName - Hierarchy linking (Opp 8)

  Updated PDR-003 with new tag conventions and acceptance criteria.

  This work is foundation for Setup A (Framework Roadmap OS) from convergence docs.

  Background: Deliverables
    Given the following deliverables:
      | Deliverable | Status | Tests | Location |
      | Risk tag in registry | Complete | No | delivery-process/tag-registry.json |
      | Effort-actual tag in registry | Complete | No | delivery-process/tag-registry.json |
      | Workflow tag in registry | Complete | No | delivery-process/tag-registry.json |
      | Priority tag in registry | Complete | No | delivery-process/tag-registry.json |
      | Level tag in registry | Complete | No | delivery-process/tag-registry.json |
      | Parent tag in registry | Complete | No | delivery-process/tag-registry.json |
      | PDR-003 tag conventions update | Complete | No | delivery-process/decisions/pdr-003-*.feature |

  @acceptance-criteria
  Scenario: New tags are defined in tag registry
    Given the delivery-process/tag-registry.json file
    Then it should contain metadataTags for risk, effort-actual, workflow, priority, level, parent
    And each tag should have format, purpose, and example fields
    And enum tags should have values and default fields

  @acceptance-criteria
  Scenario: PDR-003 documents new tag conventions
    Given the PDR-003 decision file
    Then it should document process metadata tags section
    And it should document hierarchy tags section

  @acceptance-criteria
  Scenario: Tags enable filtering in generated docs
    Given TypeScript phase files with new metadata tags
    When generating roadmap documentation
    Then patterns can be filtered by risk, priority, workflow
    And hierarchy relationships are rendered
