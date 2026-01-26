# ✅ Reactive Projection Eligibility

**Purpose:** Detailed requirements for the Reactive Projection Eligibility feature

---

## Overview

| Property     | Value     |
| ------------ | --------- |
| Status       | completed |
| Product Area | Platform  |
| Phase        | 17        |

## Description

As a platform developer
I want only view projections to support reactive updates
So that system resources are optimized

## Acceptance Criteria

**Category determines reactive eligibility**

- Given a projection with category "<category>"
- Then it should <eligibility> for reactive updates

**Non-view projection rejects reactive subscription**

- Given a projection with category "logic"
- When useReactiveProjection is called
- Then it should fail with code "REACTIVE_NOT_SUPPORTED"
- And error message should suggest using regular useQuery

**View projection enables full reactive functionality**

- Given a projection with category "view"
- When useReactiveProjection is called
- Then reactive subscription is established
- And optimistic updates are enabled
- And conflict detection is active

**Initial reactive result represents loading state**

- When createInitialReactiveResult is called
- Then state should be null
- And isLoading should be true
- And isOptimistic should be false
- And durablePosition should be 0
- And pendingEvents should be 0
- And error should be null

---

[← Back to Product Requirements](../PRODUCT-REQUIREMENTS.md)
