# ✅ Inventory Command Handlers

**Purpose:** Detailed documentation for the Inventory Command Handlers pattern

---

## Overview

| Property | Value     |
| -------- | --------- |
| Status   | completed |
| Category | Command   |

## Description

Inventory command handlers implementing the dual-write pattern.

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

FACTORY PATTERN: Handlers use decider factories where appropriate:
- createEntityDeciderHandler() for entity creation (CreateProduct)
- createDeciderHandler() for simple modifications (AddStock, ConfirmReservation)
- Hybrid pattern for multi-entity commands (ReserveStock, Release, Expire)

---

[← Back to Pattern Registry](../PATTERNS.md)
