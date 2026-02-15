# ✅ Payment Outbox Handler

**Purpose:** Detailed documentation for the Payment Outbox Handler pattern

---

## Overview

| Property | Value     |
| -------- | --------- |
| Status   | completed |
| Category | Saga      |

## Description

Payment Outbox Handler - Captures payment action results as events.

Uses the outbox pattern to ensure that payment results (success/failure)
are recorded as domain events, even if subsequent processing fails.

### Pattern

```
actionRetrier.run(chargeStripeMock, args, {
  onComplete: onPaymentComplete,
  context: { orderId, customerId, amount, commandId },
})
```

When the action completes:

- Success -> PaymentCompleted event appended
- Failure -> PaymentFailed event appended
- Canceled -> PaymentFailed event with "canceled" error

---

[← Back to Pattern Registry](../PATTERNS.md)
