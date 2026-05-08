# ✅ Partition Key Helper Functions

**Purpose:** Detailed documentation for the Partition Key Helper Functions pattern

---

## Overview

| Property | Value      |
| -------- | ---------- |
| Status   | completed  |
| Category | Projection |

## Description

Standardized partition key generation for per-entity event ordering
and OCC prevention in Workpool-based processing.

### When to Use

- Generating partition keys for projection configs and durable work submission
- Reusing the same key formats across entity, customer, saga, and DCB flows
- Avoiding ad hoc partition-key implementations that break ordering guarantees

### Quick Reference

| Helper | Key Format | Use Case |
|--------|------------|----------|
| createEntityPartitionKey | `{streamType}:{entityId}` | Per-entity projections |
| createCustomerPartitionKey | `{customerId}` | Customer-scoped aggregations |
| createSagaPartitionKey | `{correlationId}` | Cross-context projections |
| GLOBAL_PARTITION_KEY | `global` | Global rollups |
| createDCBPartitionKey | `{scopeKey}` | DCB retry serialization |

## Use Cases

- When creating partition keys for Workpool-based event processing

---

[← Back to Pattern Registry](../PATTERNS.md)
