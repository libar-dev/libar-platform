# 📋 Agent Command Router — DS-4 Stub

**Purpose:** Detailed documentation for the Agent Command Router — DS-4 Stub pattern

---

## Overview

| Property | Value   |
| -------- | ------- |
| Status   | planned |
| Category | Infra   |

## Description

Agent Command Router — DS-4 Stub

Maps agent command types to their orchestrator routes. When an agent emits
a command (e.g., SuggestCustomerOutreach), the router determines which
CommandConfig to use and how to transform agent command payload to
orchestrator args format.

## Design Decisions

- AD-5: Router maps agent command types to orchestrator routes with transform
- Agent commands carry metadata (confidence, reason, patternId) that regular
  commands do not. The toOrchestratorArgs transform bridges this gap.

SIMPLIFICATION (holistic review, item 2.1): Replaced singleton class with
plain config map type and utility functions. Routes are passed as a config
map to the command bridge factory, not registered in a global singleton.
Add registry back when multi-agent support requires dynamic route discovery.

See: PDR-012 (Agent Command Routing & Pattern Unification)
See: CommandRegistry (platform-core/src/registry/CommandRegistry.ts)
See: CommandOrchestrator (platform-core/src/orchestration/CommandOrchestrator.ts)
Since: DS-4 (Command Routing & Pattern Unification)

---

[← Back to Pattern Registry](../PATTERNS.md)
