# ✅ Middleware Pipeline

**Purpose:** Detailed documentation for the Middleware Pipeline pattern

---

## Overview

| Property | Value     |
| -------- | --------- |
| Status   | completed |
| Category | Pattern   |
| Phase    | 10        |

## Description

Orchestrates middleware execution in the correct order.
Supports before/after hooks and short-circuiting.

### When to Use

- Adding validation, authorization, or logging to commands
- Implementing cross-cutting concerns without modifying handlers
- Short-circuiting command execution for policy enforcement

---

[← Back to Pattern Registry](../PATTERNS.md)
