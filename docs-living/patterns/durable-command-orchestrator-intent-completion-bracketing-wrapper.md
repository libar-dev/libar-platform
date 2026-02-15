# Durable Command Orchestrator - Intent/Completion Bracketing Wrapper

**Purpose:** Detailed documentation for the Durable Command Orchestrator - Intent/Completion Bracketing Wrapper pattern

---

## Overview

| Property | Value   |
| -------- | ------- |
| Status   | planned |
| Category | Command |

## Description

Durable Command Orchestrator - Intent/Completion Bracketing Wrapper

Wraps the standard CommandOrchestrator with durability features:

- Intent recording before execution (with scheduled timeout)
- Completion recording after success/failure
- Orphan detection for stuck commands

The existing CommandOrchestrator remains unchanged - this is an opt-in
enhancement for commands that need durability guarantees.

### Usage

```typescript
// In a mutation handler:
const durableExecutor = createDurableExecutor(submitOrderConfig);

export const submitOrderDurable = mutation({
  args: { ... },
  handler: (ctx, args) => durableExecutor(ctx, args),
});
```

---

[← Back to Pattern Registry](../PATTERNS.md)
