# ✅ Agent Action Handler

**Purpose:** Detailed documentation for the Agent Action Handler pattern

---

## Overview

| Property | Value     |
| -------- | --------- |
| Status   | completed |
| Category | Arch      |

## Description

Agent action handler for churn risk detection.
This is the ACTION half of the action/mutation split pattern.
Runs in Workpool action context -- can call external APIs (LLM).
All persistence happens in the onComplete mutation.

Architecture:
- internalAction (NOT mutation) -- actions can call external APIs
- Uses createAgentActionHandler factory from platform-core/agent
- Loads state via ctx.runQuery (actions cannot use ctx.db)
- Returns AgentActionResult (no persistence -- that is onComplete's job)

---

[← Back to Pattern Registry](../PATTERNS.md)
