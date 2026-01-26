# ✅ Reactive Projection Hybrid Model

**Purpose:** Detailed requirements for the Reactive Projection Hybrid Model feature

---

## Overview

| Property     | Value     |
| ------------ | --------- |
| Status       | completed |
| Product Area | Platform  |
| Phase        | 17        |

## Description

As a frontend developer
I want projections that combine durability with instant feedback
So that users see optimistic updates while maintaining data integrity

## Acceptance Criteria

**Client receives instant update then durable confirmation**

- Given an order is submitted
- When the OrderSubmitted event is published
- Then client sees optimistic update within 50ms
- And Workpool updates durable projection within 500ms
- And client state converges to durable state

**Optimistic update works during Workpool backlog**

- Given the Workpool has a processing backlog
- When an event is published
- Then client sees optimistic update immediately
- And optimistic state includes pending event
- And durable state catches up when Workpool processes

**Durable state takes precedence after convergence**

- Given optimistic state from events A, B
- And Workpool processes events A, B
- When durable projection is updated
- Then optimistic overlay clears for processed events
- And client shows durable state

---

[← Back to Product Requirements](../PRODUCT-REQUIREMENTS.md)
