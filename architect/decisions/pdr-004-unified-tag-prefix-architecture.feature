@architect
@architect-adr:004
@architect-adr-status:accepted
@architect-adr-category:process
@architect-release:v0.1.0
@architect-pattern:UnifiedTagPrefixArchitecture
@architect-status:completed
@architect-completed:2026-01-08
Feature: PDR-004 - Unified Tag Prefix Architecture

  Background: Tag Prefix Unification
    Given the unified tag prefix "@architect-*" is established

  Rule: Context - Two tag prefixes created confusion

    Historical tag prefixes created confusion: libar-docs-* (TypeScript) vs libar-process-* (Gherkin).
    Overlapping tags (pattern, phase, status) had unclear ownership. Two mental models to maintain.

  Rule: Decision - All tags use unified @architect-* prefix

    All tags use unified @architect-* prefix. The libar-process-* prefix is deprecated.
    BDD standard tags (acceptance-criteria, happy-path, etc.) remain unprefixed.

    Key Locations:
    - Repo taxonomy reference: libar-platform/architect/docs/tag-taxonomy.md
    - Package taxonomy source: deps-packages/architect/src/taxonomy/
    - Generated docs: libar-platform/architect/docs/tag-taxonomy.md
    - Regenerate command: pnpm docs:tag-taxonomy

    Tag Categories (repo level):
    domain, ddd, bounded-context, event-sourcing, decider, fsm, cqrs,
    projection, saga, command, arch, infra, validation, testing, performance,
    security, core, api, generator, middleware, correlation

    Unprefixed BDD Tags (remain without prefix):
    acceptance-criteria, happy-path, business-failure, technical-constraint,
    edge-case, validation

    @acceptance-criteria
    Scenario: All metadata uses @architect-* prefix
      Given any documentation or process metadata tag
      When applying the tag to source code or feature files
      Then the tag must use @architect- prefix
      And the file must begin with bare @architect opt-in tag

    @acceptance-criteria
    Scenario: BDD tags remain unprefixed
      Given a Gherkin scenario with tag "acceptance-criteria"
      When the feature file is scanned
      Then the tag is recognized as BDD category tag
      And it is NOT prefixed with @architect-

    @technical-constraint
    Scenario: Scanner accepts deprecated prefix during migration
      Given a feature file with "libar-process-phase:42"
      When the scanner parses the file
      Then it extracts phase number 42
      And logs deprecation warning suggesting "@architect-phase:42"

  Rule: Consequences - Trade-offs of unified tag prefix

    Positive outcomes:
    - Single mental model: "Everything uses @architect-*"
    - Consistent grep/search patterns across codebase
    - Simpler onboarding for contributors

    Negative outcomes:
    - Migration of existing libar-process-* tags (scanner accepts both during transition)
