@libar-docs
@libar-docs-pattern:ReleaseV020
@libar-docs-release:v0.2.0
@libar-docs-status:active
@libar-docs-unlock-reason:Restoring-file-deleted-during-package-extraction
@libar-docs-quarter:Q1-2026
@libar-docs-phase:release
@libar-docs-depends-on:v0.1.0
Feature: v0.2.0 - Platform Roadmap (Aggregate-Less Pivot)

  Converts the aggregate-less pivot roadmap into executable specs for Phases 14-22.

  Establishes Phases 14-22 as the development path for the
  libar-dev platform infrastructure.

  **Summary:**

  This release formalizes the "Third Way" - Convex-native event sourcing
  that is neither traditional OOP aggregates nor Kafka-style streaming.
  The aggregate-less pivot thesis: "We are already aggregate-less."
  The CMS dual-write pattern eliminates rehydration entirely.

  **Highlights:**

  - Phase 14 (Decider Pattern) marked as complete
  - Phase 15-22 specs defined from pattern briefs
  - Session context module added to CLAUDE.md
  - DELIVERY-PROCESS-GUIDE.md reference document
  - Single "Platform" product area established

  **Phase Overview:**

  | Phase | Pattern | Status |
  |-------|---------|--------|
  | 14 | Decider Pattern | completed |
  | 15 | Projection Categories | roadmap |
  | 16 | Dynamic Consistency Boundaries | completed |
  | 17 | Reactive Projections | roadmap |
  | 18 | Production Hardening | roadmap |
  | 19 | BDD Testing Infrastructure | active |
  | 20 | ECST/Fat Events, Reservation Pattern | roadmap |
  | 21 | Integration Patterns | roadmap |
  | 22 | Agent as Bounded Context | roadmap |

  **Breaking Changes:**

  None (additive release for platform roadmap)

  **Migration Notes:**

  Pattern briefs in `docs/project-management/aggregate-less-pivot/pattern-briefs/`
  are now superseded by executable specs in `delivery-process/specs/platform/`.
  The pattern briefs remain as historical reference.
