# CMSRepository

**Purpose:** Detailed patterns for CMSRepository

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

### ✅ CMS Repository

| Property | Value     |
| -------- | --------- |
| Status   | completed |

## CMS Repository - Entity Access with Auto-Upcast

Factory for typed data access with automatic schema upcasting in dual-write handlers.
Eliminates 5-line boilerplate for loading, validating, and upcasting CMS entities.

### When to Use

- Loading CMS entities in command handlers (load, tryLoad, loadMany)
- Persisting CMS updates with version tracking
- Building typed repositories for specific aggregate types

### Problem Solved

Before:
```typescript
const rawCMS = await ctx.db
  .query("orderCMS")
  .withIndex("by_orderId", (q) => q.eq("orderId", orderId))
  .first();
assertOrderExists(rawCMS);
const cms = upcastOrderCMS(rawCMS);
```

After:
```typescript
const { cms, _id } = await orderRepo.load(ctx, orderId);
```

---

### ✅ Invariant Framework

| Property | Value     |
| -------- | --------- |
| Status   | completed |

## Invariant Framework - Declarative Business Rules

Factory for declarative business rule validation with typed error codes.
Creates invariants with check(), assert(), and validate() methods from
a single configuration object for consistent, type-safe validation.

### When to Use

- Defining domain business rules that must hold true for valid state
- Both throwing (assert) and non-throwing (check, validate) validation
- Typed error codes and context for debugging invariant failures

---

[← Back to Roadmap](../ROADMAP.md)
