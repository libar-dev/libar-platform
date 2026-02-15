# ✅ Reservation Release PM

**Purpose:** Detailed documentation for the Reservation Release PM pattern

---

## Overview

| Property | Value     |
| -------- | --------- |
| Status   | completed |
| Category | Saga      |

## Description

Process manager: OrderCancelled -> ReleaseReservation command.
Queries orderWithInventory projection to check active reservation exists before emitting release.
Subscribed via EventBus at PM priority (200).

---

[← Back to Pattern Registry](../PATTERNS.md)
