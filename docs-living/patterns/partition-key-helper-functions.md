# ✅ Partition Key Helper Functions

**Purpose:** Detailed documentation for the Partition Key Helper Functions pattern

---

## Overview

| Property | Value      |
| -------- | ---------- |
| Status   | completed  |
| Category | Implements |

## Description

Standardized partition key generation for per-entity event ordering
and OCC prevention in Workpool-based processing.

### Quick Reference

| Helper                     | Key Format                | Use Case                     |
| -------------------------- | ------------------------- | ---------------------------- |
| createEntityPartitionKey   | `{streamType}:{entityId}` | Per-entity projections       |
| createCustomerPartitionKey | `{customerId}`            | Customer-scoped aggregations |
| createSagaPartitionKey     | `{correlationId}`         | Cross-context projections    |
| GLOBAL_PARTITION_KEY       | `global`                  | Global rollups               |
| createDCBPartitionKey      | `{scopeKey}`              | DCB retry serialization      |

## Use Cases

- When creating partition keys for Workpool-based event processing

---

[← Back to Pattern Registry](../PATTERNS.md)
