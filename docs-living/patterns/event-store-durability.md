# ✅ Event Store Durability

**Purpose:** Detailed documentation for the Event Store Durability pattern

---

## Overview

| Property | Value     |
| -------- | --------- |
| Status   | completed |
| Category | DDD       |
| Phase    | 18        |

## Description

**Problem:** The dual-write pattern (CMS + Event) works when both operations are in the
same mutation, but several scenarios can result in lost events:

1. **External API success, event capture failure** - Customer charged but PaymentCompleted
   event never recorded. Projection stale, saga stuck, no audit trail.
2. **Cross-context event publication failure** - OrderSubmitted published but inventory
   context never receives it. Fire-and-forget EventBus loses events.
3. **Long-running BC operations** - Multi-step processes (validation, enrichment, external
   calls) fail partway through with no record of what happened.
4. **Action result capture** - Actions are at-most-once. If the mutation that records
   the result fails, the action's side effect is orphaned.

**Solution:** Durable event persistence patterns:

- **Outbox pattern** - Action results captured via onComplete mutation with idempotency
- **Durable publication** - Cross-context events use Workpool with retry and dead letters
- **Intent/Completion events** - Long-running operations bracket with intent -> completion
- **Idempotent append** - Event append checks for existing event by idempotency key
- **Durable append via actions** - Failed appends retried via Workpool actions (not mutations)
- **Poison event handling** - Malformed events quarantined after repeated failures

**Why It Matters for Convex-Native ES:**
| Benefit | How |
| No lost events | Outbox pattern ensures action results become events |
| Complete audit trail | Every external side effect has corresponding event |
| Cross-context reliability | Workpool-backed publication with retry |
| Saga advancement | Events that trigger saga steps are guaranteed to persist |
| Reconciliation support | Intent events enable detection of incomplete operations |
| Projection resilience | Poison events quarantined, don't block processing |

**Relationship to Other Specs:**

- **EventStoreFoundation** - Provides append API with OCC; this spec ensures appends succeed
- **DurableFunctionAdapters** - Provides Workpool/Retrier; this spec uses them for event durability
- **EventReplayInfrastructure** - Replays events; this spec ensures events exist to replay
- **WorkpoolPartitioningStrategy** - Partition key patterns; this spec uses for publication ordering

## Dependencies

- Depends on: EventStoreFoundation
- Depends on: DurableFunctionAdapters
- Depends on: WorkpoolPartitioningStrategy

- Enables: SagaEngine
- Enables: ProjectionRebuilder
- Enables: CrossContextIntegration
- Enables: AuditCompliance

## Implementations

Files that implement this pattern:

- [`durableAppend.ts`](../../packages/platform-core/src/durability/durableAppend.ts) - ## Durable Append via Workpool Actions
- [`idempotentAppend.ts`](../../packages/platform-core/src/durability/idempotentAppend.ts) - ## Idempotent Event Append
- [`index.ts`](../../packages/platform-core/src/durability/index.ts) - ## Event Store Durability
- [`intentCompletion.ts`](../../packages/platform-core/src/durability/intentCompletion.ts) - ## Intent/Completion Event Pattern
- [`outbox.ts`](../../packages/platform-core/src/durability/outbox.ts) - ## Outbox Pattern for Action Results
- [`poisonEvent.ts`](../../packages/platform-core/src/durability/poisonEvent.ts) - ## Poison Event Handling
- [`publication.ts`](../../packages/platform-core/src/durability/publication.ts) - ## Durable Cross-Context Event Publication
- [`types.ts`](../../packages/platform-core/src/durability/types.ts) - ## Event Store Durability Types

## Acceptance Criteria

**External API success is captured as event**

- Given an order "ord-123" requiring payment
- When Stripe charge action succeeds with chargeId "ch-456"
- Then onPaymentComplete mutation should be called
- And PaymentCompleted event should be appended
- And event should contain orderId "ord-123" and chargeId "ch-456"

**External API failure is captured as event**

- Given an order "ord-123" requiring payment
- When Stripe charge action fails after retries
- Then onPaymentComplete mutation should be called with failure result
- And PaymentFailed event should be appended
- And event should contain error details

**onComplete mutation failure is retried**

- Given an action succeeded with result
- When onComplete mutation fails with OCC conflict
- Then Convex should auto-retry the mutation
- And event should eventually be appended

**Idempotent append prevents duplicate events**

- Given PaymentCompleted event already exists for "ord-123"
- When onComplete mutation is retried (e.g., after OCC conflict)
- Then no duplicate event should be created
- And mutation should succeed (idempotent)

**First append with idempotency key succeeds**

- Given no event exists with idempotencyKey "payment:ord-123"
- When idempotentAppendEvent is called
- Then event should be created
- And result.status should be "appended"
- And event should have idempotencyKey "payment:ord-123"

**Duplicate append returns existing event**

- Given event exists with idempotencyKey "payment:ord-123" and eventId "evt-456"
- When idempotentAppendEvent is called with same idempotencyKey
- Then no new event should be created
- And result.status should be "duplicate"
- And result.eventId should be "evt-456"

**Different idempotency keys create separate events**

- Given event exists with idempotencyKey "payment:ord-123"
- When idempotentAppendEvent is called with idempotencyKey "payment:ord-456"
- Then a new event should be created
- And result.status should be "appended"

**Event is delivered to all target contexts**

- Given OrderSubmitted event for "ord-123"
- And target contexts are ["inventory", "notifications"]
- When durableEventPublisher.publish is called
- Then 2 publication tracking records should be created
- And 2 delivery actions should be enqueued
- And both should eventually have status "delivered"

**Failed delivery is retried**

- Given a publication to "inventory" context
- When delivery fails on first attempt
- Then Workpool should retry delivery with backoff
- And attemptCount should increment
- And status should remain "pending" until success or max retries

**Max retries exceeded creates dead letter**

- Given a publication that has failed 5 times
- When delivery fails again
- Then status should become "dead_letter"
- And error should be recorded
- And no further retries should be scheduled

**Publication status is queryable**

- Given publications to 3 target contexts
- When 2 succeed and 1 fails
- Then query by eventId should show:

| targetContext | status    |
| ------------- | --------- |
| inventory     | delivered |
| notifications | delivered |
| analytics     | failed    |

**Intent and completion events bracket operation**

- Given an order submission for "ord-123"
- When submission starts
- Then OrderSubmissionStarted event should be appended
- When submission completes successfully
- Then OrderSubmitted event should be appended
- And OrderSubmitted should reference OrderSubmissionStarted via intentKey

**Timeout detects incomplete operation**

- Given OrderSubmissionStarted was recorded 10 minutes ago
- And timeout is 5 minutes
- And no completion event exists
- When timeout check runs
- Then configured timeout action should trigger
- And action is either OrderSubmissionAbandoned event or alert

**Idempotent timeout handler**

- Given OrderSubmissionStarted was recorded
- And timeout has already been processed (OrderSubmissionAbandoned exists)
- When a duplicate timeout check runs (e.g., after server restart)
- Then no duplicate abandonment event should be created
- And handler should return successfully

**Reconciliation query finds orphaned intents**

- Given 100 intent events in the last hour
- And 95 have matching completion events
- When querying for orphaned intents
- Then 5 intents without completions should be returned
- And each should include time since intent

**Append succeeds on first attempt**

- Given a valid event to append
- When durableAppendEvent is called
- Then event should be appended
- And onComplete should receive success result

**Append retried after transient failure**

- Given an append action that fails on first attempt
- When Workpool processes the failure
- Then action should be retried with backoff
- And event should eventually be appended

**Exhausted retries create dead letter**

- Given an append that consistently fails
- When 5 retry attempts are exhausted
- Then onComplete should receive failed result
- And eventAppendDeadLetters record should be created
- And dead letter should include error details

**Event quarantined after repeated failures**

- Given projection "orderSummary" processing event "evt-123"
- And the event causes a processing error
- When the event fails 3 times
- Then event should be quarantined for "orderSummary"
- And poisonEvents record should include error details
- And alert should be triggered

**Quarantined events skipped in processing**

- Given event "evt-123" is quarantined for "orderSummary"
- When projection processes events including "evt-123"
- Then event "evt-123" should be skipped
- And processing should continue with subsequent events
- And no error should be thrown

**Recovered event can be reprocessed**

- Given event "evt-123" was quarantined due to bug
- And the bug has been fixed
- When admin unquarantines event "evt-123" for "orderSummary"
- Then event should be reprocessed
- And if successful, quarantine record should be removed

**Dead letter created after max retries**

- Given a publication to "analytics" context
- And delivery has failed 5 times
- When 6th delivery attempt fails
- Then publicationDeadLetters record should be created
- And publication status should be "dead_letter"

**Admin can retry dead letter**

- Given a publication dead letter for "analytics" context
- When admin calls retryPublicationDeadLetter
- Then new delivery should be enqueued via publicationPool
- And dead letter status should be "retried"

**Dead letter stats show context-specific issues**

- Given 10 dead letters for "analytics" (external service down)
- And 0 dead letters for "inventory"
- When getPublicationDeadLetterStats is called
- Then stats should show analytics: 10, inventory: 0
- And this indicates analytics context has issues

## Business Rules

**Action results are captured as events via onComplete mutation**

**Invariant:** Every external API result (success or failure) must be captured as a
domain event within the bounded context's event stream.

    **Rationale:** Actions are at-most-once by default. If an action succeeds but the
    subsequent event append fails, the side effect is orphaned. The outbox pattern uses
    `onComplete` callbacks which are guaranteed to be called after the action finishes.

    **API:** See `@libar-dev/platform-core/src/durability/outbox.ts`

    **onComplete Guarantee:** The `onComplete` mutation is scheduled atomically when the
    action completes. It will be called regardless of action success/failure/cancel.
    If the `onComplete` mutation itself fails:
    - Convex OCC auto-retry handles transient conflicts
    - If OCC exhausted, the failure is logged and can be recovered via dead letters
    - The `context` parameter preserves all data needed for manual recovery

    **Critical:** The `onComplete` mutation must be idempotent because OCC retries may
    cause it to execute multiple times with the same data.

    **Verified by:** External API success is captured as event, External API failure is captured as event, onComplete mutation failure is retried

_Verified by: External API success is captured as event, External API failure is captured as event, onComplete mutation failure is retried, Idempotent append prevents duplicate events_

**Event append is idempotent using idempotency keys**

**Invariant:** Each logical event is stored exactly once in the event store, regardless
of how many times the append operation is retried.

    **Rationale:** Retries (Workpool, manual, saga compensation) can cause duplicate append
    attempts. Without idempotency keys, the same business event could be stored multiple times,
    corrupting projections and causing double-processing in downstream systems.

    **API:** See `@libar-dev/platform-core/src/durability/idempotentAppend.ts`

    **Idempotency Key Strategy:**
    | Event Source | Idempotency Key Pattern | Example |
    | Command result | `{commandType}:{entityId}:{commandId}` | `SubmitOrder:ord-123:cmd-456` |
    | Action result | `{actionType}:{entityId}` | `payment:ord-123` |
    | Saga step | `{sagaType}:{sagaId}:{step}` | `OrderFulfillment:saga-789:reserveStock` |
    | Scheduled job | `{jobType}:{scheduleId}:{runTimestamp}` | `expireReservations:job-001:1704067200` |

    **Schema Addition:** The events table requires an optional `idempotencyKey` field
    with a unique index. See EventStoreFoundation for base schema.

    **Verified by:** First append with idempotency key succeeds, Duplicate append returns existing event

_Verified by: First append with idempotency key succeeds, Duplicate append returns existing event, Different idempotency keys create separate events_

**Cross-context events use Workpool-backed publication with tracking**

**Invariant:** Every cross-context event publication must be tracked, retried on failure,
and dead-lettered if undeliverable after maximum attempts.

    **Rationale:** Fire-and-forget publication loses events when subscribers fail. For event-driven
    architectures to be reliable, cross-context communication must be durable with guaranteed
    delivery or explicit failure tracking.

    **API:** See `@libar-dev/platform-core/src/durability/publication.ts`

    **Publication Ownership:** The source bounded context owns publication tracking. This
    maintains BC boundaries and allows source-specific circuit breaker logic.

    **Partition Key Strategy:** Uses `eventId:targetContext` to ensure per-event ordering
    while allowing parallel delivery to different events. See WorkpoolPartitioningStrategy
    for partition key patterns.

    **Verified by:** Event is delivered to all target contexts, Failed delivery is retried, Max retries exceeded creates dead letter

_Verified by: Event is delivered to all target contexts, Failed delivery is retried, Max retries exceeded creates dead letter, Publication status is queryable_

**Long-running operations bracket with intent and completion events**

**Invariant:** Operations that span multiple steps, external calls, or significant time
must record an "intent" event at start and "completion" event at end.

    **Rationale:** Without bracketing, partially-completed operations are invisible to
    monitoring, undetectable by reconciliation, and create audit trail gaps. Intent events
    enable timeout detection and manual intervention for stuck operations.

    **API:** See `@libar-dev/platform-core/src/durability/intentCompletion.ts`

    **Pattern:**
    | Operation | Intent Event | Completion Events |
    | Order submission | OrderSubmissionStarted | OrderSubmitted, OrderSubmissionFailed, OrderSubmissionAbandoned |
    | Payment processing | PaymentProcessingStarted | PaymentCompleted, PaymentFailed |
    | Stock reservation | ReservationRequested | StockReserved, ReservationFailed |

    **Timeout Handling:** The timeout handler is a scheduled mutation via `ctx.scheduler.runAfter`.
    This is appropriate because timeout checks are lightweight (query + conditional write).
    The handler MUST be idempotent as multiple schedulers might fire for the same intent.

    **Verified by:** Intent and completion events bracket operation, Timeout detects incomplete operation, Reconciliation query finds orphaned intents

_Verified by: Intent and completion events bracket operation, Timeout detects incomplete operation, Idempotent timeout handler, Reconciliation query finds orphaned intents_

**Failed event appends are recovered via Workpool actions**

**Invariant:** Event append failures from async contexts (scheduled jobs, saga steps)
are retried with exponential backoff until success or dead letter.

    **Rationale:** Workpool only retries actions, not mutations. By wrapping the idempotent
    append mutation in an action, we get Workpool retry semantics while the underlying
    idempotent check prevents duplicates.

    **API:** See `@libar-dev/platform-core/src/durability/durableAppend.ts`

    **When to Use:**
    | Scenario | Use durableAppendEvent? | Why |
    | Synchronous command handler | No | Atomic dual-write handles this |
    | Action onComplete | Recommended | Mutation can fail after action succeeded |
    | Saga step | Yes | Step result must be captured |
    | Scheduled job | Yes | Job completion must be recorded |

    **Architecture:** The action wrapper calls `ctx.runMutation(idempotentAppend, args)`.
    If the action fails, Workpool retries the action, which re-runs the mutation.
    The idempotency key prevents duplicate events even across retries.

    **Partition Key:** Uses `append:${streamId}` to ensure per-entity ordering.
    See WorkpoolPartitioningStrategy for partition key patterns.

    **Verified by:** Append succeeds on first attempt, Append retried after failure, Exhausted retries create dead letter

_Verified by: Append succeeds on first attempt, Append retried after transient failure, Exhausted retries create dead letter_

**Malformed events are quarantined after repeated failures**

**Invariant:** Events that cause projection processing failures are tracked; after N
failures, they are quarantined and skipped to prevent infinite retry loops.

    **Rationale:** A single malformed event should not block all downstream projections
    indefinitely. Quarantine allows progress while alerting operators for manual investigation.

    **API:** See `@libar-dev/platform-core/src/durability/poisonEvent.ts`

    **Poison Event Flow:**
    | Attempt | Action |
    | 1 | Process event, catch error, record attempt |
    | 2 | Retry with backoff, catch error, record attempt |
    | 3 | Quarantine event, skip in future processing, alert |

    **Recovery:** Quarantined events can be:
    - Manually fixed and reprocessed after code fix deployed
    - Permanently ignored if event data is invalid
    - Used to generate compensating events

    **Verified by:** Event quarantined after repeated failures, Quarantined events skipped in processing

_Verified by: Event quarantined after repeated failures, Quarantined events skipped in processing, Recovered event can be reprocessed_

**Failed publications are tracked and recoverable**

**Invariant:** When cross-context event delivery fails after all retries, a dead letter
record is created. Operations teams can investigate and retry manually or automatically.

    **Rationale:** Dead letters provide visibility into integration failures and enable
    recovery without data loss. Context-specific stats help identify systemic issues
    (e.g., analytics service down).

    **API:** See publication dead letter admin operations in example app.

    **Admin Operations:**
    | Operation | Purpose |
    | listPublicationDeadLetters | View failed deliveries by target context |
    | retryPublicationDeadLetter | Re-enqueue delivery via publicationPool |
    | ignorePublicationDeadLetter | Mark as ignored (e.g., obsolete event) |
    | getPublicationDeadLetterStats | Count by target context and status |

    **Automated Recovery (Optional):** A cron job can periodically retry `pending` dead
    letters with exponential backoff. Events older than configurable age are auto-ignored.

    **Verified by:** Dead letter created after max retries, Admin can retry dead letter, Dead letter stats show context-specific issues

_Verified by: Dead letter created after max retries, Admin can retry dead letter, Dead letter stats show context-specific issues_

---

[← Back to Pattern Registry](../PATTERNS.md)
