@libar-docs
@libar-docs-release:v0.2.0
@libar-docs-pattern:ExampleAppModernization
@libar-docs-status:completed
@libar-docs-phase:23
@libar-docs-effort:2d
@libar-docs-product-area:ExampleApp
@libar-docs-depends-on:DynamicConsistencyBoundaries,ReactiveProjections,EcstFatEvents,ReservationPattern
@libar-docs-executable-specs:order-management/tests/features/modernization
Feature: Example App Modernization - Reference Implementation Freeze

  **Problem:** The `order-management` example app has grown organically during platform
  development. It doesn't demonstrate the new patterns (DCB, ReactiveProjections, Fat Events)
  implemented in Phases 16-20. Additionally, it's treated like a production app with full
  e2e coverage, creating unnecessary maintenance burden for a reference implementation.

  **Solution:** Modernize once, then freeze. Add targeted demonstrations of each new platform
  pattern in the most natural locations, update documentation to designate it as a "Reference
  Implementation", and establish clear boundaries for what changes are allowed post-freeze.

  **Why It Matters for Convex-Native ES:**
  | Benefit | How |
  | Pattern Validation | Proves platform patterns work in realistic multi-BC context |
  | Reference for Users | Shows recommended usage without overwhelming complexity |
  | Reduced Maintenance | Clear boundaries prevent scope creep and feature bloat |
  | Living Documentation | Example code linked from platform pattern documentation |

  # ===========================================================================
  # DELIVERABLES
  # ===========================================================================

  Background: Deliverables
    Given the following deliverables:
      | Deliverable | Status | Location | Tests | Test Type |
      | DCB multi-product reservation | completed | examples/order-management/convex/inventory.ts | Yes | unit |
      | ReactiveProjection OrderDetailView | completed | examples/order-management/tests/steps/modernization/reactive-projection.steps.ts | Yes | unit |
      | Fat Events OrderSubmitted enrichment | completed | examples/order-management/convex/contexts/orders/domain/events.ts | Yes | unit |
      | README Reference Implementation section | completed | examples/order-management/README.md | Yes | unit |
      | Patterns Demonstrated catalog | completed | examples/order-management/README.md | Yes | unit |

  # ===========================================================================
  # RULE 1: DCB Demo - Multi-Product Reservation
  # ===========================================================================

  Rule: Order submission uses DCB for multi-product inventory reservation

    The order submission flow should demonstrate Dynamic Consistency Boundaries (DCB)
    by atomically reserving inventory across multiple products in a single operation.
    This showcases cross-entity invariant validation within the Inventory bounded context.

    **Current State (sequential reservations):**
    """typescript
    // Current: Multiple separate reservation calls
    for (const item of orderItems) {
      await reserveInventory(ctx, item.productId, item.quantity);
      // Risk: Partial reservation if later item fails
    }
    """

    **Target State (DCB atomic reservation):**
    """typescript
    // Target: Single DCB call for all items
    const result = await executeWithDCB(ctx, {
      scopeKey: createScopeKey(tenantId, "reservation", orderId),
      entities: {
        streamIds: orderItems.map(i => i.productId),
        loadEntity: (ctx, id) => inventoryRepo.tryLoad(ctx, id),
      },
      decider: reserveMultipleDecider,
      command: { orderId, items: orderItems },
      // ... rest of DCB config
    });
    // Guarantee: All-or-nothing reservation
    """

    @acceptance-criteria
    Scenario: Multi-product order uses DCB for atomic reservation
      Given an order with 3 different products
      And all products have sufficient inventory
      When the order is submitted
      Then all inventory reservations should succeed atomically
      And a single ReservationCreated event should be emitted

    @acceptance-criteria @validation
    Scenario: Insufficient inventory for one product rejects entire reservation
      Given an order with 3 different products
      And one product has insufficient inventory
      When the order is submitted
      Then the entire reservation should be rejected
      And no inventory should be reserved for any product
      And rejection reason should indicate the specific product

  # ===========================================================================
  # RULE 2: Reactive Projection Demo - Order Detail View
  # ===========================================================================

  Rule: Order detail view uses reactive projection for instant updates

    The order detail page should demonstrate ReactiveProjections by showing
    instant UI updates without polling. This showcases the hybrid durable +
    optimistic projection model from Phase 17.

    **Architecture:**
    | Component | Purpose | Location |
    | Durable Projection | Workpool-processed, always consistent | convex/orders/projections/orderDetail.ts |
    | Shared Evolve | Same logic client + server | convex/orders/projections/evolve.ts |
    | useReactiveProjection | Hook with optimistic updates | src/hooks/useOrderDetail.ts |
    | Event Stream Query | Recent events for client apply | convex/orders/queries/recentEvents.ts |

    **Target API:**
    """typescript
    // Frontend hook usage
    const { data, isOptimistic, conflicts } = useReactiveProjection({
      projection: api.orders.projections.orderDetail,
      eventStream: api.orders.queries.recentOrderEvents,
      evolve: orderDetailEvolve,
      args: { orderId },
    });

    // Instant updates on local commands
    // Automatic rollback on conflict detection
    """

    @acceptance-criteria
    Scenario: Order detail view shows instant updates
      Given a user is viewing order detail page
      When the order status changes via command
      Then the UI should update within 50ms
      And no polling should be required

    @acceptance-criteria
    Scenario: Optimistic update rolls back on conflict
      Given a user is viewing order detail page
      And an optimistic update is applied
      When the server projection differs from optimistic
      Then the optimistic state should be rolled back
      And the conflict should be logged for debugging

  # ===========================================================================
  # RULE 3: Fat Events Demo - Enriched OrderSubmitted
  # ===========================================================================

  Rule: OrderSubmitted event includes customer snapshot for downstream consumers

    The OrderSubmitted event should demonstrate Fat Events (ECST) by including
    relevant customer data at the time of submission. This enables downstream
    consumers to process the event without additional queries.

    **Enrichment Scope (Minimal):**
    | Field | Source | Purpose |
    | customerName | CustomerCMS | Display in notifications |
    | customerEmail | CustomerCMS | Delivery receipts |
    | submittedAt | Command timestamp | Audit trail |

    **Target Event Schema:**
    """typescript
    interface OrderSubmittedV2 {
      // Core event data
      orderId: string;
      items: OrderItem[];
      totalAmount: number;

      // Fat event enrichment (snapshot at submission time)
      customer: {
        id: string;
        name: string;      // Snapshot - won't change if customer updates later
        email: string;     // Snapshot - for notification at this point in time
      };

      // Metadata
      submittedAt: number;
      schemaVersion: 2;
    }
    """

    @acceptance-criteria
    Scenario: OrderSubmitted includes customer snapshot
      Given a customer with name "John Doe" and email "john@example.com"
      When the customer submits an order
      Then the OrderSubmitted event should include customer.name "John Doe"
      And the OrderSubmitted event should include customer.email "john@example.com"

    @acceptance-criteria
    Scenario: Customer snapshot is immutable in event
      Given an OrderSubmitted event with customer name "John Doe"
      When the customer updates their name to "John Smith"
      Then the original OrderSubmitted event should still show "John Doe"
      And new events should use the updated name

  # ===========================================================================
  # RULE 4: Reference Implementation Documentation
  # ===========================================================================

  Rule: README documents the app as a Reference Implementation

    The README should clearly communicate that this is a reference implementation,
    not a production application. It should catalog which platform patterns are
    demonstrated and link to the corresponding platform documentation.

    **README Sections:**
    | Section | Content |
    | Reference Implementation Badge | Clear designation at top |
    | Patterns Demonstrated | Table of patterns with code links |
    | Architecture Diagram | Visual diagram showing BCs and pattern locations |
    | Running Locally | Development setup instructions |
    | Development Guidelines | Link to ADR-008 for purpose and change criteria |

    **Patterns Demonstrated Catalog:**
    | Pattern | Phase | Location | Documentation Link |
    | CMS Dual-Write | 02 | convex/orders/mutations.ts | CLAUDE.md#cms-is-the-snapshot |
    | Pure Deciders | 14 | convex/orders/deciders/ | CLAUDE.md#pure-deciders |
    | Projection Categories | 15 | convex/projections/definitions.ts | docs/PROJECTION-CATEGORIES.md |
    | DCB | 16 | convex/inventory/mutations.ts | docs/DCB-ARCHITECTURE.md |
    | Reactive Projections | 17 | convex/orders/projections/ | docs/REACTIVE-PROJECTIONS.md |
    | Durable Function Adapters | 18a | convex/inventoryInternal.ts, convex/infrastructure.ts | docs/DURABLE-FUNCTION-ADAPTERS.md |
    | Fat Events | 20 | convex/orders/events/ | CLAUDE.md#ecst-fat-events |
    | Reservation Pattern | 20 | convex/inventory/reservations/ | docs/RESERVATION-PATTERN.md |

    @acceptance-criteria
    Scenario: README has Reference Implementation designation
      Given the example app README
      Then it should have a clear "Reference Implementation" badge or header
      And the purpose section should explain it's for learning, not production

    @acceptance-criteria
    Scenario: All demonstrated patterns are cataloged
      Given the Patterns Demonstrated section
      Then each pattern should have its phase number
      And each pattern should have a code location link
      And each pattern should have a documentation link

