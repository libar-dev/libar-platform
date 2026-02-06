# ✅ Per-Projection Partition Configuration

**Purpose:** Detailed documentation for the Per-Projection Partition Configuration pattern

---

## Overview

| Property | Value      |
| -------- | ---------- |
| Status   | completed  |
| Category | Projection |

## Description

Defines configuration types and constants for projection partitioning
including parallelism recommendations based on partition strategy.

### Parallelism Guidelines

| Strategy | Recommended | Rationale                             |
| -------- | ----------- | ------------------------------------- |
| entity   | 10+         | High parallelism, per-entity ordering |
| customer | 5           | Medium, per-customer ordering         |
| saga     | 5           | Medium, per-saga causal ordering      |
| global   | 1           | Single worker, no parallelism         |

---

[← Back to Pattern Registry](../PATTERNS.md)
