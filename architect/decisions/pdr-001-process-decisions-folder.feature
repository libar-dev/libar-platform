@architect
@architect-adr:001
@architect-adr-status:accepted
@architect-adr-category:process
@architect-release:v0.1.0
@architect-pattern:PDR001ProcessDecisionsFolder
@architect-status:completed
@architect-completed:2026-01-07
@architect-product-area:Process
Feature: PDR-001 - Process Decisions Live in /libar-platform/architect/decisions/

  Background: Deliverables
    Given the following deliverables:
      | Deliverable | Status | Tests | Location |
      | decisions directory at repo level | Complete | No | libar-platform/architect/decisions/ |
      | PDR-001 feature file | Complete | No | libar-platform/architect/decisions/pdr-001-*.feature |
      | Repo taxonomy reference | Complete | No | libar-platform/architect/docs/tag-taxonomy.md |
      | Repo docs generation config | Complete | No | architect.config.js |

  Rule: Context - Separation of package ADRs from repo PDRs needed

    The monorepo needed a location for process-level decisions (PDRs) separate from
    package-level Architecture Decision Records (ADRs). Package ADRs live in
    deps-packages/architect/architect/decisions/ and document tooling decisions
    specific to the architect package itself.

    Key distinction:
    - ADRs (package): Technical decisions about the architect tool itself
    - PDRs (repo): Process decisions about how to use the tool in this monorepo

    The separation enables:
    - Clear ownership boundaries (package vs repo concerns)
    - Different tag registries for different scopes
    - Independent evolution of package vs repo process decisions

  Rule: Decision - PDRs live in /libar-platform/architect/decisions/ as Gherkin feature files

    Process Decision Records (PDRs) for the monorepo live in /libar-platform/architect/decisions/
    as Gherkin feature files with the naming convention pdr-NNN-name.feature.

    PDRs use the same extraction infrastructure as ADRs:
    - Tags: @architect-adr:NNN
    - Sections: Gherkin Rule: keywords for Context, Decision, Consequences
    - Generator: Uses adr-list section with "Process Decision Records" header

    Directory structure:
    - libar-platform/architect/decisions/ - PDRs for monorepo process configuration
    - libar-platform/architect/specs/ - roadmap feature specs
    - libar-platform/architect/stubs/ - design-session stubs
    - libar-platform/architect/releases/ - release definition files
    - libar-platform/architect/docs/tag-taxonomy.md - generated repo taxonomy reference
    - architect.config.js - repo-level architect configuration

    @acceptance-criteria
    Scenario: PDRs appear in generated DECISIONS.md
      Given a Gherkin feature file with @architect-adr:001 tag
      And the file is in libar-platform/architect/decisions/
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
