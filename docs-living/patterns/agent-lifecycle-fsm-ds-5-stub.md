# 📋 Agent Lifecycle FSM — DS-5 Stub

**Purpose:** Detailed documentation for the Agent Lifecycle FSM — DS-5 Stub pattern

---

## Overview

| Property | Value   |
| -------- | ------- |
| Status   | planned |
| Category | Infra   |

## Description

Agent Lifecycle FSM — DS-5 Stub

Formal state machine governing agent start/pause/resume/stop/reconfigure transitions.
Follows the event-driven Map pattern established by ProcessManagerLifecycle and
ProjectionLifecycle.

DS-5 Design Session: Agent Lifecycle FSM
PDR: pdr-013-agent-lifecycle-fsm (AD-1)

See: platform-core/src/processManager/lifecycle.ts — template pattern (identical structure)
See: platform-core/src/projections/lifecycle.ts — also uses this pattern (has PAUSE/RESUME)

---

[← Back to Pattern Registry](../PATTERNS.md)
