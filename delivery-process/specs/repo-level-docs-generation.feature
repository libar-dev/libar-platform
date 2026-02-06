@libar-docs-release:vNEXT
@process-enhancements
@foundation
@libar-docs-pattern:RepoLevelDocsGeneration
@libar-docs-status:completed
@libar-docs-unlock-reason:Path-update-after-submodule-migration-PR-120
@libar-docs-phase:100
@libar-docs-quarter:Q1-2026
@libar-docs-effort:4h
@libar-docs-effort-actual:4h
@libar-docs-depends-on:ProcessMetadataExpansion
@libar-docs-product-area:DeliveryProcess
@libar-docs-business-value:enable-multi-source-documentation-generation
@libar-docs-priority:high
Feature: Repo-Level Documentation Generation

  As a monorepo maintainer, I want unified documentation generation from multiple sources.

  So that specs, platform packages, and example app produce coherent documentation.

  The PoC validated multi-source generation with combined Gherkin feature sources
  and established tag conventions for PRD extraction, roadmap planning, and timeline
  metadata. See session learnings documented in the Gherkin comments below.

  # Tag Requirements Discovery:
  # - Minimum: @pattern:Name + @status:roadmap|active|completed
  # - PRD grouping: @product-area:Name, @business-value:desc, @priority:level
  # - Timeline: @phase:N, @effort:Nd, @quarter:QN-YYYY
  # - Dependencies: @depends-on:Name, @enables:Name
  # - Variance: @effort-actual:Nd, @completed:YYYY-MM-DD

  # Multi-source CLI pattern: --features 'src1/*.feature' --features 'src2/**/*.feature'

  Background: Deliverables
    Given the following deliverables:
      | Deliverable | Status | Tests | Location |
      | docs:prd script | Complete | No | package.json |
      | docs:prd:roadmap script | Complete | No | package.json |
      | docs:prd:remaining script | Complete | No | package.json |
      | docs:prd:current script | Complete | No | package.json |
      | docs:prd:milestones script | Complete | No | package.json |
      | docs:prd:session script | Complete | No | package.json |
      | docs:prd:plan script | Complete | No | package.json |
      | docs:prd:checklist script | Complete | No | package.json |
      | docs:prd:all script | Complete | No | package.json |
      | PRD tags added to all specs | Complete | No | delivery-process/specs/*.feature |
      | Platform-core behavior tests annotated | Complete | No | deps/libar-dev-packages/packages/platform/core/tests/features/behavior/testing/*.feature |
      | Multi-source generation validated | Complete | No | package.json docs:prd script |
      | Session learnings documented | Complete | No | This file |
      | Full scope spec for repo docs | Complete | No | This file |

  @acceptance-criteria
  Scenario: Generate PRD from specs
    Given feature files in delivery-process/specs/ with PRD tags
    When running pnpm docs:prd
    Then PRODUCT-REQUIREMENTS.md is generated in docs-living/
    And features are grouped by product area
    And acceptance criteria are extracted from @acceptance-criteria scenarios

  @acceptance-criteria
  Scenario: Generate remaining work summary
    Given feature files with deliverables in Background section
    When running pnpm docs:prd:remaining
    Then REMAINING-WORK.md shows statistics, incomplete items, next actionable phases

  @acceptance-criteria
  Scenario: Generate implementation plans
    Given feature files with acceptance criteria and deliverables
    When running pnpm docs:prd:plan
    Then SESSION-PLAN.md shows structured implementation guidance
    And each planned phase has pre-planning checklist
    And deliverables are listed with locations

  @acceptance-criteria
  Scenario: All generation scripts complete successfully
    Given properly tagged spec files
    When running pnpm docs:prd:all
    Then all generators complete without errors
    And generated files are formatted with prettier
