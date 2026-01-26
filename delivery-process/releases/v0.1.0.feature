@libar-docs-release:v0.1.0
@libar-docs-status:active
@libar-docs-quarter:Q1-2026
Feature: v0.1.0 - Delivery Process Foundation

  Initial release establishing the software delivery process
  for the @libar-dev platform monorepo.

  **Summary:**

  This release formalizes how we track work, make decisions, and
  generate documentation from code. It introduces the delivery-process
  package and establishes PDR (Process Decision Record) conventions.

  **Highlights:**

  - PDR-001: Process decisions folder structure
  - PDR-002: TypeScript release association metadata
  - PDR-003: Behavior feature file structure
  - PDR-004: Unified tag prefix architecture (@libar-docs-*)
  - PDR-005: Release management architecture (this release!)
  - Scanner, extractor, generator pipeline complete
  - Gherkin-only testing policy established
  - Release management infrastructure

  **Breaking Changes:**

  None (initial process setup release)

  **Migration Notes:**

  The @libar-process-* tag prefix is deprecated in favor of the
  unified @libar-docs-* prefix per PDR-004. The scanner accepts
  both during migration and logs warnings for deprecated usage.
