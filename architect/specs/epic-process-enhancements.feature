@architect
@architect-release:vNEXT
@process-enhancements
@epic
@architect-pattern:ProcessEnhancements
@architect-status:active
@architect-phase:100
@architect-level:epic
@architect-quarter:Q1-2026
@architect-effort:4w
@architect-product-area:DeliveryProcess
@architect-business-value:unify-process-enhancement-opportunities
@architect-priority:high
Feature: Process Enhancements - Unified Software Delivery Process

  **Vision:** Transform the delivery process from a documentation tool into a delivery operating system.

  Enable code-driven, multi-workflow documentation where code + .feature
  files are authoritative sources, and all artifacts are generated projections.

  **Problem:** Current delivery process capabilities are limited to document generation.
  The convergence roadmap identified 8 opportunities: Process Views as Projections,
  DoD as Machine-Checkable, Earned-Value Tracking, Requirements-Tests Traceability,
  Architecture Change Control, Progressive Governance, and Living Roadmap.

  **Solution:** Incrementally implement convergence opportunities, starting with foundation
  work (metadata tags) and progressing to validators, generators, and eventually
  Convex-native live projections.

  **Strategic Direction:**
  - Package (@libar-dev/architect): Document generation capabilities
  - Monorepo: Eventually leverage Convex projections for live queryable views

  **Architecture Decision (PDR-002):**
  Specs (this file) capture requirements that can evolve independently.
  TypeScript phase files link deliverables to phases/releases centrally.
  This separation enables specs to be combined, split, or refined without
  affecting release association.

  See: deps/libar-dev-packages/packages/tooling/architect/docs/ideation-convergence/

  Background: Related Specs
    Given the following specs in this epic:
      | Spec | Opportunity | Description |
      | process-metadata-expansion.feature | Foundation | 6 new metadata tags |
      | dod-validation.feature | Opp 2 | Machine-checkable DoD CLI |
      | effort-variance-tracking.feature | Opp 3 | Planned vs actual tracking |
      | traceability-enhancements.feature | Opp 4 | Coverage matrix and gap detection |
      | architecture-delta.feature | Opp 5 | Release change documentation |
      | progressive-governance.feature | Opp 6 | Risk-based filtering |
      | living-roadmap-cli.feature | Opp 8 | Interactive roadmap queries |

  @acceptance-criteria
  Scenario: Specs can evolve independently of phases
    Given a spec file in libar-platform/architect/specs/
    When the spec is refined, split, or combined
    Then TypeScript phase files maintain release association
    And no phase metadata needs updating in the spec

  @acceptance-criteria
  Scenario: TypeScript phase files link specs to releases
    Given a TypeScript phase file in architect/src/phases/
    Then it references the spec by pattern name
    And contains minimal metadata (phase, status, quarter, effort)
    And centralized location enables consistent release tracking
