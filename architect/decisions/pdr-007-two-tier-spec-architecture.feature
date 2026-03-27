@architect
@architect-adr:007
@architect-adr-status:accepted
@architect-adr-category:process
@architect-pattern:PDR007TwoTierSpecArchitecture
@architect-status:completed
@architect-completed:2026-01-10
@architect-release:v0.2.0
@architect-phase:50
@architect-quarter:Q1-2026
@architect-effort:2h
Feature: PDR-007 Two-Tier Spec Architecture

  Background: Deliverables
    Given the following deliverables:
      | Deliverable | Status | Location |
      | Roadmap specs directory | Complete | libar-platform/architect/specs/ |
      | Package specs directories | Complete | packages/*/tests/features/ |
      | Traceability tag system | Complete | @architect-executable-specs, @architect-roadmap-spec |

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
    | Roadmap | libar-platform/architect/specs/ | Planning, tracking, deliverables | No |
    | Package | packages/*/tests/features/ | Implementation tests | Yes |

    Traceability via Metadata:

    Instead of duplicating scenarios, use @architect-* tags for linking:

    | Spec Type | Tag | Purpose |
    |-----------|-----|---------|
    | Roadmap | @architect-executable-specs:path | Points to package tests |
    | Package | @architect-roadmap-spec:PatternName | Links back to roadmap |

    Architecture Rules:

    1. Roadmap specs are planning documents, not executable tests
       - Located in libar-platform/architect/specs/{product-area}/
       - Contains deliverables tables and high-level acceptance criteria
       - Has @architect-pattern tag for tracking
       - Has high-level Rule blocks (not granular scenarios)
       - Does NOT have step definitions

    2. Package specs are executable implementation tests
       - Located in libar-platform/packages/{package}/tests/features/behavior/
       - Has @architect-pattern tag linking to roadmap
       - Has step definitions that run via vitest-cucumber
       - Covers edge cases and error scenarios

    3. Traceability is metadata-based, not duplication-based
       - Cross-references via tags eliminate scenario duplication
       - Deliverables table links to specific executable spec files

    4. Completed roadmap specs become minimal tracking records
       - Detailed behavior lives in package specs
       - Roadmap spec becomes lightweight record with links
       - Deliverables table shows all items complete
       - @architect-executable-specs points to package tests

    5. Active roadmap specs may have placeholder scenarios
       - During implementation, acceptance criteria guide development
       - These are replaced with links when complete

    @acceptance-criteria
    Scenario: Roadmap spec structure
      Given a pattern requiring implementation
      When creating the roadmap spec
      Then it should be in libar-platform/architect/specs/{product-area}/
      And it should have @architect-pattern tag
      And it should have Background with deliverables table
      And it should have high-level Rule blocks (not granular scenarios)
      And it should NOT have step definitions

    @acceptance-criteria
    Scenario: Package spec structure
      Given implemented functionality in a package
      When creating executable specs
      Then they should be in libar-platform/packages/{package}/tests/features/behavior/
      And they should have @architect-pattern tag linking to roadmap
      And they should have step definitions
      And they should cover edge cases and error scenarios
      And they should run via vitest-cucumber

    @acceptance-criteria
    Scenario: Linking roadmap to package specs
      Given a completed roadmap spec "DeciderPattern"
      And package specs exist at platform-decider/tests/features/
      When adding traceability
      Then roadmap spec should have @architect-executable-specs tag
      And deliverables table should include "Executable Spec" column
      And package spec should have @architect-roadmap-spec:DeciderPattern

    @acceptance-criteria
    Scenario: Completed pattern roadmap spec
      Given roadmap spec with @architect-status:completed
      Then detailed scenarios should NOT be in roadmap spec
      And high-level Rule descriptions should remain
      And deliverables table should have all items "complete"
      And @architect-executable-specs should point to package tests

    @acceptance-criteria
    Scenario: Active pattern with acceptance criteria
      Given roadmap spec with @architect-status:active
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
  # Roadmap specs: libar-platform/architect/specs/platform/*.feature
  # Package specs:
  #   - platform-fsm/tests/features/behavior/fsm-transitions.feature
  #   - platform-decider/tests/features/behavior/decider-outputs.feature
  #   - platform-bus/tests/features/behavior/idempotency.feature
  #   - platform-core/tests/features/behavior/testing/*.feature
