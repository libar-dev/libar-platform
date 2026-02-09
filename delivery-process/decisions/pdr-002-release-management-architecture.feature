@libar-docs
@libar-docs-adr:002
@libar-docs-adr-status:accepted
@libar-docs-adr-category:process
@libar-docs-release:v0.1.0
@libar-docs-pattern:ReleaseManagementArchitecture
@libar-docs-status:completed
@libar-docs-completed:2026-01-09
@libar-docs-product-area:Process
Feature: PDR-002 - Release Management Architecture

  Background: Implementation Details
    Given the following deliverables:
      | Deliverable | Status | Tests | Location |
      | Add release tag to tag-registry.json | complete | No | delivery-process/tag-registry.json |
      | Update gherkin-ast-parser.ts for @release: | complete | Yes | packages/.../scanner/gherkin-ast-parser.ts |
      | Add release to ExtractedPatternSchema | complete | No | packages/.../validation-schemas/extracted-pattern.ts |
      | Create releases folder structure | complete | No | delivery-process/releases/ |
      | Create v0.1.0.feature | complete | No | delivery-process/releases/v0.1.0.feature |
      | Create vNEXT.feature | complete | No | delivery-process/releases/vNEXT.feature |
      | Tag PDRs 001-004 with release | complete | No | delivery-process/decisions/ |

  Rule: Context - Previous release management approaches created friction

    Previous approaches to release management created friction:

    1. Timeline .feature files (deprecated):
       - DataTables for deliverables were cumbersome to maintain
       - Phases had to be pre-defined but work doesn't follow linear sequences
       - Deliverables naturally belong to releases, not phases
       - Required 15+ metadata tags per file

    2. TypeScript phase files (PDR-002, partially superseded):
       - Still too verbose (~50 lines with embedded markdown)
       - Redundant with release info in other places
       - Tight coupling between phases and releases (1:1 mapping)

    Key insight: We were organizing around phases (internal work units) when
    releases (external versions) are what actually matter. The relationship
    should be: 1 roadmap phase to many releases.

  Rule: Decision - Minimal release management with three components

    Adopt a minimal release management architecture with three components:

    1. Release definition files (delivery-process/releases/*.feature)
       Minimal Gherkin feature files that define releases:
       - One file per release version (v0.1.0.feature, vNEXT.feature)
       - Contains: version, status, quarter, highlights
       - NO DataTables for deliverables (those are discovered, not listed)

    2. Deliverable association via tags (libar-docs-release:v0.1.0)
       Each deliverable declares its target release:
       - PDRs, ADRs, code patterns, feature specs, documentation
       - Easy to change during development
       - Natural workflow (add tag when merging PR)

    3. Generated artifacts (changelog, roadmap, release notes)
       All documentation is derived from scanning:
       - CHANGELOG.md grouped by release version
       - ROADMAP.md from releases with status:planned
       - Release notes from release file + tagged deliverables

    Release Versioning Philosophy:
    Use semantic versioning (semver) as if releases were public:
    - Major: Breaking changes in process/tooling
    - Minor: New capabilities, backward compatible
    - Patch: Fixes, clarifications

    This mental model works for both internal and public releases. For internal
    releases, consider using the -INTERNAL suffix for clarity:
    - v1.0.0-INTERNAL (internal milestone)
    - v1.0.0 (public release)

    Current versioning scheme:
    - v0.1.x: Delivery process setup (current)
    - v1.0.x: Foundational roadmap (completed, pre-delivery-process)
    - v2.0.x: Aggregate-less roadmap (in progress)

    vNEXT Pattern:
    Use libar-docs-release:vNEXT for work in progress not yet assigned
    to a specific version. When cutting a release:
    1. Determine version based on changes (major/minor/patch)
    2. Create new release feature file
    3. Update deliverable tags from vNEXT to new version
    4. Run pnpm docs:all to regenerate

    @acceptance-criteria
    Scenario: Minimal release file structure
      Given a release definition file
      When checking its contents
      Then it contains version, status, and highlights
      And it does NOT contain deliverable DataTables
      And deliverables are discovered by scanning

    @acceptance-criteria
    Scenario: PDR tagged with release version
      Given a Process Decision Record feature file
      When it includes "libar-docs-release:v0.1.0"
      Then the scanner extracts the release field
      And the changelog generator groups it under v0.1.0

    @acceptance-criteria
    Scenario: Changelog generation from scattered tags
      Given multiple files tagged with "libar-docs-release:v0.1.0"
      When running the changelog generator
      Then all tagged deliverables appear under "## v0.1.0"
      And the release file highlights appear as header

  Rule: Consequences - Trade-offs of minimal release management

    Positive outcomes:
    - Minimal ceremony: release files are ~20 lines, deliverables just add one tag
    - Flexible: scope can change during development without restructuring
    - Discoverable: changelog is generated, always up-to-date
    - True to philosophy: Git is the event store, documentation is projection
    - Works for both internal and public releases with same mental model

    Negative outcomes:
    - Requires scanner support for libar-docs-release tag (implemented)
    - Two places to maintain (release file + tag on deliverable)

    Neutral:
    - Phases become optional internal detail, not primary organizer

    Supersedes:
    - PDR-002 original approach (TypeScript phase files) is deprecated by this revision;
      existing files remain until migrated
