# ✅ ADR-010: PDR 010 Cross Component Argument Injection

**Purpose:** Architecture decision record for PDR 010 Cross Component Argument Injection

---

## Overview

| Property | Value        |
| -------- | ------------ |
| Status   | accepted     |
| Category | architecture |
| Phase    | 22           |

## Context

Convex components have isolated databases. A component's handlers can only access
tables defined in that component's schema. This is by design — it enforces bounded
context isolation at the infrastructure level.

    When a component needs data from outside its boundary (e.g., an app-level projection
    or another component's data), it cannot query that data directly:

    | Constraint | Implication |
    | Isolated databases | Component handlers cannot ctx.db.query app-level tables |
    | No cross-component joins | Cannot combine component data with app data in a single query |
    | API boundary only | All cross-component data access goes through handler arguments or return values |

    This creates a challenge: How does a component receive data it needs from outside
    its boundary without violating isolation?

    Alternatives considered:

    | Option | Pros | Cons |
    | A: Argument injection (chosen) | Caller controls data loading; component stays pure; no coupling | Caller must know what data to load; additional handler args |
    | B: Callback pattern | Component requests data via callback | Complex; breaks transactional guarantees; component aware of external schema |
    | C: Duplicate data into component | Fast reads; no cross-boundary queries | Redundant storage; consistency risk; event subscription needed |
    | D: Shared database layer | Simplest queries | Violates BC isolation; defeats purpose of components |

## Decision

When a component handler needs data from outside its boundary, the app-level caller
loads that data and passes it as an argument to the handler.

    The pattern:

    | Step | Actor | Action |
    | 1 | App-level code | Queries app-level projection or other component |
    | 2 | App-level code | Shapes data into typed container |
    | 3 | App-level code | Passes container as argument to component handler |
    | 4 | Component handler | Receives pre-loaded data; processes without external queries |

    Type contract: Each component defines an InjectedData interface that declares
    what external data its handlers may receive. All fields are optional (data may
    not be available for all invocations).

    This keeps the component "pure" — it processes data it receives without
    knowledge of where that data came from or how it was loaded.

## Consequences

Positive outcomes: - Component remains truly isolated — no knowledge of external schema - Caller has full control over data loading (can optimize, cache, batch) - Typed InjectedData interface provides compile-time safety - Pattern is testable — inject mock data in tests without projections - Applicable to any BC component, not just Agent

    Negative outcomes:
    - Caller must know what data the component needs (coupling at orchestration layer)
    - Additional argument overhead on handler signatures
    - If component needs different external data for different operations,
      the InjectedData container may grow large

---

[← Back to All Decisions](../DECISIONS.md)
