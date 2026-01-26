@libar-docs
@libar-docs-release:v0.2.0
@libar-docs-pattern:WorkpoolPartitioningStrategy
@libar-docs-status:completed
@libar-docs-unlock-reason:Fix curried helper usage example per PR review
@libar-docs-phase:18c
@libar-docs-effort:3d
@libar-docs-product-area:Platform
@libar-docs-business-value:projection-ordering-and-occ-prevention
@libar-docs-depends-on:DurableFunctionAdapters
@libar-docs-executable-specs:platform-core/tests/features/behavior/workpool-partitioning
Feature: Workpool Partitioning Strategy - Per-Entity Event Ordering

  **Problem:** ADR-018 defines critical partition key strategies for preventing OCC conflicts
  and ensuring per-entity event ordering, but this knowledge is not formalized in a spec
  or implemented consistently. Without proper partitioning:
  - Events for the same entity may process out-of-order
  - Global rollup projections cause OCC conflicts under load
  - Cross-context projections lack saga-scoped consistency

  **Solution:** Formalize partition key patterns from ADR-018 with:
  - **Per-entity partitioning** - streamId ensures entity-scoped ordering
  - **Per-customer partitioning** - customerId for customer-scoped consistency
  - **Global partitioning** - Single key or maxParallelism:1 for aggregate rollups
  - **Saga-scoped partitioning** - correlationId for cross-context coordination
  - **Helper functions** - Type-safe partition key generation

  **Why It Matters for Convex-Native ES:**
  | Benefit | How |
  | Event ordering | Partition key ensures FIFO processing per entity |
  | OCC prevention | Same-key work serializes, reducing write conflicts |
  | Throughput scaling | Different keys parallelize across maxParallelism slots |
  | Consistency boundaries | Partition scope = consistency scope |
  | DCB alignment | Partition keys can match DCB scope keys for coherent retry |

  **Source:** ADR-018 Workpool Partitioning Strategy (not previously ported to delivery-process)

  # ===========================================================================
  # DELIVERABLES
  # ===========================================================================

  Background: Deliverables
    Given the following deliverables:
      | Deliverable | Status | Location | Tests | Test Type |
      | Partition key types | complete | @libar-dev/platform-core/src/workpool/partitioning/types.ts | Yes | unit |
      | Partition key helpers | complete | @libar-dev/platform-core/src/workpool/partitioning/helpers.ts | Yes | unit |
      | Partition key guidelines doc | complete | docs/architecture/WORKPOOL-PARTITIONING.md | No | - |
      | Per-projection config type | complete | @libar-dev/platform-core/src/workpool/partitioning/config.ts | Yes | unit |
      | Projection complexity classifier | complete | @libar-dev/platform-core/src/workpool/partitioning/complexity.ts | Yes | unit |
      | Command config partition validation | complete | @libar-dev/platform-core/src/orchestration/validation.ts | Yes | unit |

  # ===========================================================================
  # RULE 1: Per-Entity Partitioning
  # ===========================================================================

  Rule: Per-entity projections use streamId as partition key

    **Invariant:** Events for the same entity must process in the exact order they
    occurred in the Event Store—no out-of-order processing per entity.

    **Rationale:** Out-of-order event processing causes projection corruption. An
    ItemRemoved event processed before ItemAdded results in invalid state. Using
    `streamId` as partition key serializes per-entity while allowing cross-entity
    parallelism for throughput.

    **API:** See `@libar-dev/platform-core/src/workpool/partitioning/helpers.ts`

    **Verified by:** Entity projection processes events in order, Different entities
    process in parallel, Entity partition key helper generates correct format

    Entity-scoped projections (orderSummary, productCatalog, etc.) must process events
    in the order they occurred for each entity. Using `streamId` as the partition key
    ensures all events for entity X are processed sequentially, even if events for
    entity Y process in parallel.

    **ADR-018 Recommendation:**
    | Projection Type | Partition Key | Parallelism | Rationale |
    | Per-entity (orderSummary) | streamId | High (10+) | Events for same entity serialize |
    | Per-item (orderItems) | orderId | High (10+) | Items for same order serialize |
    | Entity lookup (productLookup) | productId | High (10+) | Single entity consistency |

    **Current State (inconsistent partitioning):**
    """typescript
    // Current: Partition key passed but pattern varies
    // Some configs use orderId, some use streamId, some omit key
    projection: {
      handler: orderSummaryOnCreated,
      projectionName: "orderSummary",
      toProjectionArgs: (args, event) => ({ ... }),
      getPartitionKey: (args) => ({ name: "orderId", value: args.orderId }),
      // ^ Should this be streamId? orderId? Are they the same?
    },
    """

    **Target State (explicit streamId partitioning):**
    """typescript
    import { createEntityPartitionKey } from "@libar-dev/platform-core/workpool/partitioning";

    // Entity projections always use streamId
    projection: {
      handler: orderSummaryOnCreated,
      projectionName: "orderSummary",
      toProjectionArgs: (args, event) => ({ ... }),
      getPartitionKey: createEntityPartitionKey("Order"),
      // Returns: { name: "streamId", value: `Order:${args.orderId}` }
    },

    // The helper ensures consistent format across all entity projections
    export function createEntityPartitionKey(streamType: string) {
      return (args: { streamId?: string; orderId?: string; productId?: string }) => {
        const entityId = args.streamId ?? args.orderId ?? args.productId;
        return { name: "streamId", value: `${streamType}:${entityId}` };
      };
    }
    """

    @acceptance-criteria @happy-path
    Scenario: Entity projection processes events in order
      Given projection "orderSummary" uses streamId partition key
      And events arrive: OrderCreated(pos:1), ItemAdded(pos:2), ItemAdded(pos:3) for order-123
      When all events are enqueued to projectionPool
      Then events should process in order: pos:1, pos:2, pos:3
      And the final orderSummary should reflect all 3 events

    @acceptance-criteria @happy-path
    Scenario: Different entities process in parallel
      Given projection "orderSummary" uses streamId partition key
      And events arrive for order-123 (3 events) and order-456 (3 events)
      When all 6 events are enqueued
      Then order-123 events should process in FIFO order
      And order-456 events should process in FIFO order
      And order-123 and order-456 may interleave (parallel)

    @acceptance-criteria @validation
    Scenario: Entity partition key helper generates correct format
      Given a command with orderId "ord-789" and streamType "Order"
      When createEntityPartitionKey("Order")({ orderId: "ord-789" }) is called
      Then partition key should be { name: "streamId", value: "Order:ord-789" }

  # ===========================================================================
  # RULE 2: Per-Customer Partitioning
  # ===========================================================================

  Rule: Customer-scoped projections use customerId as partition key

    **Invariant:** All events affecting a customer's aggregate view must process in
    FIFO order for that customer—regardless of which entity generated the event.

    **Rationale:** Customer-scoped projections (order history, metrics, preferences)
    combine data from multiple entities. Processing order-123's event before order-122's
    event corrupts chronological customer views. Customer partition serializes all
    customer-affecting events.

    **API:** See `@libar-dev/platform-core/src/workpool/partitioning/helpers.ts`

    **Verified by:** Customer projection aggregates across orders, Customer partition
    key helper validates required field

    Some projections aggregate data per customer (customerOrderHistory, customerMetrics).
    These need all events for a customer to process in order, regardless of which
    specific entity (order, product) the event affects.

    **ADR-018 Recommendation:**
    | Projection Type | Partition Key | Parallelism | Rationale |
    | Customer history | customerId | Medium (5) | Customer-scoped consistency |
    | Customer metrics | customerId | Medium (5) | Aggregate per customer |
    | Customer preferences | customerId | Medium (5) | Single customer state |

    **Target Implementation:**
    """typescript
    import { createCustomerPartitionKey } from "@libar-dev/platform-core/workpool/partitioning";

    // Customer-scoped projections
    projection: {
      handler: customerOrderHistoryOnOrderCreated,
      projectionName: "customerOrderHistory",
      toProjectionArgs: (args, event) => ({ ... }),
      getPartitionKey: createCustomerPartitionKey(),
      // Returns: { name: "customerId", value: args.customerId }
    },

    export function createCustomerPartitionKey() {
      return (args: { customerId: string }) => ({
        name: "customerId",
        value: args.customerId,
      });
    }
    """

    @acceptance-criteria @happy-path
    Scenario: Customer projection aggregates across orders
      Given projection "customerOrderHistory" uses customerId partition key
      And customer "cust-001" has 3 orders with events interleaved with other customers
      When all events are processed
      Then all events for cust-001 should process in FIFO order
      And customerOrderHistory for cust-001 should be consistent

    @acceptance-criteria @validation
    Scenario: Customer partition key helper validates required field
      Given a command without customerId
      When createCustomerPartitionKey() is called
      Then an error should be thrown "customerId required for customer partition"

  # ===========================================================================
  # RULE 3: Global Partitioning for Rollups
  # ===========================================================================

  Rule: Global rollup projections use single partition key or maxParallelism 1

    **Invariant:** Global aggregate projections must serialize all updates—no concurrent
    writes to the same aggregate document.

    **Rationale:** Global rollups (daily sales, inventory totals) write to a single
    document. Concurrent workers cause read-modify-write races: Worker A reads 100,
    Worker B reads 100, both write—one update is lost. Single partition key or
    maxParallelism:1 guarantees sequential processing.

    **API:** See `GLOBAL_PARTITION_KEY` in `@libar-dev/platform-core/src/workpool/partitioning/helpers.ts`

    **Verified by:** Global rollup processes sequentially, Global rollup avoids OCC
    conflicts, Dedicated Workpool alternative

    Aggregate projections that summarize across all entities (dailySalesSummary,
    globalInventoryLevels) have a single write target. Concurrent updates cause
    OCC conflicts. Solutions:

    1. **Single partition key** - All work goes to same partition, serializes
    2. **maxParallelism: 1** - Dedicated Workpool with single worker

    **ADR-018 Recommendation:**
    | Projection Type | Strategy | Rationale |
    | Daily sales rollup | key: "global" | Single aggregate document |
    | Global metrics | maxParallelism: 1 | Dedicated low-throughput pool |
    | Inventory totals | key: "global" | Cross-product aggregation |

    **Why Single Writer:**
    """
    Without single writer:
    Event 1 (qty: +5) ─► Worker A ─► Read total=100, Write total=105
    Event 2 (qty: +3) ─► Worker B ─► Read total=100, Write total=103  ← STALE READ
                                      ↓
                              OCC CONFLICT or WRONG TOTAL

    With single writer (partition key "global"):
    Event 1 (qty: +5) ─► Worker A ─► Read total=100, Write total=105
    Event 2 (qty: +3) ─► Worker A ─► Read total=105, Write total=108  ← CORRECT
    """

    **Target Implementation:**
    """typescript
    import { GLOBAL_PARTITION_KEY } from "@libar-dev/platform-core/workpool/partitioning";

    // Global rollup projections
    projection: {
      handler: dailySalesSummaryOnOrderSubmitted,
      projectionName: "dailySalesSummary",
      toProjectionArgs: (args, event) => ({ ... }),
      getPartitionKey: () => GLOBAL_PARTITION_KEY,
      // Returns: { name: "global", value: "global" }
    },

    export const GLOBAL_PARTITION_KEY = { name: "global", value: "global" };

    // Alternative: Dedicated Workpool
    export const globalRollupPool = new Workpool(components.globalRollupPool, {
      maxParallelism: 1,  // Single worker, no partition key needed
      // ...
    });
    """

    @acceptance-criteria @happy-path
    Scenario: Global rollup processes sequentially
      Given projection "dailySalesSummary" uses GLOBAL_PARTITION_KEY
      And 100 OrderSubmitted events arrive simultaneously
      When all events are processed
      Then all events should process sequentially (FIFO)
      And final dailySalesSummary should reflect all 100 orders correctly

    @acceptance-criteria @validation
    Scenario: Global rollup avoids OCC conflicts
      Given projection "dailySalesSummary" uses GLOBAL_PARTITION_KEY
      And 50 events are processed under load
      When checking for OCC retries
      Then zero OCC conflicts should occur for this projection

    @acceptance-criteria @validation
    Scenario: Dedicated Workpool alternative
      Given a globalRollupPool with maxParallelism 1
      When 100 events are enqueued without partition key
      Then all events should process sequentially
      And no OCC conflicts should occur

  # ===========================================================================
  # RULE 4: Saga-Scoped Partitioning
  # ===========================================================================

  Rule: Cross-context projections use correlationId or sagaId as partition key

    **Invariant:** Events within a saga/workflow must process in causal order across
    all bounded contexts—saga step N+1 must not process before step N.

    **Rationale:** Cross-context projections join data from multiple BCs coordinated
    by a saga. Processing OrderConfirmed before StockReserved shows "confirmed" status
    with missing reservation data. Saga partition key ensures causal ordering.

    **API:** See `@libar-dev/platform-core/src/workpool/partitioning/helpers.ts`

    **Verified by:** Cross-context projection maintains saga ordering, Different sagas
    process in parallel

    Cross-context projections (orderWithInventory) combine data from multiple BCs.
    These need all events within a saga/workflow to process in order to maintain
    consistency across the joined view.

    **ADR-018 Recommendation:**
    | Projection Type | Partition Key | Parallelism | Rationale |
    | Cross-context join | correlationId | Medium (5) | Saga-scoped consistency |
    | Integration view | sagaId | Medium (5) | Workflow-scoped consistency |
    | Event chain view | correlationId | Medium (5) | Causal ordering |

    **Why Saga-Scoped:**
    """
    Order Fulfillment Saga (correlationId: "corr-001"):
      1. OrderSubmitted ─► Update orderWithInventory (order data)
      2. StockReserved  ─► Update orderWithInventory (reservation data)
      3. OrderConfirmed ─► Update orderWithInventory (final status)

    Without saga-scoped partitioning, event 3 could process before event 2,
    showing "confirmed" status before reservation data is visible.
    """

    **Target Implementation:**
    """typescript
    import { createSagaPartitionKey } from "@libar-dev/platform-core/workpool/partitioning";

    // Cross-context projections
    secondaryProjections: [{
      handler: orderWithInventoryOnOrderSubmitted,
      projectionName: "orderWithInventory",
      toProjectionArgs: (args, event) => ({ ... }),
      getPartitionKey: createSagaPartitionKey(),
      // Returns: { name: "correlationId", value: args.correlationId }
    }],

    export function createSagaPartitionKey() {
      return (args: { correlationId: string }) => ({
        name: "correlationId",
        value: args.correlationId,
      });
    }
    """

    @acceptance-criteria @happy-path
    Scenario: Cross-context projection maintains saga ordering
      Given projection "orderWithInventory" uses correlationId partition key
      And saga "corr-001" emits OrderSubmitted, StockReserved, OrderConfirmed
      When all events are processed
      Then events should process in causal order
      And orderWithInventory should show consistent joined state

    @acceptance-criteria @happy-path
    Scenario: Different sagas process in parallel
      Given projection "orderWithInventory" uses correlationId partition key
      And saga "corr-001" and saga "corr-002" emit events concurrently
      When all events are processed
      Then corr-001 events should process in order
      And corr-002 events should process in order
      And corr-001 and corr-002 may interleave

  # ===========================================================================
  # RULE 5: Partition Key Selection Guidelines
  # ===========================================================================

  Rule: Partition key selection follows decision tree

    **Invariant:** Every projection config must have an explicit `getPartitionKey`
    function—implicit or missing partition keys are rejected at validation time.

    **Rationale:** Wrong partition keys cause subtle bugs: too fine-grained wastes
    throughput, too coarse-grained causes out-of-order processing, missing keys
    serialize everything. Mandatory explicit selection forces intentional design.

    **API:** See `@libar-dev/platform-core/src/orchestration/validation.ts`

    **Verified by:** Missing partition key fails validation, Invalid partition key
    shape fails validation, Decision tree guides correct partition choice

    Choosing the wrong partition key causes either:
    - **Too fine-grained:** Unnecessary serialization, reduced throughput
    - **Too coarse-grained:** Events process out-of-order, inconsistent state
    - **Missing:** All events serialize on default key, worst throughput

    **Decision Tree:**
    """
    What does this projection aggregate?
        │
        ├─► Single entity (Order, Product, User)
        │       └─► Use streamId (entity partition)
        │
        ├─► Multiple entities for same customer
        │       └─► Use customerId (customer partition)
        │
        ├─► Multiple entities across a saga/workflow
        │       └─► Use correlationId (saga partition)
        │
        └─► Global aggregate (daily totals, system metrics)
                └─► Use GLOBAL_PARTITION_KEY or maxParallelism: 1
    """

    **Partition Key Validation:**
    CommandOrchestrator should validate that:
    1. Every projection config has `getPartitionKey` defined
    2. Partition key function returns valid `{ name, value }` shape
    3. Value is non-empty string

    **Target Implementation:**
    """typescript
    // orchestration/validation.ts
    export function validateProjectionConfig(config: ProjectionConfig): void {
      if (!config.getPartitionKey) {
        throw new Error(
          `Projection "${config.projectionName}" missing getPartitionKey. ` +
          `Use createEntityPartitionKey, createCustomerPartitionKey, ` +
          `createSagaPartitionKey, or GLOBAL_PARTITION_KEY.`
        );
      }

      // Test with sample args
      const testKey = config.getPartitionKey({ orderId: "test", customerId: "test", correlationId: "test" });
      if (!testKey?.name || !testKey?.value) {
        throw new Error(
          `Projection "${config.projectionName}" getPartitionKey must return { name, value }.`
        );
      }
    }
    """

    @acceptance-criteria @validation
    Scenario: Missing partition key fails validation
      Given a projection config without getPartitionKey
      When CommandOrchestrator validates the config
      Then validation should fail with "missing getPartitionKey"
      And error should suggest available helper functions

    @acceptance-criteria @validation
    Scenario: Invalid partition key shape fails validation
      Given a projection config with getPartitionKey returning null
      When CommandOrchestrator validates the config
      Then validation should fail with "must return { name, value }"

    @acceptance-criteria @happy-path
    Scenario Outline: Decision tree guides correct partition choice
      Given a projection of type "<projectionType>"
      When selecting partition key
      Then recommended key should be "<partitionKey>"
      And helper function should be "<helper>"

      Examples:
        | projectionType | partitionKey | helper |
        | Per-entity (orderSummary) | streamId | createEntityPartitionKey |
        | Per-customer (customerHistory) | customerId | createCustomerPartitionKey |
        | Cross-context (orderWithInventory) | correlationId | createSagaPartitionKey |
        | Global rollup (dailySales) | global | GLOBAL_PARTITION_KEY |

  # ===========================================================================
  # RULE 6: DCB Alignment
  # ===========================================================================

  Rule: DCB retry partition keys align with scope keys for coherent retry

    **Invariant:** DCB retry partition keys must derive from scope keys so retries
    serialize with new operations on the same scope—no interleaving.

    **Rationale:** Misaligned partition keys allow retry attempt 2 for scope X to
    interleave with new operation for scope X, causing the retry to read stale state.
    Aligned keys guarantee sequential processing of all scope-affecting work.

    **API:** See `withDCBRetry` in `@libar-dev/platform-core/src/dcb/withRetry.ts`

    **Verified by:** DCB retry partition aligns with scope, Aligned partition prevents
    interleaving

    When using `withDCBRetry` (Phase 18a), the DCB scope key and projection partition
    key should align to ensure retries don't interleave with new events for the same
    scope.

    **Alignment Pattern:**
    | DCB Scope | DCB Scope Key | Projection Partition Key |
    | Single entity | `tenant:T:entity:Order:ord-123` | `Order:ord-123` (streamId) |
    | Multi-entity reservation | `tenant:T:reservation:res-456` | `res-456` (reservationId) |
    | Customer operation | `tenant:T:customer:cust-789` | `cust-789` (customerId) |

    **Why Alignment Matters:**
    """
    Without alignment:
      DCB retry for ord-123 (attempt 2) ─► Partition key: "dcb:scope-123"
      New event for ord-123             ─► Partition key: "Order:ord-123"

      These could interleave! Retry might see inconsistent state.

    With alignment:
      DCB retry for ord-123 (attempt 2) ─► Partition key: "Order:ord-123"
      New event for ord-123             ─► Partition key: "Order:ord-123"

      Same key = serialized = retry sees complete state.
    """

    **Target Implementation:**
    """typescript
    // DCB retry uses aligned partition key
    const handler = withDCBRetry(ctx, {
      workpool: dcbRetryPool,
      retryMutation: internal.inventory.reserveWithRetry,
      scopeKey: createScopeKey(tenantId, "reservation", reservationId),
      // Partition key for retry derived from scope key
      getRetryPartitionKey: (scopeKey) => ({
        name: "dcb",
        value: scopeKey,  // Same as DCB scope for serialization
      }),
    });
    """

    @acceptance-criteria @validation
    Scenario: DCB retry partition aligns with scope
      Given a DCB operation with scopeKey "tenant:T:reservation:res-456"
      When the operation returns conflict and schedules retry
      Then retry partition key should be "dcb:tenant:T:reservation:res-456"
      And new events for res-456 should serialize with retry

    @acceptance-criteria @happy-path
    Scenario: Aligned partition prevents interleaving
      Given a DCB retry is scheduled for reservation res-456 (attempt 2)
      And a new ReserveStock command arrives for res-456
      When both are enqueued to dcbRetryPool
      Then they should process in FIFO order (retry first or new first, not interleaved)
