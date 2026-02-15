# ✅ Order Notification PM

**Purpose:** Detailed documentation for the Order Notification PM pattern

---

## Overview

| Property | Value     |
| -------- | --------- |
| Status   | completed |
| Category | Saga      |

## Description

Process manager: OrderConfirmed -> SendNotification command.
Fire-and-forget coordinator (no compensation, unlike Sagas).
Subscribed via EventBus at PM priority (200).

---

[← Back to Pattern Registry](../PATTERNS.md)
