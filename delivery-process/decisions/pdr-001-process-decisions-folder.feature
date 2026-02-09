@libar-docs
@libar-docs-adr:001
@libar-docs-adr-status:accepted
@libar-docs-adr-category:process
@libar-docs-release:v0.1.0
@libar-docs-pattern:PDR001ProcessDecisionsFolder
@libar-docs-status:completed
@libar-docs-completed:2026-01-07
@libar-docs-product-area:Process
Feature: PDR-001 - Process Decisions Live in /delivery-process/decisions/

  Background: Deliverables
    Given the following deliverables:
      | Deliverable | Status | Tests | Location |
      | decisions directory at repo level | Complete | No | delivery-process/decisions/ |
      | PDR-001 feature file | Complete | No | delivery-process/decisions/pdr-001-*.feature |
      | Repo-level tag-registry.json | Complete | No | delivery-process/tag-registry.json |
      | PDR generator config | Complete | No | delivery-process/generators/decisions/pdrs.json |

  Rule: Context - Separation of package ADRs from repo PDRs needed

    The monorepo needed a location for process-level decisions (PDRs) separate from
    package-level Architecture Decision Records (ADRs). Package ADRs live in
    packages/libar-dev/delivery-process/tests/features/decisions/ and document
    tooling decisions specific to the delivery-process package itself.

    Key distinction:
    - ADRs (package): Technical decisions about the delivery-process tool itself
    - PDRs (repo): Process decisions about how to use the tool in this monorepo

    The separation enables:
    - Clear ownership boundaries (package vs repo concerns)
    - Different tag registries for different scopes
    - Independent evolution of package vs repo process decisions

  Rule: Decision - PDRs live in /delivery-process/decisions/ as Gherkin feature files

    Process Decision Records (PDRs) for the monorepo live in /delivery-process/decisions/
    as Gherkin feature files with the naming convention pdr-NNN-name.feature.

    PDRs use the same extraction infrastructure as ADRs:
    - Tags: libar-process-adr:NNN (reuses existing tag system for compatibility)
    - Sections: Gherkin Rule: keywords for Context, Decision, Consequences
    - Generator: Uses adr-list section with "Process Decision Records" header

    Directory structure:
    - delivery-process/decisions/ - PDRs for monorepo process configuration
    - delivery-process/src/phases/ - TypeScript phase metadata
    - delivery-process/generators/decisions/ - PDR generator configs
    - delivery-process/templates/ - Reusable templates
    - delivery-process/fragments/ - Fragment templates
    - delivery-process/tag-registry.json - Repo-level tag registry

    @acceptance-criteria
    Scenario: PDRs appear in generated DECISIONS.md
      Given a Gherkin feature file with libar-process-adr:001 tag
      And the file is in delivery-process/decisions/
      When running pnpm docs:pdrs
      Then the decision appears in docs-living/DECISIONS.md
      And the header shows "Process Decision Records" (not "Architecture Decision Records")

    @acceptance-criteria
    Scenario: PDR numbering is independent from package ADRs
      Given package-level ADRs numbered ADR-001 through ADR-004
      And repo-level PDRs numbered PDR-001 through PDR-003
      Then there is no conflict in numbering
      And each scope maintains its own sequence

  Rule: Consequences - Trade-offs of the PDR location decision

    Positive outcomes:
    - Clear separation between package ADRs and repo PDRs
    - Reuses existing ADR extraction infrastructure without code changes
    - Gherkin format enables executable acceptance criteria
    - Consistent with package-level ADR approach
    - Independent tag registry allows repo-specific categories

    Negative outcomes:
    - Two separate registries to maintain (package vs repo)
    - "adr" tag name used internally for "pdr" (display-only rename)
