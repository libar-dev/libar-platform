# 📋 Agent onComplete Handler Factory — DS-2 Stub

**Purpose:** Detailed documentation for the Agent onComplete Handler Factory — DS-2 Stub pattern

---

## Overview

| Property | Value   |
| -------- | ------- |
| Status   | planned |
| Category | Infra   |

## Description

Agent onComplete Handler Factory — DS-2 Stub

Creates a Workpool onComplete mutation that persists all agent state
after the action handler completes. This is the persistence phase of
the action/mutation split.

## Design Decisions

- AD-5: onComplete data contract — action returns AgentActionResult,
  context carries AgentWorkpoolContext
- AD-6: Idempotency — onComplete checks checkpoint position via OCC
- AD-7: Persistence ordering — checkpoint updated LAST
- AD-8: Separate factory from action handler

See: PDR-011 (Agent Action Handler Architecture)
Since: DS-2 (Action/Mutation Handler Architecture)

---

[← Back to Pattern Registry](../PATTERNS.md)
