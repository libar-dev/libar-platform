# @libar-dev/platform-fsm

Explicit, typed state-transition rules for domain workflows.

## What this package gives you

- `defineFSM` for declaring allowed transitions
- helpers for transition checks and terminal-state checks
- `FSMTransitionError` for rejected transitions

## Install

```bash
pnpm add @libar-dev/platform-fsm
```

## Example

```ts
import {
  defineFSM,
  canTransition,
  assertTransition,
  validTransitions,
} from "@libar-dev/platform-fsm";

type OrderStatus = "draft" | "submitted" | "confirmed" | "cancelled";

const orderFSM = defineFSM<OrderStatus>({
  initial: "draft",
  transitions: {
    draft: ["submitted", "cancelled"],
    submitted: ["confirmed", "cancelled"],
    confirmed: [],
    cancelled: [],
  },
});

canTransition(orderFSM, "draft", "submitted");
assertTransition(orderFSM, "submitted", "confirmed");
validTransitions(orderFSM, "draft");
```

## Main exports

- `defineFSM`
- `canTransition`, `assertTransition`, `validTransitions`, `isTerminal`, `isValidState`
- `FSMDefinition`, `FSM`, `FSMTransitionError`

## Stability

| Surface                       | Status | Notes                                             |
| ----------------------------- | ------ | ------------------------------------------------- |
| FSM definition and operations | Stable | Pure TypeScript with strong unit and BDD coverage |
| Error type                    | Stable | Safe for `instanceof` checks in calling code      |
| Testing subpath               | Stable | Useful when sharing helpers in spec-style tests   |

## Known limitations

- FSM rules do not enforce business invariants on their own. They only describe valid transitions.
- Use deciders or command handlers for richer validation that depends on data beyond the current state label.

## Security notes

- Treat transition checks as domain guards, not authorization checks.
- Keep caller context out of the FSM definition itself so rules remain deterministic.

## Testing

```bash
pnpm --filter @libar-dev/platform-fsm test
pnpm --filter @libar-dev/platform-fsm test:coverage
```
