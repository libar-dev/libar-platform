# ✅ Order Command Handlers

**Purpose:** Detailed documentation for the Order Command Handlers pattern

---

## Overview

| Property | Value     |
| -------- | --------- |
| Status   | completed |
| Category | Command   |

## Description

Order command handlers implementing the dual-write pattern.

CRITICAL: Every handler follows this pattern:

1. Load CMS (O(1), no rehydration)
2. Lazy upcast if needed
3. Validate business invariants
4. Apply business logic
5. Update CMS
6. Return event data for app-level persistence

NOTE: Event persistence and projection triggering happen at the app level,
not in these handlers. This is because components can't directly access
other components - the app layer orchestrates between them.

FACTORY PATTERN: Most handlers use decider factories:

- createEntityDeciderHandler() for entity creation (CreateOrder)
- createDeciderHandler() for modifications (most others)

EXCEPTION: SubmitOrder uses a custom handler for Fat Events enrichment.
The factory doesn't support pre-decider enrichment, so we manually
load customer data before calling the decider.

Pattern note: We separate handler creation from mutation export to work around
TypeScript portability issues with Convex's type inference.

---

[← Back to Pattern Registry](../PATTERNS.md)
