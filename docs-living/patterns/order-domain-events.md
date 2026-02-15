# ✅ Order Domain Events

**Purpose:** Detailed documentation for the Order Domain Events pattern

---

## Overview

| Property | Value          |
| -------- | -------------- |
| Status   | completed      |
| Category | Event Sourcing |

## Description

Orders BC domain events (6 types, 2 schema versions).
V1: Original schemas. V2: OrderSubmitted with CustomerSnapshot (Fat Events).
Use upcasters to migrate V1 events to V2 at read time.

---

[← Back to Pattern Registry](../PATTERNS.md)
