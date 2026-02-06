# ✅ Workpool Partition Key Types

**Purpose:** Detailed documentation for the Workpool Partition Key Types pattern

---

## Overview

| Property | Value      |
| -------- | ---------- |
| Status   | completed  |
| Category | Projection |

## Description

Provides type definitions for partition key strategies that ensure
per-entity event ordering and prevent OCC conflicts.

### Key Concepts

| Type                  | Purpose                                          |
| --------------------- | ------------------------------------------------ |
| PartitionKey          | Base type for partition key structure            |
| PartitionStrategy     | Category of partition approach                   |
| PartitionKeyExtractor | Function that generates partition keys from args |

## Use Cases

- When configuring partition keys for Workpool-based event processing

---

[← Back to Pattern Registry](../PATTERNS.md)
