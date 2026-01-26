# ThemedDecisionArchitecture

**Purpose:** Detailed patterns for ThemedDecisionArchitecture

---

## Summary

**Progress:** [█████░░░░░░░░░░░░░░░] 1/4 (25%)

| Status       | Count |
| ------------ | ----- |
| ✅ Completed | 1     |
| 🚧 Active    | 1     |
| 📋 Planned   | 2     |
| **Total**    | 4     |

---

## 🚧 Active Patterns

### 🚧 Process Enhancements

| Property       | Value                                   |
| -------------- | --------------------------------------- |
| Status         | active                                  |
| Effort         | 4w                                      |
| Quarter        | Q1-2026                                 |
| Business Value | unify process enhancement opportunities |

**Vision:** Transform the delivery process from a documentation tool into a delivery operating system.

Enable code-driven, multi-workflow documentation where code + .feature
files are authoritative sources, and all artifacts are generated projections.

**Problem:** Current delivery process capabilities are limited to document generation.
The convergence roadmap identified 8 opportunities: Process Views as Projections,
DoD as Machine-Checkable, Earned-Value Tracking, Requirements-Tests Traceability,
Architecture Change Control, Progressive Governance, and Living Roadmap.

**Solution:** Incrementally implement convergence opportunities, starting with foundation
work (metadata tags) and progressing to validators, generators, and eventually
Convex-native live projections.

**Strategic Direction:**

- Package (@libar-dev/delivery-process): Document generation capabilities
- Monorepo: Eventually leverage Convex projections for live queryable views

**Architecture Decision (PDR-002):**
Specs (this file) capture requirements that can evolve independently.
TypeScript phase files link deliverables to phases/releases centrally.
This separation enables specs to be combined, split, or refined without
affecting release association.

See: deps/libar-dev-packages/packages/tooling/delivery-process/docs/ideation-convergence/

#### Acceptance Criteria

**Specs can evolve independently of phases**

- Given a spec file in delivery-process/specs/
- When the spec is refined, split, or combined
- Then TypeScript phase files maintain release association
- And no phase metadata needs updating in the spec

**TypeScript phase files link specs to releases**

- Given a TypeScript phase file in delivery-process/src/phases/
- Then it references the spec by pattern name
- And contains minimal metadata (phase, status, quarter, effort)
- And centralized location enables consistent release tracking

---

## 📋 Planned Patterns

### 📋 Test Content Blocks

| Property       | Value                        |
| -------------- | ---------------------------- |
| Status         | planned                      |
| Business Value | test what generators capture |

This feature demonstrates what content blocks are captured and rendered
by the PRD generator. Use this as a reference for writing rich specs.

**Overview**

The delivery process supports **rich Markdown** in descriptions:

- Bullet points work
- _Italics_ and **bold** work
- `inline code` works

**Custom Section**

You can create any section you want using bold headers.
This content will appear in the PRD Description section.

#### Acceptance Criteria

**Scenario with DocString for rich content**

- Given a system in initial state
- When the user provides the following configuration:
- Then the system accepts the configuration

```markdown
**Configuration Details**

This DocString contains **rich Markdown content** that will be
rendered in the Acceptance Criteria section.

- Option A: enabled
- Option B: disabled

Use DocStrings when you need multi-line content blocks.
```

**Scenario with DataTable for structured data**

- Given the following user permissions:
- When the user attempts an action
- Then access is granted based on permissions

| Permission | Level    | Description             |
| ---------- | -------- | ----------------------- |
| read       | basic    | Can view resources      |
| write      | elevated | Can modify resources    |
| admin      | full     | Can manage all settings |

**Simple scenario under second rule**

- Given a precondition
- When an action occurs
- Then the expected outcome happens

**Scenario with examples table**

- Given a value of <input>
- When processed
- Then the result is <output>

#### Business Rules

**Business rules appear as a separate section**

Rule descriptions provide context for why this business rule exists.
You can include multiple paragraphs here.

    This is a second paragraph explaining edge cases or exceptions.

_Verified by: Scenario with DocString for rich content, Scenario with DataTable for structured data_

**Multiple rules create multiple Business Rule entries**

Each Rule keyword creates a separate entry in the Business Rules section.
This helps organize complex features into logical business domains.

_Verified by: Simple scenario under second rule, Scenario with examples table_

---

### 📋 Themed Decision Architecture

| Property | Value   |
| -------- | ------- |
| Status   | planned |

Decisions (ADRs, PDRs) should not be "dumped into same folder" when generated.
The synthesis of 33 active ADRs revealed natural themes and dependencies that
should be preserved in generated documentation.

**Context:**
Current state: Decisions are listed chronologically or alphabetically in flat files.
This loses the rich structure that exists in the codebase:

- Theme groupings (Persistence, Isolation, Commands, etc.)
- Dependency relationships (ADR-001 enables ADR-002, ADR-003, ADR-005)
- Evolutionary layers (Foundation → Infrastructure → Refinement)

**Vision:**
Generate themed decision documents that reflect the conceptual architecture,
not just the chronological order of creation. Include dependency graphs
that show how decisions build upon each other.

**Scope:**

1. Add theme/category tagging to decisions (`@libar-docs-adr-theme:persistence`)
2. Generate grouped decision documents per theme
3. Generate dependency graph visualization (ASCII or Mermaid)
4. Port existing 33 ADRs to delivery-process format (with validity review)

#### Acceptance Criteria

**Generate themed decision document**

- Given decisions tagged with "@libar-docs-adr-theme:persistence"
- When running the themed-decisions generator
- Then output file "docs-living/decisions/PERSISTENCE.md" is created
- And it contains ADRs 001, 002, 010, 011 grouped together
- And the theme description appears as header

**Theme tag in decision file**

- Given an ADR feature file
- When adding theme classification
- Then it includes "@libar-docs-adr-theme:<theme-name>"
- And theme-name is one of: persistence, isolation, commands, projections, coordination, taxonomy, testing

**ADR with dependency declaration**

- Given ADR-016 (Checkpoint) depends on ADR-002 (Event Store)
- When the ADR file includes "@libar-docs-depends-on:002"
- Then the dependency graph shows ADR-002 → ADR-016

**Generate dependency graph**

- Given all ADRs are tagged with their dependencies
- When running the dependency-graph generator
- Then output includes ASCII or Mermaid diagram
- And the diagram shows the dependency tree:

```markdown
ADR-001 (Dual-Write)
├── ADR-002 (Event Store)
│ └── ADR-016 (Checkpoint)
│ └── ADR-015 (Workpool)
│ └── ADR-018 (Partitioning)
├── ADR-003 (Command Bus)
│ └── ADR-017 (Idempotency)
│ └── ADR-021 (Orchestrator)
└── ADR-005 (BC as Component)
└── ADR-023 (Proj at App)
```

**Layer information in generated docs**

- Given a themed decision document
- When it renders ADR entries
- Then each entry shows its layer badge (Foundation/Infrastructure/Refinement)
- And the layer provides context for the decision's maturity

**Port ADR from old format to feature file**

- Given an existing ADR in "docs/architecture/decisions/adr-001-\*.md"
- When migrating to delivery-process format
- Then create "deps/libar-dev-packages/packages/tooling/delivery-process/tests/features/decisions/adr-001-\*.feature"
- And include original decision content in Gherkin format
- And add theme, layer, and dependency tags
- And mark status (active, superseded, deprecated)

**Review for validity during migration**

- Given an ADR being migrated
- When the content is reviewed
- Then check if decision is still accurate
- And check if it has been superseded by newer decisions
- And check if implementation matches the decision
- And update status accordingly

**Generate all decision artifacts**

- Given all decisions are tagged with theme, layer, and dependencies
- When running "pnpm docs:decisions"
- Then the following are generated:

| Artifact                              | Content                        |
| ------------------------------------- | ------------------------------ |
| docs-living/decisions/INDEX.md        | Master index with all ADRs     |
| docs-living/decisions/PERSISTENCE.md  | Persistence theme decisions    |
| docs-living/decisions/ISOLATION.md    | Isolation theme decisions      |
| docs-living/decisions/COMMANDS.md     | Commands theme decisions       |
| docs-living/decisions/PROJECTIONS.md  | Projections theme decisions    |
| docs-living/decisions/COORDINATION.md | Coordination theme decisions   |
| docs-living/decisions/TAXONOMY.md     | Taxonomy theme decisions       |
| docs-living/decisions/TESTING.md      | Testing theme decisions        |
| docs-living/decisions/DEPENDENCY.md   | Dependency graph visualization |

#### Business Rules

**Decisions are grouped by theme**

The 7 themes identified during codebase synthesis:

    | Theme        | Core ADRs               | Key Decision                          |
    | Persistence  | 001, 002, 010, 011      | Dual-write, no snapshots, lazy upcast |
    | Isolation    | 005, 023, 028, 032      | BC as components, projections at app  |
    | Commands     | 003, 017, 021, 030      | Orchestrator, idempotency, categories |
    | Projections  | 004, 006, 015, 016, 018 | Workpool, checkpoints, partitioning   |
    | Coordination | 009, 020, 025, 033      | Saga vs PM distinction                |
    | Taxonomy     | 029, 030                | Event types, command categories       |
    | Testing      | 013, 022, 031           | BDD, inverted pyramid, namespace      |

_Verified by: Generate themed decision document, Theme tag in decision file_

**Decisions declare dependencies**

_Verified by: ADR with dependency declaration, Generate dependency graph_

**Decisions are layered by evolution phase**

The 33 ADRs fall into 3 evolutionary layers:

    | Layer          | ADR Range | Count | Description                    |
    | Foundation     | 001-010   | 10    | Core patterns, first decisions |
    | Infrastructure | 011-020   | 10    | Supporting infrastructure      |
    | Refinement     | 021-033   | 13    | Optimizations, clarifications  |

_Verified by: Layer information in generated docs_

**Existing ADRs are migrated with review**

_Verified by: Port ADR from old format to feature file, Review for validity during migration_

**Multiple output formats are generated**

_Verified by: Generate all decision artifacts_

---

## ✅ Completed Patterns

### ✅ Process Metadata Expansion

| Property       | Value                                   |
| -------------- | --------------------------------------- |
| Status         | completed                               |
| Effort         | 2h                                      |
| Quarter        | Q1-2026                                 |
| Business Value | enable variance and governance tracking |

**Problem:**
The monorepo's delivery process lacked metadata tags for variance tracking, governance, and hierarchical views.
Missing tag categories included:

- Variance tracking (planned vs actual effort)
- Progressive governance (risk-based filtering)
- Backlog ordering (priority)
- Time distribution analysis (workflow types)
- Hierarchical roadmap views (epic→phase→task)

Without these tags, opportunities 2-8 from the convergence roadmap could not
be implemented. The tag registry needed expansion to enable future capabilities.

**Solution:**
Added 6 new metadata tags to delivery-process/tag-registry.json:

- @libar-process-risk:{low|medium|high} - Progressive governance (Opp 6)
- @libar-process-effort-actual:Nw - Variance tracking (Opp 3)
- @libar-process-workflow:{design|impl|docs|testing|discovery} - Time distribution
- @libar-process-priority:{high|medium|low} - Backlog ordering
- @libar-process-level:{epic|phase|task} - Hierarchy support (Opp 8)
- @libar-process-parent:PatternName - Hierarchy linking (Opp 8)

Updated PDR-003 with new tag conventions and acceptance criteria.

This work is foundation for Setup A (Framework Roadmap OS) from convergence docs.

#### Acceptance Criteria

**New tags are defined in tag registry**

- Given the delivery-process/tag-registry.json file
- Then it should contain metadataTags for risk, effort-actual, workflow, priority, level, parent
- And each tag should have format, purpose, and example fields
- And enum tags should have values and default fields

**PDR-003 documents new tag conventions**

- Given the PDR-003 decision file
- Then it should document process metadata tags section
- And it should document hierarchy tags section

**Tags enable filtering in generated docs**

- Given TypeScript phase files with new metadata tags
- When generating roadmap documentation
- Then patterns can be filtered by risk, priority, workflow
- And hierarchy relationships are rendered

---

[← Back to Roadmap](../ROADMAP.md)
