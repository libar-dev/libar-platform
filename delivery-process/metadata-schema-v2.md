# Metadata Schema v2: Relationship Management & Process Projections

**Status:** Draft Proposal
**Date:** 2026-01-08
**Context:** PDR-007 unified tag prefix enables richer metadata

---

## Design Principles

1. **Code = Pattern Graph** (timeless relationships)
2. **Features = Execution State** (temporal process metadata)
3. **Everything is a Projection** (no manually maintained docs)
4. **Progressive Disclosure** (minimal required, rich optional)

---

## Metadata Categories

### Category 1: Pattern Identity (Required)

```typescript
interface PatternIdentity {
  // Required
  pattern: string; // @libar-docs-pattern MyPattern

  // Optional but recommended
  status: PatternStatus; // @libar-docs-status implemented
  core?: boolean; // @libar-docs-core (flag)
  categories: string[]; // @libar-docs-ddd @libar-docs-decider
}

type PatternStatus =
  | "roadmap" // Planned, not started
  | "active" // In progress
  | "partial" // Some implementation exists
  | "implemented" // Code exists, may not be tested
  | "completed"; // Implemented + tested + documented
```

### Category 2: Relationship Graph (Pattern Dependencies)

```typescript
interface PatternRelationships {
  // Basic dependencies (existing)
  uses?: string[]; // @libar-docs-uses PatternA, PatternB
  usedBy?: string[]; // @libar-docs-used-by PatternC

  // Enabling relationships
  dependsOn?: string[]; // @libar-docs-depends-on (hard blocking)
  enables?: string[]; // @libar-docs-enables (what this unlocks)

  // Replacement tracking (ADR flow)
  replaces?: string; // @libar-docs-replaces OldPattern
  replacedBy?: string; // @libar-docs-replaced-by NewPattern

  // NEW: Rationale for dependencies
  // Captured in Gherkin Background tables, not annotations
}
```

**Gherkin Extension for Dependency Rationale:**

```gherkin
Background: Dependency Rationale
  Given the following dependencies:
    | Pattern              | Reason                           | Impact Without          |
    | DeciderFormalization | Preserve transactional atomicity | Race conditions, stale  |
    | ProjectionCategories | Know which projections are views | Can't target reactive   |
```

### Category 3: Process Execution (Temporal State)

```typescript
interface ProcessExecution {
  // Phase tracking
  phase?: number; // @libar-docs-phase 14
  quarter?: string; // @libar-docs-quarter Q1-2026

  // Effort tracking
  effort?: string; // @libar-docs-effort 4h
  effortActual?: string; // @libar-docs-effort-actual 6h

  // Completion
  completed?: string; // @libar-docs-completed 2026-01-08

  // Workflow discipline
  workflow?: Workflow; // @libar-docs-workflow implementation

  // Priority/risk
  priority?: Priority; // @libar-docs-priority high
  risk?: Risk; // @libar-docs-risk medium
  team?: string; // @libar-docs-team platform
}

type Workflow = "planning" | "implementation" | "validation" | "documentation";
type Priority = "critical" | "high" | "medium" | "low";
type Risk = "high" | "medium" | "low";
```

### Category 4: PRD/Requirements (Business Context)

```typescript
interface RequirementsContext {
  productArea?: string; // @libar-docs-product-area Generators
  userRole?: string; // @libar-docs-user-role Developer
  businessValue?: string; // @libar-docs-business-value enables-live-roadmap
  constraint?: string[]; // @libar-docs-constraint requires-convex
}
```

### Category 5: Architecture Decisions (ADR Tracking)

```typescript
interface ArchitectureDecision {
  adr?: string; // @libar-docs-adr 015
  adrStatus?: ADRStatus; // @libar-docs-adr-status accepted
  adrCategory?: string; // @libar-docs-adr-category architecture
  adrSupersedes?: string; // @libar-docs-adr-supersedes 012
  adrSupersededBy?: string; // @libar-docs-adr-superseded-by 020
}

type ADRStatus = "proposed" | "accepted" | "deprecated" | "superseded";
```

### Category 6: Compliance/Governance (Opt-in)

```typescript
interface GovernanceMetadata {
  // Only for high-risk patterns (progressive governance)
  compliance?: string[]; // @libar-docs-compliance PCI-DSS, SOC2
  stakeholder?: string[]; // @libar-docs-stakeholder SecurityTeam
  approvalRequired?: boolean; // @libar-docs-approval-required
}
```

**Gherkin Extension for Risk Tables:**

```gherkin
Background: Risk Mitigation
  Given the following risks are mitigated:
    | Risk               | Severity | Mitigation      | Owner    | Status |
    | Card data breach   | Critical | Tokenization    | Security | ✅     |
    | Transaction replay | High     | Idempotency     | Backend  | ✅     |
```

---

## Computed Relationships (Projection Queries)

These are NOT stored—they're computed from the graph:

```typescript
interface ComputedRelationships {
  // Blocking analysis
  blockedBy: Pattern[]; // Patterns that must complete first
  blocking: Pattern[]; // Patterns waiting on this

  // Critical path
  criticalPath: Phase[]; // Phases to completion
  estimatedCompletion: Date; // Based on effort + dependencies

  // Coverage
  scenarioCount: number; // From .feature files
  testCoverage: number; // Percentage
  hasAcceptanceCriteria: boolean;

  // Traceability
  orphanedScenarios: Scenario[]; // Scenarios without patterns
  untestedPatterns: Pattern[]; // Patterns without scenarios
}
```

---

## Example: Fully Annotated Pattern

### TypeScript Source (Pattern Graph)

```typescript
/**
 * @libar-docs
 */

/**
 * @libar-docs-ddd @libar-docs-projection
 * @libar-docs-pattern ReactiveProjections
 * @libar-docs-status roadmap
 * @libar-docs-phase 17
 * @libar-docs-depends-on ProjectionCategories, DeciderFormalization
 * @libar-docs-enables ProductionHardening, RealTimeViews
 * @libar-docs-brief docs/briefs/reactive-projections.md
 * @libar-docs-risk high
 * @libar-docs-constraint requires-workpool-v2
 *
 * ## Reactive Projections - Hybrid Batch/Realtime Model
 *
 * [Rich markdown documentation...]
 */
```

### Gherkin Feature (Execution State + Rationale)

```gherkin
@libar-docs-pattern:ReactiveProjections
@libar-docs-phase:17
@libar-docs-status:roadmap
@libar-docs-quarter:Q1-2026
@libar-docs-effort:2w
@libar-docs-workflow:implementation
@libar-docs-priority:high
@libar-docs-product-area:Projections
@libar-docs-business-value:sub-second-view-updates-for-user-facing-queries
Feature: Phase 17 - Reactive Projections

  Background: Dependency Rationale
    Given the following dependencies:
      | Pattern              | Reason                           | Impact Without          |
      | ProjectionCategories | Know which projections are views | Can't target reactive   |
      | DeciderFormalization | Preserve transactional atomicity | Race conditions         |

  Background: Deliverables
    Given the following deliverables:
      | Deliverable              | Status | Tests | Location                  |
      | ReactiveProjection type  | 🔲     | 0     | platform-core/projections |
      | Hybrid dispatcher        | 🔲     | 0     | platform-core/projections |
      | View category detection  | 🔲     | 0     | platform-core/projections |

  Background: Risks
    Given the following risks:
      | Risk                 | Severity | Mitigation           | Status |
      | Consistency gaps     | High     | Fallback to batch    | 🔲     |
      | Performance overhead | Medium   | Category filtering   | 🔲     |

  @acceptance-criteria
  Scenario: View projections update reactively
    Given a projection marked as "view" category
    When an event is published
    Then the projection updates within 100ms
    And batch processing is skipped for this projection
```

---

## Projection Outputs (Generated Views)

### 1. Living Roadmap

```bash
pnpm roadmap:query --status active --groupBy quarter
```

### 2. Dependency Graph with Rationale

```bash
pnpm deps:why ReactiveProjections
# Output: Depends on ProjectionCategories because "Know which projections are views"
```

### 3. DoD Validation

```bash
pnpm validate:dod --phase 14
# Checks: deliverables, scenarios, risks, ADRs
```

### 4. Traceability Report

```bash
pnpm trace:coverage
# Patterns without scenarios, scenarios without patterns
```

### 5. Critical Path

```bash
pnpm roadmap:path-to --phase 20
# Phases 15, 16, 17, 18 must complete first (critical path: 9w)
```

---

## Migration from v1

| v1 Tag                 | v2 Tag                | Notes                    |
| ---------------------- | --------------------- | ------------------------ |
| `@libar-process-*`     | `@libar-docs-*`       | Unified prefix (PDR-007) |
| Short-form `@pattern:` | `@libar-docs-pattern` | Full prefix required     |
| Manual dependency docs | Background tables     | Rationale in Gherkin     |

---

## Implementation Phases

### Phase 70: Core Metadata Schema

- Define Zod schemas for all metadata categories
- Scanner support for full metadata extraction
- Cross-source validation (TS ↔ Gherkin consistency)

### Phase 71: Dependency Graph Projections

- Computed blocking/blocked-by relationships
- Critical path analysis
- "Why does X depend on Y?" queries

### Phase 72: DoD Decider

- Machine-checkable Definition of Done
- CI gate for phase completion
- Deliverable/scenario/risk validation

### Phase 73: Live Projections

- Replace generated .md with live queries
- Real-time roadmap views
- Traceability reports on demand
