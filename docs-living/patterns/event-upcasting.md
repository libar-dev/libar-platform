# ✅ Event Upcasting

**Purpose:** Detailed documentation for the Event Upcasting pattern

---

## Overview

| Property | Value     |
| -------- | --------- |
| Status   | completed |
| Category | Pattern   |
| Phase    | 9         |

## Description

Transforms events from older schema versions to current version at read time.
Enables non-breaking schema evolution via centralized migration pipeline.

### When to Use

- Event schemas need to evolve without breaking existing stored events
- Migrating events from older versions during projection/replay reads
- Centralized schema migration via an upcaster registry

---

[← Back to Pattern Registry](../PATTERNS.md)
