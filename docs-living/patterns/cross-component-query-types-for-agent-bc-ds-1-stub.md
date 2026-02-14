# 📋 Cross-Component Query Types for Agent BC — DS-1 Stub

**Purpose:** Detailed documentation for the Cross-Component Query Types for Agent BC — DS-1 Stub pattern

---

## Overview

| Property | Value   |
| -------- | ------- |
| Status   | planned |
| Category | Infra   |

## Description

Cross-Component Query Types for Agent BC — DS-1 Stub

Defines the data shapes for argument injection pattern. The app-level
caller pre-loads projection data and passes it as handler arguments,
keeping the agent component truly isolated.

## Cross-BC Query Pattern - Argument Injection

Instead of the agent component reaching out to query app-level projections,
the app-level caller loads projection data and passes it in.

See: PDR-010 (Cross-Component Argument Injection)
See: DESIGN-2026-005 AD-3 (historical)

---

[← Back to Pattern Registry](../PATTERNS.md)
