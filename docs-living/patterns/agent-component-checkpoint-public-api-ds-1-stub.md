# 📋 Agent Component - Checkpoint Public API — DS-1 Stub

**Purpose:** Detailed documentation for the Agent Component - Checkpoint Public API — DS-1 Stub pattern

---

## Overview

| Property | Value   |
| -------- | ------- |
| Status   | planned |
| Category | Infra   |

## Description

Agent Component - Checkpoint Public API — DS-1 Stub

Provides checkpoint operations for exactly-once event processing semantics.
Each agent+subscription pair maintains a checkpoint tracking the last
processed global position.

## Checkpoint API - Position Tracking

Access via: `components.agentBC.checkpoints.*`

See: DESIGN-2026-005 AD-4 (API Granularity, historical)

---

[← Back to Pattern Registry](../PATTERNS.md)
