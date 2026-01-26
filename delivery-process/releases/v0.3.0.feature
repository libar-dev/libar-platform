@libar-docs
@libar-docs-pattern:ReleaseV030
@libar-docs-release:v0.3.0
@libar-docs-status:completed
@libar-docs-completed:2026-01-09
@libar-docs-unlock-reason:Correcting status after restoration - was completed before deletion
@libar-docs-quarter:Q1-2026
Feature: v0.3.0 - TypeScript Taxonomy Migration

  Completes the migration from JSON to TypeScript as the source of truth
  for the delivery process taxonomy.

  **Summary:**

  This release formalizes PDR-006 (TypeScript-Sourced Taxonomy), which
  moves taxonomy definitions from JSON files to TypeScript constants
  with compile-time protection.

  **Highlights:**

  - PDR-006: TypeScript-Sourced Taxonomy (accepted, completed)
  - TypeScript `as const` arrays define valid values
  - Zod schemas use constants for runtime validation
  - JSON files become generated artifacts

  **Breaking Changes:**

  None - backward compatible.
