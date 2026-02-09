@libar-docs
@libar-docs-adr:004
@libar-docs-adr-status:accepted
@libar-docs-adr-category:process
@libar-docs-release:v0.1.0
@libar-docs-pattern:UnifiedTagPrefixArchitecture
@libar-docs-status:completed
@libar-docs-completed:2026-01-08
Feature: PDR-004 - Unified Tag Prefix Architecture

  Background: Tag Prefix Unification
    Given the unified tag prefix "libar-docs-*" is established

  Rule: Context - Two tag prefixes created confusion

    Two tag prefixes created confusion: libar-docs-* (TypeScript) vs libar-process-* (Gherkin).
    Overlapping tags (pattern, phase, status) had unclear ownership. Two mental models to maintain.

  Rule: Decision - All tags use unified libar-docs-* prefix

    All tags use unified libar-docs-* prefix. The libar-process-* prefix is deprecated.
    BDD standard tags (acceptance-criteria, happy-path, etc.) remain unprefixed.

    Key Locations:
    - Repo taxonomy: delivery-process/tag-registry.json (DDD/ES/CQRS categories)
    - Package taxonomy: packages/libar-dev/delivery-process/tag-registry.json (tooling categories)
    - Generated docs: docs/architecture/TAG_TAXONOMY.md (human-readable reference)
    - Regenerate command: pnpm docs:tag-taxonomy

    Tag Categories (repo level):
    domain, ddd, bounded-context, event-sourcing, decider, fsm, cqrs,
    projection, saga, command, arch, infra, validation, testing, performance,
    security, core, api, generator, middleware, correlation

    Unprefixed BDD Tags (remain without prefix):
    acceptance-criteria, happy-path, business-failure, technical-constraint,
    edge-case, validation

    @acceptance-criteria
    Scenario: All metadata uses libar-docs-* prefix
      Given any documentation or process metadata tag
      When applying the tag to source code or feature files
      Then the tag must use libar-docs- prefix
      And the file must begin with bare libar-docs opt-in tag

    @acceptance-criteria
    Scenario: BDD tags remain unprefixed
      Given a Gherkin scenario with tag "acceptance-criteria"
      When the feature file is scanned
      Then the tag is recognized as BDD category tag
      And it is NOT prefixed with libar-docs-

    @technical-constraint
    Scenario: Scanner accepts deprecated prefix during migration
      Given a feature file with "libar-process-phase:42"
      When the scanner parses the file
      Then it extracts phase number 42
      And logs deprecation warning suggesting "libar-docs-phase:42"

  Rule: Consequences - Trade-offs of unified tag prefix

    Positive outcomes:
    - Single mental model: "Everything uses libar-docs-*"
    - Consistent grep/search patterns across codebase
    - Simpler onboarding for contributors

    Negative outcomes:
    - Migration of existing libar-process-* tags (scanner accepts both during transition)
