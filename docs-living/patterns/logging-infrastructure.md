# ✅ Logging Infrastructure

**Purpose:** Detailed documentation for the Logging Infrastructure pattern

---

## Overview

| Property | Value     |
| -------- | --------- |
| Status   | completed |
| Category | Infra     |
| Phase    | 13        |

## Description

Factory for domain-specific loggers with scope prefixes and level filtering.
Follows the Workpool pattern for consistent logging across the platform.

### When to Use

- Creating domain-specific loggers with consistent scope prefixes
- Level-based log filtering (DEBUG, TRACE, INFO, REPORT, WARN, ERROR)
- Child loggers for hierarchical scoping (e.g., "PM:orderNotification")

---

[← Back to Pattern Registry](../PATTERNS.md)
