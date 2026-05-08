# DCBTypes

**Purpose:** Detailed patterns for DCBTypes

---

## Summary

**Progress:** [████████████████████] 2/2 (100%)

| Status      | Count |
| ----------- | ----- |
| ✅ Completed | 2     |
| 🚧 Active   | 0     |
| 📋 Planned  | 0     |
| **Total**   | 2     |

---

## ✅ Completed Patterns

### ✅ DCB Scope Key Utilities

| Property | Value     |
| -------- | --------- |
| Status   | completed |

## DCB Scope Key Utilities

Re-export the canonical shared scope-key contract used across platform packages.

### When to Use

- Creating or parsing scope keys for DCB execution and storage
- Sharing one canonical scope-key contract across platform-core and app code
- Validating tenant, scope type, and scope ID segments without duplicating helpers

---

### ✅ DCB Types

| Property | Value     |
| -------- | --------- |
| Status   | completed |

## Dynamic Consistency Boundaries (DCB) - Type Definitions

Types for scope-based multi-entity coordination within bounded contexts.

### When to Use

- Modeling multi-entity deciders that coordinate within one bounded context
- Typing scope-level OCC operations, aggregated state, and DCB execution results
- Sharing the canonical DCB contracts across handlers, deciders, and tests

---

[← Back to Roadmap](../ROADMAP.md)
