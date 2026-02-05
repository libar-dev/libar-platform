# ✅ Workpool Partitioning Strategy

**Purpose:** Detailed documentation for the Workpool Partitioning Strategy pattern

---

## Overview

| Property | Value      |
| -------- | ---------- |
| Status   | completed  |
| Category | Implements |

## Description

Standardized partition key patterns for event ordering and OCC prevention
in Workpool-based projection processing.

### Quick Reference

| Projection Type | Helper                              | Key Format      |
| --------------- | ----------------------------------- | --------------- |
| Per-entity      | `createEntityPartitionKey("Order")` | `Order:ord-123` |
| Per-customer    | `createCustomerPartitionKey()`      | `cust-123`      |
| Cross-context   | `createSagaPartitionKey()`          | `corr-123`      |
| Global rollup   | `GLOBAL_PARTITION_KEY`              | `global`        |
| DCB retry       | `createDCBPartitionKey(scopeKey)`   | `dcb:scope-key` |

### Decision Tree

```
What does this projection aggregate?
    │
    ├─► Single entity (Order, Product)
    │       └─► Use createEntityPartitionKey("EntityType")
    │
    ├─► Multiple entities for same customer
    │       └─► Use createCustomerPartitionKey()
    │
    ├─► Multiple entities across a saga/workflow
    │       └─► Use createSagaPartitionKey()
    │
    └─► Global aggregate (daily totals, metrics)
            └─► Use GLOBAL_PARTITION_KEY or maxParallelism: 1
```

---

[← Back to Pattern Registry](../PATTERNS.md)
