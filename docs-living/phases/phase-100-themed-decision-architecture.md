# ThemedDecisionArchitecture

**Purpose:** Detailed patterns for ThemedDecisionArchitecture

---

## Summary

**Progress:** [███████░░░░░░░░░░░░░] 2/6 (33%)

| Status       | Count |
| ------------ | ----- |
| ✅ Completed | 2     |
| 🚧 Active    | 1     |
| 📋 Planned   | 3     |
| **Total**    | 6     |

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

### 📋 Codec Driven Reference Generation

| Property       | Value                                        |
| -------------- | -------------------------------------------- |
| Status         | planned                                      |
| Quarter        | Q1-2026                                      |
| Business Value | eliminate recipe files via codec composition |

**Problem:**
Reference documentation is specified via 11 recipe `.feature` files in
`delivery-process/recipes/`. Each recipe contains a Source Mapping table
(static configuration) and Rule blocks (durable content). But recipes
are configuration masquerading as feature files — no scenarios execute,
no BDD benefit exists. The Source Mapping is static and the Rule blocks
are durable knowledge that belongs in decision records.

**Solution:**
Replace recipe files with a parameterized `ReferenceDocumentCodec` that
composes reference documents from convention-tagged decision records,
TypeScript shape extractions, and behavior spec content. The Source Mapping
becomes a TypeScript config object registered in the existing `GeneratorRegistry`.
Recipe Rule blocks migrate to decision records tagged `@libar-docs-convention`.

**Business Value:**

| Benefit                                | Impact                                              |
| -------------------------------------- | --------------------------------------------------- |
| Eliminate 11 recipe files              | Less surface area, no parallel config format        |
| Reuse existing codec infrastructure    | z.codec(), DetailLevel, CodecBasedGenerator         |
| Convention content in decision records | Durable, queryable, tagged — not trapped in recipes |
| Dual output from single codec          | DetailLevel controls docs/ vs \_claude-md/ output   |
| Codec IS the config                    | No external configuration files to maintain         |

**Architecture:**

| Component                         | Role                                                                | Status             |
| --------------------------------- | ------------------------------------------------------------------- | ------------------ |
| ReferenceDocConfig                | TypeScript config per document type                                 | New                |
| ReferenceDocumentCodec            | Parameterized codec composing from conventions + shapes + behaviors | New                |
| ConventionExtractor               | Filters MasterDataset for convention-tagged decision records        | New                |
| reference-generators registration | Registers each reference doc in GeneratorRegistry                   | New                |
| @libar-docs-convention tag        | CSV tag on decision records                                         | New taxonomy entry |
| Decision record migration         | Recipe Rule blocks → decision records                               | Migration          |

**What Stays, What Goes:**

| Current                                  | After                                          |
| ---------------------------------------- | ---------------------------------------------- |
| 11 recipe .feature files (recipes/)      | Deleted                                        |
| Recipe Source Mapping tables             | ReferenceDocConfig objects in TypeScript       |
| Recipe Rule blocks (durable content)     | Decision records tagged @libar-docs-convention |
| Recipe @libar-docs-claude-md-section tag | ReferenceDocConfig.claudeMdSection field       |
| docs-generated/ staging area             | Direct output to \_claude-md/ and docs/        |
| Manual \_claude-md/ modules              | Generated by codec at summary DetailLevel      |

#### Dependencies

- Depends on: ThemedDecisionArchitecture

#### Acceptance Criteria

**Generate process guard reference at standard detail level**

- Given a ReferenceDocConfig for "Process Guard"
- And convention-tagged decision records exist for "fsm-rules"
- And TypeScript shapes are extracted from "src/lint/\*.ts"
- When the reference codec decodes the MasterDataset
- Then a RenderableDocument is produced with Process Guard content
- And sections include convention content, API types, and validation rules

**Generate process guard reference at summary detail level**

- Given a ReferenceDocConfig for "Process Guard" with detailLevel "summary"
- When the reference codec decodes the MasterDataset
- Then the output uses tables over prose
- And type names are listed without full definitions
- And no duplicate sections appear
- And output is under 100 lines

**Extract conventions by tag value**

- Given ADR-006 is tagged with "@libar-docs-convention:fsm-rules"
- And ADR-004 is tagged with "@libar-docs-convention:testing-policy"
- When extracting conventions for "fsm-rules"
- Then only ADR-006 Rule block content is returned
- And ADR-004 content is not included

**Convention content preserves Rule block structure**

- Given a decision record with Rule blocks containing tables and context
- When extracting convention content
- Then tables are preserved as structured data
- And Invariant/Rationale/Verified-by metadata is preserved

**Dual output generation**

- Given a ReferenceDocConfig with claudeMdSection "validation"
- When the reference generator runs
- Then "docs/PROCESS-GUARD-REFERENCE.md" is generated at "detailed" level
- And "\_claude-md/validation/process-guard.md" is generated at "summary" level

**Summary compaction quality**

- Given a reference codec output at "summary" detail level
- Then the output follows modular-claude-md conventions
- And headings start at H3 level
- And tables are preferred over prose
- And total output is under 100 lines

**Reference generators appear in available generators list**

- Given reference generators are registered
- When querying GeneratorRegistry.available()
- Then "process-guard-reference" is listed
- And "session-guides-reference" is listed
- And all 11 reference types are available

**CLI invocation generates reference docs**

- Given the generate-docs CLI
- When running with "--generators process-guard-reference"
- Then dual output is produced for process guard

**Convention tag is registered in taxonomy**

- Given the tag registry
- When checking for "@libar-docs-convention"
- Then it exists with format "csv"
- And it accepts the defined convention values

#### Business Rules

**Reference documents are generated by a parameterized codec**

**Invariant:** Each reference document type is a configuration object, not a
separate codec class. One `createReferenceCodec(config)` factory serves all
11 document types.

    **Rationale:** 11 separate codec classes would just be reimplementing recipes
    in TypeScript. A parameterized codec keeps the configuration declarative
    while the composition logic is shared.

_Verified by: Generate process guard reference at standard detail level, Generate process guard reference at summary detail level_

**Convention content is extracted from tagged decision records**

**Invariant:** Decision records tagged with `@libar-docs-convention` are the
source of truth for durable reference content. The extractor filters by
convention tag value and extracts Rule block content.

    **Rationale:** Recipe Rule blocks contain durable knowledge (tables, context,
    rationale) that belongs in decision records — permanent, queryable, tagged.
    Decision records are already extracted as patterns in MasterDataset.

_Verified by: Extract conventions by tag value, Convention content preserves Rule block structure_

**Each reference codec produces dual output via DetailLevel**

**Invariant:** A single ReferenceDocConfig drives both the detailed human
reference (docs/) and the compact AI context (\_claude-md/). The codec
factory is invoked twice with different DetailLevel values.

    **Rationale:** The recipe system declared dual targets in its Target Documents
    table. The codec approach achieves the same by running the same codec with
    different options. No separate configuration needed.

    **Verified by:** Dual output generation, Summary compaction quality

_Verified by: Dual output generation, Summary compaction quality_

**Reference generators are discovered via the existing registry**

**Invariant:** Reference generators register themselves in the GeneratorRegistry
using the existing CodecBasedGenerator adapter. No new generator infrastructure
is needed.

    **Rationale:** The existing 19 registered generators use the same pattern.
    Reference generators are just additional registrations.

_Verified by: Reference generators appear in available generators list, CLI invocation generates reference docs_

**Convention tag values classify decision records by topic**

**Invariant:** The `@libar-docs-convention` tag uses CSV format with defined
values. Each value maps to a knowledge domain that reference codecs consume.

    **Rationale:** Convention tags are orthogonal to existing `@libar-docs-adr-category`
    (which is too coarse — "process" covers both testing policy and FSM rules).

    | Value | Knowledge Domain | Reference Docs That Consume |
    | --- | --- | --- |
    | testing-policy | Test safety, Gherkin-only policy | GherkinPatternsReference, ValidationReference |
    | fsm-rules | FSM transitions, protection levels | ProcessGuardReference, SessionGuidesReference |
    | cli-patterns | CLI conventions, arg parsing | InstructionsReference, ConfigurationReference |
    | output-format | Text vs markdown, codec patterns | ArchitectureReference |
    | pattern-naming | Pattern identifiers, @implements | InstructionsReference, MethodologyReference |
    | session-workflow | Session types, handoff, stubs | SessionGuidesReference, MethodologyReference |
    | config-presets | Presets, tag prefixes, RegexBuilders | ConfigurationReference |
    | annotation-system | Tag formats, dual-source, opt-in | InstructionsReference, TaxonomyReference |
    | pipeline-architecture | Four-stage pipeline, codecs, MasterDataset | ArchitectureReference |
    | publishing | Publishing strategy, versioning | PublishingReference |
    | doc-generation | Recipes, generators, dual output | IndexReference |

_Verified by: Convention tag is registered in taxonomy_

---

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

### ✅ Repo Level Docs Generation

| Property       | Value                                        |
| -------------- | -------------------------------------------- |
| Status         | completed                                    |
| Effort         | 4h                                           |
| Quarter        | Q1-2026                                      |
| Business Value | enable multi source documentation generation |

As a monorepo maintainer, I want unified documentation generation from multiple sources.

So that specs, platform packages, and example app produce coherent documentation.

The PoC validated multi-source generation with combined Gherkin feature sources
and established tag conventions for PRD extraction, roadmap planning, and timeline
metadata. See session learnings documented in the Gherkin comments below.

#### Dependencies

- Depends on: ProcessMetadataExpansion

#### Acceptance Criteria

**Generate PRD from specs**

- Given feature files in delivery-process/specs/ with PRD tags
- When running pnpm docs:prd
- Then PRODUCT-REQUIREMENTS.md is generated in docs-living/
- And features are grouped by product area
- And acceptance criteria are extracted from @acceptance-criteria scenarios

**Generate remaining work summary**

- Given feature files with deliverables in Background section
- When running pnpm docs:prd:remaining
- Then REMAINING-WORK.md shows statistics, incomplete items, next actionable phases

**Generate implementation plans**

- Given feature files with acceptance criteria and deliverables
- When running pnpm docs:prd:plan
- Then SESSION-PLAN.md shows structured implementation guidance
- And each planned phase has pre-planning checklist
- And deliverables are listed with locations

**All generation scripts complete successfully**

- Given properly tagged spec files
- When running pnpm docs:prd:all
- Then all generators complete without errors
- And generated files are formatted with prettier

---

[← Back to Roadmap](../ROADMAP.md)
