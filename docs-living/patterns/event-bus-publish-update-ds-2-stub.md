# 📋 EventBus Publish Update — DS-2 Stub

**Purpose:** Detailed documentation for the EventBus Publish Update — DS-2 Stub pattern

---

## Overview

| Property | Value   |
| -------- | ------- |
| Status   | planned |
| Category | Infra   |

## Description

EventBus Publish Update — DS-2 Stub

Shows the two changes needed to support the EventSubscription discriminated union:

1. WorkpoolClient interface gains `enqueueAction`
2. ConvexEventBus.publish branches on `subscription.handlerType`

This is the highest-complexity implementation change in DS-2 because it
modifies the central dispatch path that all subscriptions flow through.

Also modifies: platform-core/src/orchestration/types.ts (extend WorkpoolClient interface)

See: event-subscription-types.ts (EventSubscription discriminated union)
See: PDR-011 (Agent Action Handler Architecture)
Since: DS-2 (Action/Mutation Handler Architecture)

---

[← Back to Pattern Registry](../PATTERNS.md)
