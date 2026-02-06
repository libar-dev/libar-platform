# ✅ ADR-009: PDR 009 Design Session Methodology

**Purpose:** Architecture decision record for PDR 009 Design Session Methodology

---

## Overview

| Property | Value    |
| -------- | -------- |
| Status   | accepted |
| Category | process  |
| Phase    | 22       |

## Context

Plan-level specs (Gherkin feature files) capture WHAT to build: rules, acceptance criteria,
deliverables. But design sessions also need to produce HOW decisions and interface contracts
that bridge planning to implementation.

    Without a defined methodology:
    - Design documents (markdown) were created that duplicated spec content
    - Code stubs placed in real source folders broke compilation (missing _generated/server)
    - No clear pattern for where design-time artifacts live vs implementation artifacts
    - Architectural decisions scattered across prose documents without structured traceability

## Decision

Design sessions produce two types of outputs:

    | Output | Format | Location | Purpose |
    | Decision specs | Gherkin .feature | delivery-process/decisions/ | Architectural decisions with lasting value |
    | Code stubs | TypeScript .ts | delivery-process/stubs/{pattern-name}/ | Interface contracts, schemas, handler signatures |

    Design sessions do NOT produce:
    | Avoided Output | Why |
    | Design documents (markdown) | Decision specs provide better traceability with structured tags |
    | Implementation code | Design defines contracts; implementation is a separate session |

Code stubs created during design sessions would break compilation and linting if
placed in real source folders:

    | Problem | Example |
    | Missing _generated/server | Convex component handler stubs import from generated code |
    | Unused variables | Handler args in stub bodies trigger eslint |
    | Progressive compilation | Cannot selectively enable parts of stub files |

    Solution: All stubs live in delivery-process/stubs/{pattern-name}/ which is outside
    all package tsconfig and eslint scopes. Zero configuration changes needed.

    Stub rules:
    | Rule | Description |
    | @target comment | Each stub file has a @target JSDoc indicating its real destination path |
    | Pattern-based naming | Folder names use the pattern/feature name, not session numbers |
    | Implementation moves stubs | During implementation, stubs move from stubs/ to @target locations |
    | Step definition stubs | Use existing tests/planning-stubs/ pattern (already excluded from test runner) |

    Naming convention: delivery-process/stubs/{pattern-name-kebab-case}/

    | Correct | Incorrect |
    | agent-component-isolation/ | ds-1-component-isolation/ |
    | agent-handler-architecture/ | ds-2-handler-architecture/ |
    | agent-llm-integration/ | ds-3-llm-integration/ |

    Session numbers (ds-1, ds-2) are ephemeral internal designations. Pattern names
    are stable and meaningful beyond the current planning cycle.

The existing @libar-docs-adr-category values (process, architecture) do not cover
design-session scoped decisions about API shapes, schema strategies, and interface
contracts that are specific to a feature but have lasting reference value.

    Updated category taxonomy:

    | Category | Scope | Examples |
    | process | Delivery methodology | Spec structure, FSM rules, tooling |
    | architecture | System-level technical | Data flow, component boundaries, protocols |
    | design | Design-session scoped | API shape, handler patterns, schema decisions |

    Additional categories (testing, integration) may be added when needed by future
    design sessions.

    Note: ADR/PDR numbering unification is deferred until after the Agent-as-BC
    design sessions complete. New decisions continue from PDR-009+ with appropriate
    category tags.

## Consequences

Positive outcomes: - Stubs never break compilation or linting - Zero tsconfig/eslint configuration changes for design sessions - Decision specs provide structured traceability with tags - Pattern-based naming is stable across planning cycles - @target comments create clear link from design to implementation

    Negative outcomes:
    - Stubs are not type-checked until implementation moves them to target locations
    - Additional step needed during implementation to move stubs
    - Design category adds a third taxonomy value to track

---

[← Back to All Decisions](../DECISIONS.md)
