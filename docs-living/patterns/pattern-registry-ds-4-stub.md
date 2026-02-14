# 📋 Pattern Registry — DS-4 Stub

**Purpose:** Detailed documentation for the Pattern Registry — DS-4 Stub pattern

---

## Overview

| Property | Value   |
| -------- | ------- |
| Status   | planned |
| Category | Infra   |

## Description

Pattern Registry — DS-4 Stub

Validates pattern definitions passed directly on AgentBCConfig.patterns.
Patterns are PatternDefinition[] on the config object, not looked up by
name from a global singleton.

## Design Decisions

- AD-1: Originally followed CommandRegistry singleton pattern
- AD-2: AgentBCConfig receives PatternDefinition[] directly (simplified from name-based lookup)

SIMPLIFICATION (holistic review, item 2.1): Replaced singleton class with
plain validation function. Single agent passes PatternDefinition[] directly
on AgentBCConfig. Add registry back when multi-agent support requires
shared pattern discovery.

See: PDR-012 (Agent Command Routing & Pattern Unification)
See: CommandRegistry (platform-core/src/registry/CommandRegistry.ts)
Since: DS-4 (Command Routing & Pattern Unification)

---

[← Back to Pattern Registry](../PATTERNS.md)
