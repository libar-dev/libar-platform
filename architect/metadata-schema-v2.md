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
  pattern: string; // @architect-pattern MyPattern

  // Optional but recommended
  status: PatternStatus; // @architect-status implemented
  core?: boolean; // @architect-core (flag)
  categories: string[]; // @architect-ddd @architect-decider
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
  uses?: string[]; // @architect-uses PatternA, PatternB
  usedBy?: string[]; // @architect-used-by PatternC

  // Enabling relationships
  dependsOn?: string[]; // @architect-depends-on (hard blocking)
  enables?: string[]; // @architect-enables (what this unlocks)

  // Replacement tracking (ADR flow)
  replaces?: string; // @architect-replaces OldPattern
  replacedBy?: string; // @architect-replaced-by NewPattern

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
  phase?: number; // @architect-phase 14
  quarter?: string; // @architect-quarter Q1-2026

  // Effort tracking
  effort?: string; // @architect-effort 4h
  effortActual?: string; // @architect-effort-actual 6h

  // Completion
  completed?: string; // @architect-completed 2026-01-08

  // Workflow discipline
  workflow?: Workflow; // @architect-workflow implementation

  // Priority/risk
  priority?: Priority; // @architect-priority high
  risk?: Risk; // @architect-risk medium
  team?: string; // @architect-team platform
}

type Workflow = "planning" | "implementation" | "validation" | "documentation";
type Priority = "critical" | "high" | "medium" | "low";
type Risk = "high" | "medium" | "low";
```

### Category 4: PRD/Requirements (Business Context)

```typescript
interface RequirementsContext {
  productArea?: string; // @architect-product-area Generators
  userRole?: string; // @architect-user-role Developer
  businessValue?: string; // @architect-business-value enables-live-roadmap
  constraint?: string[]; // @architect-constraint requires-convex
}
```

### Category 5: Architecture Decisions (ADR Tracking)

```typescript
interface ArchitectureDecision {
  adr?: string; // @architect-adr 015
  adrStatus?: ADRStatus; // @architect-adr-status accepted
  adrCategory?: string; // @architect-adr-category architecture
  adrSupersedes?: string; // @architect-adr-supersedes 012
  adrSupersededBy?: string; // @architect-adr-superseded-by 020
}

type ADRStatus = "proposed" | "accepted" | "deprecated" | "superseded";
```

### Category 6: Compliance/Governance (Opt-in)

```typescript
interface GovernanceMetadata {
  // Only for high-risk patterns (progressive governance)
  compliance?: string[]; // @architect-compliance PCI-DSS, SOC2
  stakeholder?: string[]; // @architect-stakeholder SecurityTeam
  approvalRequired?: boolean; // @architect-approval-required
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
 * @architect
 */

/**
 * @architect-ddd @architect-projection
 * @architect-pattern ReactiveProjections
 * @architect-status roadmap
 * @architect-phase 17
 * @architect-depends-on ProjectionCategories, DeciderFormalization
 * @architect-enables ProductionHardening, RealTimeViews
 * @architect-brief docs/briefs/reactive-projections.md
 * @architect-risk high
 * @architect-constraint requires-workpool-v2
 *
 * ## Reactive Projections - Hybrid Batch/Realtime Model
 *
 * [Rich markdown documentation...]
 */
```

### Gherkin Feature (Execution State + Rationale)

```gherkin
@architect-pattern:ReactiveProjections
@architect-phase:17
@architect-status:roadmap
@architect-quarter:Q1-2026
@architect-effort:2w
@architect-workflow:implementation
@architect-priority:high
@architect-product-area:Projections
@architect-business-value:sub-second-view-updates-for-user-facing-queries
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

| v1 Tag                 | v2 Tag               | Notes                    |
| ---------------------- | -------------------- | ------------------------ |
| `@libar-process-*`     | `@architect-*`       | Unified prefix (PDR-007) |
| Short-form `@pattern:` | `@architect-pattern` | Full prefix required     |
| Manual dependency docs | Background tables    | Rationale in Gherkin     |

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
