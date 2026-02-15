# ✅ Order Summary Projection

**Purpose:** Detailed documentation for the Order Summary Projection pattern

---

## Overview

| Property | Value      |
| -------- | ---------- |
| Status   | completed  |
| Category | Projection |

## Description

OrderSummary projection handlers (app-level).

Updates the orderSummaries read model based on order events.
Uses globalPosition-based checkpointing for idempotency.
Wraps key handlers with poison event handling for durability.

NOTE: These handlers receive all data via event args - no CMS access.
This is proper Event Sourcing: projections are built from events only.

---

[← Back to Pattern Registry](../PATTERNS.md)
