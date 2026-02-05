# ✅ Projection Complexity Classifier

**Purpose:** Detailed documentation for the Projection Complexity Classifier pattern

---

## Overview

| Property | Value      |
| -------- | ---------- |
| Status   | completed  |
| Category | Implements |

## Description

Analyzes projection characteristics and recommends appropriate
partition strategies using a decision tree approach.

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
