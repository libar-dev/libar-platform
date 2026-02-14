# 📋 Agent Action Handler Factory — DS-2 Stub

**Purpose:** Detailed documentation for the Agent Action Handler Factory — DS-2 Stub pattern

---

## Overview

| Property | Value   |
| -------- | ------- |
| Status   | planned |
| Category | Infra   |

## Description

Agent Action Handler Factory — DS-2 Stub

Replaces `createAgentEventHandler` (init.ts) with an action-based handler
that can call external APIs (LLM). All persistence happens in the onComplete
mutation, not in the action.

## Design Decisions

- AD-1: Unified action model — all agents use actions, even rule-only ones
- AD-4: Explicit injectedData separates projection data from event history
- AD-8: Separate factory from onComplete handler
- AD-9: AgentBCConfig.onEvent callback stays unchanged

See: PDR-011 (Agent Action Handler Architecture)
See: PDR-010 (Cross-Component Argument Injection)
Since: DS-2 (Action/Mutation Handler Architecture)

---

[← Back to Pattern Registry](../PATTERNS.md)
