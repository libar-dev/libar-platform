# ✅ Invariant Framework

**Purpose:** Detailed documentation for the Invariant Framework pattern

---

## Overview

| Property | Value     |
| -------- | --------- |
| Status   | completed |
| Category | Pattern   |
| Phase    | 11        |

## Description

Factory for declarative business rule validation with typed error codes.
Creates invariants with check(), assert(), and validate() methods from
a single configuration object for consistent, type-safe validation.

### When to Use

- Defining domain business rules that must hold true for valid state
- Both throwing (assert) and non-throwing (check, validate) validation
- Typed error codes and context for debugging invariant failures

---

[← Back to Pattern Registry](../PATTERNS.md)
