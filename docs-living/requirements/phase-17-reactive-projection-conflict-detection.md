# ✅ Reactive Projection Conflict Detection

**Purpose:** Detailed requirements for the Reactive Projection Conflict Detection feature

---

## Overview

| Property     | Value     |
| ------------ | --------- |
| Status       | completed |
| Product Area | Platform  |
| Phase        | 17        |

## Description

As a platform developer
I want conflicts detected and resolved automatically
So that data integrity is maintained despite optimistic updates

## Acceptance Criteria

**Conflicting optimistic update is rolled back**

- Given optimistic state based on event A
- And durable state updated with event B (different branch)
- When conflict is detected
- Then optimistic state should be discarded
- And client should show durable state

**Conflict detection handles network partition**

- Given optimistic updates accumulated during offline period
- When client reconnects and receives durable state
- Then all conflicting optimistic updates are rolled back
- And non-conflicting updates are preserved

**No conflict when optimistic is ahead of durable**

- Given optimistic state with events A, B
- And durable state with only event A
- When durable catches up with event B
- Then states converge without rollback
- And no user-visible disruption occurs

**Rollback triggers UI notification**

- Given optimistic state that will conflict
- When conflict is detected and rollback occurs
- Then client receives conflict notification
- And UI can display appropriate feedback

**Partial clearing preserves unconfirmed events**

- Given optimistic state with events at positions <positions>
- When durable confirms position <confirmed>
- Then remaining event positions should be "<remaining>"

---

[← Back to Product Requirements](../PRODUCT-REQUIREMENTS.md)
