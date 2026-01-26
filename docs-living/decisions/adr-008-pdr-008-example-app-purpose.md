# ✅ ADR-008: PDR 008 Example App Purpose

**Purpose:** Architecture decision record for PDR 008 Example App Purpose

---

## Overview

| Property | Value        |
| -------- | ------------ |
| Status   | accepted     |
| Category | architecture |
| Phase    | 23           |

## Context

The example app needs clear guidelines about its purpose. It was unclear whether: - Features should mirror production requirements - Implementation should prioritize completeness vs demonstration value - New functionality should be added based on business needs or platform needs

    The previous "freeze policy" approach was overly prescriptive, defining explicit
    allowed/prohibited change categories. A better approach is to articulate the
    fundamental purpose that guides all decisions.

## Decision

The example app exists to **serve platform development**, not as a standalone product.

    Guiding Principles:

    | Principle | Description |
    |-----------|-------------|
    | Development Aid | Consumer for platform development and testing, not a production app |
    | Reference-Grade | Best possible architecture to demonstrate and test platform capabilities |
    | Platform-Driven | Features selected to serve platform development needs |

    The example app is:
    - A development aid and testing consumer for the platform
    - A reference implementation demonstrating platform capabilities
    - The primary vehicle for validating platform patterns work in realistic scenarios

    Implementation priorities:

    | Priority | Focus |
    |----------|-------|
    | 1 | Demonstrate platform capabilities with reference-grade code |
    | 2 | Provide realistic test scenarios for platform development |
    | 3 | Serve as living documentation through working examples |

    Decision criteria for changes:

    | Question | If Yes | If No |
    |----------|--------|-------|
    | Does this demonstrate a platform capability? | Likely appropriate | Likely not |
    | Does this help test/validate platform features? | Likely appropriate | Likely not |
    | Is this needed for platform development? | Appropriate | Evaluate more |
    | Is this a business feature unrelated to platform? | Not appropriate | - |

## Consequences

Positive outcomes: - Clear decision criteria for example app changes - Focus remains on platform value, not example app features - Prevents scope creep into business logic unrelated to platform - Simpler than explicit allowed/prohibited lists

    Negative outcomes:
    - Example app may not represent a "complete" order management system
    - Some realistic business scenarios may be simplified for demonstration purposes
    - Judgment required (vs prescriptive rules)

---

[← Back to All Decisions](../DECISIONS.md)
