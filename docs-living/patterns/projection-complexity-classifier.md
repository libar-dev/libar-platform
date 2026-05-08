# ✅ Projection Complexity Classifier

**Purpose:** Detailed documentation for the Projection Complexity Classifier pattern

---

## Overview

| Property | Value      |
| -------- | ---------- |
| Status   | completed  |
| Category | Projection |

## Description

Analyzes projection characteristics and recommends appropriate
partition strategies using a decision tree approach.

### When to Use

- Choosing a partition strategy for a new projection based on its data shape
- Explaining why a projection should serialize globally or partition more narrowly
- Converting architectural projection traits into a concrete Workpool recommendation

### Decision Tree

```
What does this projection aggregate?
    │
    ├─► Global aggregate → "global" strategy
    │
    ├─► Cross-context data → "saga" strategy
    │
    ├─► Customer data → "customer" strategy
    │
    └─► Single entity → "entity" strategy (default)
```

---

[← Back to Pattern Registry](../PATTERNS.md)
