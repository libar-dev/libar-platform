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

### When to Use

- Typing partition-key extractors used by projection and command configs
- Documenting the supported partitioning strategies for Workpool-based flows
- Sharing a common partition-key vocabulary between helpers and validators

### Key Concepts

| Type | Purpose |
|------|---------|
| PartitionKey | Base type for partition key structure |
| PartitionStrategy | Category of partition approach |
| PartitionKeyExtractor | Function that generates partition keys from args |

## Use Cases

- When configuring partition keys for Workpool-based event processing

---

[← Back to Pattern Registry](../PATTERNS.md)
