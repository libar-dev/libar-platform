# ✅ CMS Repository

**Purpose:** Detailed documentation for the CMS Repository pattern

---

## Overview

| Property | Value     |
| -------- | --------- |
| Status   | completed |
| Category | Pattern   |
| Phase    | 11        |

## Description

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

[← Back to Pattern Registry](../PATTERNS.md)
