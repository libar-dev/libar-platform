# 📋 Themed Decision Architecture

**Purpose:** Detailed documentation for the Themed Decision Architecture pattern

---

## Overview

| Property | Value         |
| -------- | ------------- |
| Status   | planned       |
| Category | Opportunity 1 |
| Phase    | 100           |

## Description

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

## Acceptance Criteria

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

## Business Rules

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

[← Back to Pattern Registry](../PATTERNS.md)
