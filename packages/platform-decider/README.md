# @libar-dev/platform-decider

Pure decision helpers for event-sourced business logic.

## What this package gives you

- result builders for success, rejection, and failure
- type guards for decider results
- decider types that stay independent of Convex runtime objects

## Install

```bash
pnpm add @libar-dev/platform-decider
```

## Example

```ts
import {
  success,
  rejected,
  isSuccess,
  type DeciderContext,
  type DeciderOutput,
} from "@libar-dev/platform-decider";

type OrderState = { orderId: string; status: "draft" | "submitted" };

type SubmitOrderEvent = {
  eventType: "OrderSubmitted";
  payload: { orderId: string };
};

function decideSubmitOrder(
  state: OrderState,
  context: DeciderContext
): DeciderOutput<SubmitOrderEvent, { submittedAt: number }, { status: "submitted" }> {
  if (state.status !== "draft") {
    return rejected("ORDER_NOT_IN_DRAFT", `Order is ${state.status}`);
  }

  return success({
    data: { submittedAt: context.now },
    event: { eventType: "OrderSubmitted", payload: { orderId: state.orderId } },
    stateUpdate: { status: "submitted" },
  });
}

const result = decideSubmitOrder({ orderId: "ord_1", status: "draft" }, { now: Date.now() });
if (isSuccess(result)) {
  console.log(result.event.eventType);
}
```

## Main exports

- `success`, `rejected`, `failed`
- `isSuccess`, `isRejected`, `isFailed`
- `DeciderOutput`, `DeciderContext`, `DeciderFn`, `Decider`

## Stability

| Surface | Status | Notes |
| --- | --- | --- |
| Core result builders and guards | Stable | Pure TypeScript helpers with broad test coverage |
| Type exports | Stable | Safe to use in package code and app code |
| Testing subpath | Stable | Useful for feature-driven decider tests |

## Known limitations

- This package only models decision logic. It does not load state or persist anything.
- Integration with CMS, event store, and command bus lives in `@libar-dev/platform-core`.

## Security notes

- Deciders should stay pure and trust only the explicit inputs they receive.
- Authentication and authorization belong in the caller that assembles decider context.

## Testing

```bash
pnpm --filter @libar-dev/platform-decider test
pnpm --filter @libar-dev/platform-decider test:coverage
```
