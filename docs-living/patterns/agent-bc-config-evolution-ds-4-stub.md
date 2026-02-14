# 📋 AgentBCConfig Evolution — DS-4 Stub

**Purpose:** Detailed documentation for the AgentBCConfig Evolution — DS-4 Stub pattern

---

## Overview

| Property | Value   |
| -------- | ------- |
| Status   | planned |
| Category | Infra   |

## Description

AgentBCConfig Evolution — DS-4 Stub

Evolves AgentBCConfig to support pattern-based detection alongside the
legacy onEvent handler. Adds XOR validation: exactly one of onEvent or
patterns must be set.

Also adds patternId to AgentActionResult to flow pattern identity from
PatternExecutor through onComplete to commands.record.

## Design Decisions

- AD-2: AgentBCConfig uses XOR for onEvent vs patterns
- AD-6: AgentActionResult gains patternId field

See: PDR-012 (Agent Command Routing & Pattern Unification)
See: PDR-011 (Agent Action Handler Architecture) — AD-9 evolves here
Since: DS-4 (Command Routing & Pattern Unification)

---

[← Back to Pattern Registry](../PATTERNS.md)
