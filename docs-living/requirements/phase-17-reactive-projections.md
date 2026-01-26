# ✅ Reactive Projections

**Purpose:** Detailed requirements for the Reactive Projections feature

---

## Overview

| Property     | Value     |
| ------------ | --------- |
| Status       | completed |
| Product Area | Platform  |
| Phase        | 17        |

## Description

**Problem:** Workpool-based projections have 100-500ms latency. Users expect
instant feedback (10-50ms) for their actions without polling.

**Solution:** A hybrid model combining:

- **Workpool** for durable, eventually-consistent projection updates
- **Reactive push** for instant UI feedback (10-50ms)

The client sees both durable state AND optimistic updates from recent events.

**Why It Matters for Convex-Native ES:**
| Benefit | How |
| Instant feedback | 10-50ms vs 100ms-2s polling |
| No polling | Convex reactive subscriptions |
| Durability preserved | Workpool still handles persistence |
| Graceful degradation | Falls back to durable state on conflict |

**Key Concepts:**
| Concept | Description |
| Hybrid Model | Durable base + optimistic overlay |
| Shared Evolve | Same evolve() logic on server and client |
| Conflict Detection | Compare optimistic vs durable on refresh |
| Rollback | Discard optimistic if conflict detected |

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

**Hook returns merged state**

- Given a durable projection at position 5
- And recent events at positions 6, 7, 8
- When useReactiveProjection is called
- Then returned state includes all event transformations
- And isOptimistic is true
- And pendingEvents is 3

**Hook handles missing durable state**

- Given no durable projection exists yet
- When useReactiveProjection is called
- Then null is returned
- And no error is thrown

**Hook updates reactively on new events**

- Given an active reactive subscription
- When a new event is published
- Then hook re-renders with updated state within 50ms
- And pendingEvents increments

**Hook clears optimistic state after durable catches up**

- Given optimistic state with 3 pending events
- When durable projection processes all events
- Then isOptimistic becomes false
- And pendingEvents becomes 0
- And state equals durable projection state

## Business Rules

**Hybrid model combines durability with speed**

Workpool handles persistence, reactive layer handles instant feedback.
The two systems work together without interference.

    | Current State | Target State |
    | Workpool only: 100-500ms latency | Hybrid: 10-50ms reactive + durable background |
    | Client polls or waits | Client sees instant optimistic update |
    | No optimistic UI | Full optimistic UI with rollback |

_Verified by: Client receives instant update then durable confirmation, Optimistic update works during Workpool backlog, Durable state takes precedence after convergence_

**Shared evolve logic runs on client and server**

Same evolve() function ensures consistent state transformation.
This is critical for optimistic updates to match durable results.

    The evolve function signature:
    | Input | Output |
    | (state: ProjectionState, event: DomainEvent) | ProjectionState |

_Verified by: Evolve produces identical results on client and server, Evolve handles unknown event types gracefully, Multiple events evolve in sequence_

**Conflict detection triggers rollback**

Optimistic updates are discarded if they conflict with durable state.
This ensures data integrity while allowing optimistic UI.

    | Scenario | Detection | Resolution |
    | Optimistic ahead of durable | Check globalPosition | Merge with durable base |
    | Conflicting branch | Different event IDs at same globalPosition | Discard optimistic |
    | Stale optimistic | Age exceeds stale threshold (30s default) | Rollback to durable |

_Verified by: Conflicting optimistic update is rolled back, Conflict detection handles network partition, No conflict when optimistic is ahead of durable, Rollback triggers UI notification_

**Only View projections need reactive layer**

Logic, Reporting, and Integration projections use Workpool only.
This optimizes resource usage by limiting reactivity to client-facing projections.

    | Category | Reactive Eligible | Reason |
    | view | Yes | Client-facing, needs instant feedback |
    | logic | No | Internal validation, no UI |
    | reporting | No | Analytics, eventual consistency OK |
    | integration | No | Cross-BC sync via EventBus |

_Verified by: Category determines reactive eligibility, Non-view projection rejects reactive subscription, View projection enables full reactive functionality_

**useReactiveProjection merges durable and optimistic state**

The hook provides a unified interface for hybrid reactive projections.
It abstracts the complexity of merging durable and optimistic states.

    Return type fields:
    | Field | Type | Description |
    | state | T or null | Merged state (durable + optimistic) |
    | isOptimistic | boolean | True if optimistic events applied |
    | durablePosition | number | Last processed global position |
    | pendingEvents | number | Count of optimistic events |

_Verified by: Hook returns merged state, Hook handles missing durable state, Hook updates reactively on new events, Hook clears optimistic state after durable catches up_

## Deliverables

- Reactive projection layer (complete)
- useReactiveProjection hook (complete)
- Shared evolve logic (complete)
- Conflict detection (complete)
- Documentation (complete)

---

[← Back to Product Requirements](../PRODUCT-REQUIREMENTS.md)
