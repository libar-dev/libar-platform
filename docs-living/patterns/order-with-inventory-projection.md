# ✅ Order With Inventory Projection

**Purpose:** Detailed documentation for the Order With Inventory Projection pattern

---

## Overview

| Property | Value      |
| -------- | ---------- |
| Status   | completed  |
| Category | Projection |

## Description

OrderWithInventoryStatus cross-context projection handlers (app-level).

Combines order status with inventory reservation status for dashboard views.
This projection is updated by events from BOTH Orders and Inventory contexts.

This demonstrates the power of app-level projections: cross-context views
that would be impossible if projections lived inside bounded contexts.

---

[← Back to Pattern Registry](../PATTERNS.md)
