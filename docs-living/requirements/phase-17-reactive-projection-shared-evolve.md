# ✅ Reactive Projection Shared Evolve

**Purpose:** Detailed requirements for the Reactive Projection Shared Evolve feature

---

## Overview

| Property     | Value     |
| ------------ | --------- |
| Status       | completed |
| Product Area | Platform  |
| Phase        | 17        |

## Description

As a platform developer
I want evolve logic shared between client and server
So that state transformations are always consistent

## Acceptance Criteria

**Evolve produces identical results on client and server**

- Given an OrderSubmitted event
- When evolve is applied on client (optimistic)
- And evolve is applied on server (durable)
- Then both should produce identical state

**Evolve handles unknown event types gracefully**

- Given an evolve function for known event types
- When an unknown event type is applied
- Then state should remain unchanged
- And no error should be thrown

**Multiple events evolve in sequence**

- Given a base projection state
- When OrderSubmitted then OrderConfirmed events are applied
- Then final state reflects all event transformations in order
- And intermediate states are consistent

**Evolve error includes event context**

- Given a base projection state
- And an evolve function that throws on "CorruptEvent"
- When a "CorruptEvent" at position 5 is merged
- Then error message should contain "position=5"
- And error message should contain "CorruptEvent"

---

[← Back to Product Requirements](../PRODUCT-REQUIREMENTS.md)
