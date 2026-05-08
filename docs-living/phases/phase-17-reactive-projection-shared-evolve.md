# ReactiveProjectionSharedEvolve

**Purpose:** Detailed patterns for ReactiveProjectionSharedEvolve

---

## Summary

**Progress:** [████████████████████] 4/4 (100%)

| Status      | Count |
| ----------- | ----- |
| ✅ Completed | 4     |
| 🚧 Active   | 0     |
| 📋 Planned  | 0     |
| **Total**   | 4     |

---

## ✅ Completed Patterns

### ✅ Reactive Projection Conflict Detection

| Property | Value     |
| -------- | --------- |
| Status   | completed |

As a platform developer
  I want conflicts detected and resolved automatically
  So that data integrity is maintained despite optimistic updates

#### Acceptance Criteria

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

### ✅ Reactive Projection Eligibility

| Property | Value     |
| -------- | --------- |
| Status   | completed |

As a platform developer
  I want only view projections to support reactive updates
  So that system resources are optimized

#### Acceptance Criteria

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

### ✅ Reactive Projection Hybrid Model

| Property | Value     |
| -------- | --------- |
| Status   | completed |

As a frontend developer
  I want projections that combine durability with instant feedback
  So that users see optimistic updates while maintaining data integrity

#### Acceptance Criteria

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

### ✅ Reactive Projection Shared Evolve

| Property | Value     |
| -------- | --------- |
| Status   | completed |

As a platform developer
  I want evolve logic shared between client and server
  So that state transformations are always consistent

#### Acceptance Criteria

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

[← Back to Roadmap](../ROADMAP.md)
