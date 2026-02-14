# 📋 Command Bridge — DS-4 Stub

**Purpose:** Detailed documentation for the Command Bridge — DS-4 Stub pattern

---

## Overview

| Property | Value   |
| -------- | ------- |
| Status   | planned |
| Category | Infra   |

## Description

Command Bridge — DS-4 Stub

Bridges agent command recording (onComplete step 2) with command routing
through CommandOrchestrator. Uses Workpool to keep persistence and routing
in separate transactions with built-in retry and failure handling.

## Design Decisions

- AD-4: Workpool dispatch from onComplete (CHANGED from scheduler.runAfter — holistic review item 2.2)
- AD-5: AgentCommandRouteMap maps command types to orchestrator routes
- AD-6: patternId flows through AgentActionResult -> commands.record -> routing context

## Integration Points

1. **onComplete handler (DS-2)** — After recording command, enqueues via Workpool
2. **Agent Component commands API (DS-1)** — Loads command by decisionId, updates status
3. **AgentCommandRouteMap (DS-4)** — Looks up route, transforms args
4. **CommandOrchestrator (existing)** — Executes the transformed command

See: PDR-012 (Agent Command Routing & Pattern Unification)
See: PDR-011 (Agent Action Handler Architecture) — onComplete persistence order
See: AgentCommandRouteMap (command-router.ts)
Since: DS-4 (Command Routing & Pattern Unification)

---

[← Back to Pattern Registry](../PATTERNS.md)
