# @libar-dev/platform-fsm

Type-safe Finite State Machine for explicit state transitions.

## Overview

FSM for enforcing valid state transitions:

- **Compile-time Safety** — Invalid transitions are type errors
- **Runtime Validation** — Throws on invalid transitions
- **Declarative** — Define states and transitions in one place
- **Lightweight** — Pure TypeScript, no dependencies

## Installation

```bash
pnpm add @libar-dev/platform-fsm
```

**Peer Dependencies:**

- `vitest` (>=2.0.0) — Optional, for testing utilities

## Quick Start

```typescript
import { defineFSM, canTransition, assertTransition } from "@libar-dev/platform-fsm";

// Define FSM with explicit transitions
type OrderStatus = "draft" | "submitted" | "confirmed" | "shipped" | "cancelled";

const orderFSM = defineFSM<OrderStatus>({
  initial: "draft",
  transitions: {
    draft: ["submitted", "cancelled"],
    submitted: ["confirmed", "cancelled"],
    confirmed: ["shipped"],
    shipped: [], // Terminal state
    cancelled: [], // Terminal state
  },
});

// Check if transition is valid
canTransition(orderFSM, "draft", "submitted"); // true
canTransition(orderFSM, "draft", "shipped"); // false

// Assert transition (throws if invalid)
assertTransition(orderFSM, "draft", "submitted"); // OK
assertTransition(orderFSM, "draft", "shipped"); // Throws FSMTransitionError

// Get valid transitions from current state
validTransitions(orderFSM, "draft"); // ["submitted", "cancelled"]

// Check if state is terminal (no outgoing transitions)
isTerminal(orderFSM, "shipped"); // true
isTerminal(orderFSM, "draft"); // false
```

## API Reference

### Factory

| Function            | Description                   |
| ------------------- | ----------------------------- |
| `defineFSM(config)` | Create FSM from configuration |

### Operations

| Function                          | Description                                |
| --------------------------------- | ------------------------------------------ |
| `canTransition(fsm, from, to)`    | Check if transition is valid               |
| `assertTransition(fsm, from, to)` | Throw if transition invalid                |
| `validTransitions(fsm, from)`     | Get valid target states                    |
| `isTerminal(fsm, state)`          | Check if state has no outgoing transitions |
| `isValidState(fsm, state)`        | Check if state exists in FSM               |

### Types

| Type                    | Description                        |
| ----------------------- | ---------------------------------- |
| `FSMDefinition<TState>` | Configuration for `defineFSM`      |
| `FSM<TState>`           | Created FSM instance               |
| `FSMTransitionError`    | Error thrown on invalid transition |

## Usage in Deciders

FSM is commonly used in deciders to validate state transitions:

```typescript
import { defineFSM, canTransition } from "@libar-dev/platform-fsm";
import { rejected, success } from "@libar-dev/platform-decider";

const orderFSM = defineFSM<OrderStatus>({
  initial: "draft",
  transitions: {
    draft: ["submitted", "cancelled"],
    submitted: ["confirmed", "cancelled"],
    confirmed: ["shipped"],
    shipped: [],
    cancelled: [],
  },
});

function submitOrderDecider(state, command, context) {
  // Validate transition is allowed
  if (!canTransition(orderFSM, state.status, "submitted")) {
    return rejected("INVALID_TRANSITION", `Cannot transition from ${state.status} to submitted`);
  }

  return success({
    data: { submittedAt: context.now },
    event: { eventType: "OrderSubmitted", payload: { orderId: state.orderId } },
    stateUpdate: { status: "submitted" },
  });
}
```

## Related Packages

- `@libar-dev/platform-decider` — Pure decider functions
- `@libar-dev/platform-core` — Re-exports FSM for convenience
