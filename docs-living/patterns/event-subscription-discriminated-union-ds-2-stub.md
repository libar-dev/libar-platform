# 📋 EventSubscription Discriminated Union — DS-2 Stub

**Purpose:** Detailed documentation for the EventSubscription Discriminated Union — DS-2 Stub pattern

---

## Overview

| Property | Value   |
| -------- | ------- |
| Status   | planned |
| Category | Infra   |

## Description

EventSubscription Discriminated Union — DS-2 Stub

Extends EventSubscription from a single-interface (mutation-only) to a
discriminated union supporting both mutation and action handlers.

## Design Decision

- AD-2: EventSubscription as discriminated union with handlerType discriminant

Follows the codebase's established pattern for variant types:
- DeciderOutput = DeciderSuccess | DeciderRejected | DeciderFailed (platform-decider)
- ActionResult = { kind: "success" } | { kind: "failed" } | { kind: "canceled" } (durability)
- WorkpoolRunResult (same pattern, orchestration)

See: PDR-011 (Agent Action Handler Architecture)
Since: DS-2 (Action/Mutation Handler Architecture)

---

[← Back to Pattern Registry](../PATTERNS.md)
