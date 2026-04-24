# ✅ Order Fulfillment Saga

**Purpose:** Detailed documentation for the Order Fulfillment Saga pattern

---

## Overview

| Property | Value     |
| -------- | --------- |
| Status   | completed |
| Category | Saga      |

## Description

Order Fulfillment Saga.

Coordinates the order fulfillment process across bounded contexts:
1. When OrderSubmitted event is received
2. Request inventory reservation from Inventory context
3. If reservation succeeds, confirm order and reservation
4. If reservation fails, cancel order (compensation)

Uses @convex-dev/workflow for durable execution that survives restarts.
Saga status tracking is handled by the onComplete callback, not inside the workflow.

---

[← Back to Pattern Registry](../PATTERNS.md)
