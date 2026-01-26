@libar-docs
@libar-docs-adr:007
@libar-docs-adr-status:accepted
@libar-docs-adr-category:process
@libar-docs-pattern:PDR007TwoTierSpecArchitecture
@libar-docs-status:completed
@libar-docs-completed:2026-01-10
@libar-docs-release:v0.2.0
@libar-docs-phase:50
@libar-docs-quarter:Q1-2026
@libar-docs-effort:2h
Feature: PDR-007 Two-Tier Spec Architecture

  Background: Deliverables
    Given the following deliverables:
      | Deliverable | Status | Location |
      | Roadmap specs directory | Complete | delivery-process/specs/ |
      | Package specs directories | Complete | packages/*/tests/features/ |
      | Traceability tag system | Complete | libar-docs-executable-specs, libar-docs-roadmap-spec |

  Rule: Context - Conflated specs created duplication and confusion

    We have two distinct needs for feature files:
    1. Planning and Tracking - What to build, progress, deliverables
    2. Implementation Proof - How it works, unit tests, edge cases

    Initially, both were conflated into single feature files. This led to:
    - Duplication between roadmap specs and package tests
    - Unclear ownership of scenarios
    - Confusion about what is executable vs documentation

  Rule: Decision - Two-tier architecture with metadata-based traceability

    Establish a two-tier architecture with clear separation:

    | Tier | Location | Purpose | Executable |
    |------|----------|---------|------------|
    | Roadmap | delivery-process/specs/ | Planning, tracking, deliverables | No |
    | Package | packages/*/tests/features/ | Implementation tests | Yes |

    Traceability via Metadata:

    Instead of duplicating scenarios, use libar-docs-* tags for linking:

    | Spec Type | Tag | Purpose |
    |-----------|-----|---------|
    | Roadmap | libar-docs-executable-specs:path | Points to package tests |
    | Package | libar-docs-roadmap-spec:PatternName | Links back to roadmap |

    Architecture Rules:

    1. Roadmap specs are planning documents, not executable tests
       - Located in delivery-process/specs/{product-area}/
       - Contains deliverables tables and high-level acceptance criteria
       - Has libar-docs-pattern tag for tracking
       - Has high-level Rule blocks (not granular scenarios)
       - Does NOT have step definitions

    2. Package specs are executable implementation tests
       - Located in packages/libar-dev/{package}/tests/features/
       - Has libar-docs-pattern tag linking to roadmap
       - Has step definitions that run via vitest-cucumber
       - Covers edge cases and error scenarios

    3. Traceability is metadata-based, not duplication-based
       - Cross-references via tags eliminate scenario duplication
       - Deliverables table links to specific executable spec files

    4. Completed roadmap specs become minimal tracking records
       - Detailed behavior lives in package specs
       - Roadmap spec becomes lightweight record with links
       - Deliverables table shows all items complete
       - libar-docs-executable-specs points to package tests

    5. Active roadmap specs may have placeholder scenarios
       - During implementation, acceptance criteria guide development
       - These are replaced with links when complete

    @acceptance-criteria
    Scenario: Roadmap spec structure
      Given a pattern requiring implementation
      When creating the roadmap spec
      Then it should be in delivery-process/specs/{product-area}/
      And it should have libar-docs-pattern tag
      And it should have Background with deliverables table
      And it should have high-level Rule blocks (not granular scenarios)
      And it should NOT have step definitions

    @acceptance-criteria
    Scenario: Package spec structure
      Given implemented functionality in a package
      When creating executable specs
      Then they should be in packages/libar-dev/{package}/tests/features/
      And they should have libar-docs-pattern tag linking to roadmap
      And they should have step definitions
      And they should cover edge cases and error scenarios
      And they should run via vitest-cucumber

    @acceptance-criteria
    Scenario: Linking roadmap to package specs
      Given a completed roadmap spec "DeciderPattern"
      And package specs exist at platform-decider/tests/features/
      When adding traceability
      Then roadmap spec should have libar-docs-executable-specs tag
      And deliverables table should include "Executable Spec" column
      And package spec should have libar-docs-roadmap-spec:DeciderPattern

    @acceptance-criteria
    Scenario: Completed pattern roadmap spec
      Given roadmap spec with libar-docs-status:completed
      Then detailed scenarios should NOT be in roadmap spec
      And high-level Rule descriptions should remain
      And deliverables table should have all items "complete"
      And libar-docs-executable-specs should point to package tests

    @acceptance-criteria
    Scenario: Active pattern with acceptance criteria
      Given roadmap spec with libar-docs-status:active
      When defining acceptance criteria
      Then high-level scenarios can exist in roadmap spec
      And they guide implementation (not executable)
      And they are replaced with links when complete

  Rule: Consequences - Trade-offs of two-tier architecture

    Positive outcomes:
    - No duplication, clear ownership, metadata-based traceability
    - Roadmap specs stay lightweight (planning documents)
    - Package specs are authoritative for behavior

    Negative outcomes:
    - Requires discipline to maintain tag relationships
    - Two places to look (mitigated by cross-references)

  # References to existing patterns
  #
  # Roadmap specs: delivery-process/specs/platform/*.feature
  # Package specs:
  #   - platform-fsm/tests/features/behavior/fsm-transitions.feature
  #   - platform-decider/tests/features/behavior/decider-outputs.feature
  #   - platform-bus/tests/features/behavior/idempotency.feature
  #   - platform-core/tests/features/behavior/testing/*.feature
