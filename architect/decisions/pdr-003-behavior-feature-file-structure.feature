@architect
@architect-adr:003
@architect-adr-status:accepted
@architect-adr-category:process
@architect-release:v0.1.0
@architect-pattern:PDR003BehaviorFeatureFileStructure
@architect-phase:46
@architect-status:completed
@architect-unlock-reason:Migrate-to-Rule-keyword-structure
@architect-completed:2026-01-07
@architect-product-area:Process
Feature: PDR-003 - Behavior Feature File Structure

  Background: Deliverables
    Given the following deliverables:
      | Deliverable | Status | Tests | Location |
      | Specs directory convention | Complete | No | PDR-003 |
      | TypeScript phase file convention | Complete | No | PDR-003 |
      | Tag conventions documentation | Complete | No | PDR-003 |
      | Separation of concerns pattern | Complete | No | PDR-003 |
      | Process metadata conventions | Complete | No | libar-platform/architect/docs/tag-taxonomy.md |

  Rule: Context - Timeline feature files created maintenance problems

    The monorepo uses Gherkin feature files for requirements specification and
    behavioral acceptance tests. The original approach used "timeline .feature files"
    with libar-process-* tags for phase/release tracking, but this created problems:

    Problems with timeline .feature files:
    - DataTables for deliverables were hard to maintain
    - Phase/release metadata scattered across many files
    - Specs tightly coupled to specific phases (couldn't evolve independently)
    - Combining or splitting specs required updating process metadata everywhere
    - No centralized view of release contents

  Rule: Decision - Separate specs from release association using two complementary systems

    1. SPECS DIRECTORY (libar-platform/architect/specs/)
       Pure Gherkin requirements that can evolve independently:
       - Focus on WHAT (requirements, acceptance criteria, deliverables)
       - Use semantic tags only (acceptance-criteria, opportunity-N, etc.)
       - NO libar-process-* tags (no phase numbers, no dates, no status)
       - Can be combined, split, or refined without affecting release tracking
       - Background tables list deliverables with Status/Tests/Location (no Release column)

    2. TYPESCRIPT PHASE FILES (libar-platform/architect/src/phases/vX.Y.Z/)
       Centralized release association via code annotations:
       - Focus on WHEN (phase assignment, release association, dependencies)
       - Use @architect-* JSDoc annotations for process metadata
       - Reference specs by pattern name: "Spec: libar-platform/architect/specs/name.feature"
       - Single location for all phase/release information
       - Enables dependency graphs, roadmap generation, earned-value tracking

    SEPARATION OF CONCERNS:
    - Specs answer: "What are we building?" (requirements that evolve)
    - TypeScript phase files answer: "When are we building it?" (release decisions)

    This separation allows:
    - Specs to mature through ideation, refinement, implementation
    - Release planning to happen independently of requirement evolution
    - Easy re-prioritization (just update TypeScript phase files)
    - Centralized roadmap generation from TypeScript annotations

    Tag Conventions for Spec files:
    - acceptance-criteria - Marks scenarios for requirements generation
    - Semantic grouping tags: epic, capstone, opportunity-N, foundation
    - Domain tags: orders, inventory, saga, etc.
    - Scenario tags: happy-path, validation, business-failure

    TypeScript Phase File Annotations (in @architect-* format):

    Core annotations (required):
    - @architect-pattern Name - Pattern identifier
    - @architect-status {roadmap|active|completed} - Phase status
    - @architect-phase N - Phase number
    - @architect-quarter QN-YYYY - Delivery quarter

    Completion annotations:
    - @architect-completed YYYY-MM-DD - Completion date
    - @architect-effort Nw - Planned effort (e.g., 4w, 2d, 8h)
    - @architect-effort-actual Nw - Actual effort (for variance tracking)

    Optional metadata:
    - @architect-workflow {design|implementation|documentation|testing|discovery}
    - @architect-priority {high|medium|low} - Backlog ordering (default: medium)
    - @architect-risk {low|medium|high} - Risk level (default: low)

    Relationship annotations:
    - @architect-depends-on PatternA,PatternB - Dependencies (CSV)
    - @architect-enables PatternC,PatternD - What this enables (CSV)

    Behavior Test Files (tests/features/behavior/):
    Same conventions as before:
    - @architect-pattern:Name - Links to pattern for traceability (optional)
    - acceptance-criteria - Marks scenarios for PRD generation
    - Semantic tags for organization
    - NO Release columns in DataTables

    CRITICAL: No Release References in Spec DataTables.
    Deliverable DataTables in spec files MUST NOT include Release column.
    Only TypeScript phase files may reference releases.
    Rationale: Specs describe WHAT the system does, not WHEN it was released.
    Release coupling prevents specs from evolving independently.

    @acceptance-criteria
    Scenario: Specs and TypeScript phase files are separate
      Given the libar-platform/architect/ directory structure
      Then specs/ contains only pure requirement feature files
      And src/phases/ contains TypeScript files with release annotations
      And specs have NO libar-process-* tags
      And TypeScript files reference specs by pattern name

    @acceptance-criteria
    Scenario: Spec files use semantic tags only
      Given a feature file in libar-platform/architect/specs/
      Then the file should have semantic tags (acceptance-criteria, opportunity-N, etc.)
      And the file should have Background with deliverables DataTable
      And the DataTable should NOT include Release column
      And the file should NOT have libar-process-* tags

    @acceptance-criteria
    Scenario: TypeScript phase files centralize release information
      Given a TypeScript file in libar-platform/architect/src/phases/vX.Y.Z/
      Then the file should have @architect-pattern annotation
      And the file should have @architect-phase annotation
      And the file should have @architect-status annotation
      And the file should reference the spec via comment or matching @architect-pattern metadata

    @acceptance-criteria
    Scenario: Specs can evolve independently of phases
      Given a spec file in libar-platform/architect/specs/
      When the spec is refined, split, or combined
      Then only the TypeScript phase file needs updating
      And no phase/release metadata exists in the spec to update

    @technical-constraint
    Scenario: No release references in spec DataTables
      Given a spec feature file with a DataTable
      When the DataTable includes a Release column
      Then this violates PDR-003 conventions
      And the Release column must be removed
      # Reason: specs describe WHAT not WHEN

  Rule: Consequences - Separated concerns with learning curve trade-off

    Positive outcomes:
    - Specs can evolve independently of release planning
    - Centralized release information in TypeScript files
    - Easy to re-prioritize and re-assign phases
    - TypeScript annotations enable IDE support, type checking
    - Dependency graphs can be computed from code
    - Single source of truth for roadmap generation

    Negative outcomes:
    - Requires maintaining two file types (specs + phase files)
    - Learning curve for new contributors
    - Phase files must manually reference spec files

    @acceptance-criteria
    Scenario: TypeScript phase files support process metadata
      Given a TypeScript file in libar-platform/architect/src/phases/
      Then the file may include @architect-effort for planned effort
      And the file may include @architect-effort-actual for variance tracking
      And the file may include @architect-workflow for time distribution analysis
      And the file may include @architect-priority for backlog ordering
      And the file may include @architect-risk for progressive governance

    @acceptance-criteria
    Scenario: TypeScript phase files support dependency tracking
      Given a TypeScript file in libar-platform/architect/src/phases/
      Then the file may include @architect-depends-on for dependencies
      And the file may include @architect-enables for downstream patterns
      And dependency information enables critical path analysis
