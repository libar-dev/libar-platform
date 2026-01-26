# @libar-dev/platform-decider

Pure Functional Event Sourcing Decider pattern for domain decision logic.

## Overview

Deciders are pure functions that encode business rules:

- **Pure** — No I/O, no side effects, deterministic
- **Testable** — Test with plain objects, no mocking required
- **Composable** — Combine deciders for complex logic
- **Three Outcomes** — `success`, `rejected`, `failed`

## Installation

```bash
pnpm add @libar-dev/platform-decider
```

**Peer Dependencies:**

- `vitest` (>=2.0.0) — Optional, for testing utilities

## The Decider Pattern

```typescript
import { success, rejected, failed } from "@libar-dev/platform-decider";

// Pure function: (state, command, context) → DeciderOutput
const confirmOrderDecider = (state, command, context) => {
  // Invariant check
  if (state.status !== "pending") {
    return rejected("ORDER_NOT_PENDING", "Order must be pending");
  }

  // Business rule
  if (state.totalAmount > 10000 && !command.managerApproval) {
    return rejected("MANAGER_APPROVAL_REQUIRED", "Large orders need approval");
  }

  // Success: return event + state update
  return success({
    data: { confirmedAt: context.now },
    event: { eventType: "OrderConfirmed", payload: { orderId: state.orderId } },
    stateUpdate: { status: "confirmed", confirmedAt: context.now },
  });
};
```

## API Reference

### Result Builders

| Function                  | Description                                     |
| ------------------------- | ----------------------------------------------- |
| `success(output)`         | Business rule passed, emit event + state update |
| `rejected(code, message)` | Business rule failed, no event emitted          |
| `failed(error)`           | System error, needs retry                       |

### Type Guards

| Function             | Description                 |
| -------------------- | --------------------------- |
| `isSuccess(result)`  | Check if result is success  |
| `isRejected(result)` | Check if result is rejected |
| `isFailed(result)`   | Check if result is failed   |

### Types

| Type                                    | Description                                        |
| --------------------------------------- | -------------------------------------------------- |
| `DeciderOutput<TEvent, TData, TUpdate>` | Union type of all outcomes                         |
| `DeciderContext`                        | Context passed to deciders (`now`, `userId`, etc.) |
| `DeciderFn<TState, TCommand, TOutput>`  | Function signature for deciders                    |
| `Decider<TState, TCommand, TOutput>`    | Decider with metadata                              |

## Testing

Deciders are pure functions, making them trivial to test:

```typescript
import { isSuccess, isRejected } from "@libar-dev/platform-decider";
import { describe, it, expect } from "vitest";

describe("confirmOrderDecider", () => {
  const context = { now: Date.now(), userId: "user-1" };

  it("rejects non-pending orders", () => {
    const state = { status: "shipped", orderId: "123" };
    const result = confirmOrderDecider(state, {}, context);

    expect(isRejected(result)).toBe(true);
    expect(result.code).toBe("ORDER_NOT_PENDING");
  });

  it("confirms pending orders", () => {
    const state = { status: "pending", orderId: "123", totalAmount: 100 };
    const result = confirmOrderDecider(state, {}, context);

    expect(isSuccess(result)).toBe(true);
    expect(result.event.eventType).toBe("OrderConfirmed");
    expect(result.stateUpdate.status).toBe("confirmed");
  });
});
```

## Related Packages

- `@libar-dev/platform-core` — Decider handler factories (`createDeciderHandler`)
- `@libar-dev/platform-fsm` — FSM for status transitions
