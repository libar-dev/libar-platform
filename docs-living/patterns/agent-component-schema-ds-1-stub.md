# 📋 Agent Component Schema — DS-1 Stub

**Purpose:** Detailed documentation for the Agent Component Schema — DS-1 Stub pattern

---

## Overview

| Property | Value   |
| -------- | ------- |
| Status   | planned |
| Category | Infra   |

## Description

Agent Component Schema — DS-1 Stub

Isolated database for all agent-specific state. These tables are
private to the component and accessible only through public API handlers.

Tables match the current app-level definitions (schema.ts:610-858).
During implementation, agent tables move from the shared app schema
to this isolated component schema.

See: DESIGN-2026-005 AD-5 (Schema Strategy, historical)

---

[← Back to Pattern Registry](../PATTERNS.md)
