# ✅ Agent On Complete Handler

**Purpose:** Detailed documentation for the Agent On Complete Handler pattern

---

## Overview

| Property | Value     |
| -------- | --------- |
| Status   | completed |
| Category | Arch      |

## Description

Workpool job completion handler for agent BC.
This is the MUTATION half of the action/mutation split pattern.

Handles:

- Success: audit -> command -> approval -> checkpoint (LAST, AD-7)
- Failure: dead letter + failure audit (checkpoint NOT advanced)
- Canceled: log only (checkpoint NOT advanced)
- Dead letter replay and ignore operations

---

[← Back to Pattern Registry](../PATTERNS.md)
