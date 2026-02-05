# ✅ CMS Dual Write

**Purpose:** Detailed documentation for the CMS Dual Write pattern

---

## Overview

| Property | Value     |
| -------- | --------- |
| Status   | completed |
| Category | Core      |
| Phase    | 1         |

## Description

Core types for Command Model State - the continuously updated aggregate snapshot
maintained atomically alongside events in the dual-write pattern.

### When to Use

- Defining aggregate state shapes (extend BaseCMS)
- Schema evolution with CMSUpcaster and CMSVersionConfig
- Timestamped records (use TimestampedCMS)
- Loading CMS with potential upcasting (use CMSLoadResult)

---

[← Back to Pattern Registry](../PATTERNS.md)
