Feature: ADR Porting to Feature Files
  Port Architecture Decision Records from manual docs to generated documentation.

  **Problem:**
  - 33 ADRs exist in docs/architecture/decisions/ as manual .md files
  - ADRs are disconnected from delivery process
  - Some ADRs may be outdated or superseded by aggregate-less pivot
  - No generated DECISIONS.md artifact for architectural overview

  **Solution:**
  - Review each ADR against new aggregate-less roadmap for validity
  - Convert valid ADRs to .feature files with @libar-docs-decision tag
  - Archive or supersede outdated ADRs with proper annotation
  - Wire docs:adrs generator to monorepo-level commands
  - Generate DECISIONS.md with categorized ADR index

  Background: Deliverables
    Given the following deliverables:
      | Deliverable | Status | Tests | Location | Release |
      | Review ADRs 001-010 against aggregate-less roadmap | Pending | No | docs/architecture/decisions/ | - |
      | Review ADRs 011-020 against aggregate-less roadmap | Pending | No | docs/architecture/decisions/ | - |
      | Review ADRs 021-033 against aggregate-less roadmap | Pending | No | docs/architecture/decisions/ | - |
      | Port valid foundational ADRs (001-005) to feature format | Pending | No | examples/order-management/tests/features/adrs/ | - |
      | Port valid infrastructure ADRs (006-020) to feature format | Pending | No | examples/order-management/tests/features/adrs/ | - |
      | Port valid advanced ADRs (021-033) to feature format | Pending | No | examples/order-management/tests/features/adrs/ | - |
      | Mark superseded ADRs with @libar-process-superseded tag | Pending | No | docs/architecture/decisions/ | - |
      | Wire docs:adrs generator to root package.json | Pending | No | package.json | - |
      | Verify docs:adrs produces DECISIONS.md | Pending | No | docs-living/DECISIONS.md | - |

  @acceptance-criteria
  Scenario: ADRs are accessible through generated docs
    Given ADRs have been reviewed and ported
    When running pnpm docs:adrs
    Then docs-living/DECISIONS.md is generated
    And it categorizes ADRs by domain (event-sourcing, projections, commands, etc.)
    And superseded ADRs are clearly marked

  @acceptance-criteria
  Scenario: ADR validity is assessed against new roadmap
    Given the aggregate-less pivot changes architecture patterns
    When reviewing each ADR
    Then ADRs conflicting with new patterns are marked superseded
    And valid ADRs reference which roadmap phases they support
