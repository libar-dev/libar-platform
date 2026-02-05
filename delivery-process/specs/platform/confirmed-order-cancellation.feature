@libar-docs
@libar-docs-release:v0.2.0
@libar-docs-pattern:ConfirmedOrderCancellation
@libar-docs-status:active
@libar-docs-phase:22
@libar-docs-effort:2d
@libar-docs-product-area:Platform
@libar-docs-depends-on:SagaOrchestration,AgentAsBoundedContext
@libar-docs-executable-specs:order-management/tests/features/behavior/orders,order-management/tests/integration-features/orders
Feature: Confirmed Order Cancellation with Reservation Release

  **Problem:** The Order FSM treats `confirmed` as terminal. Orders cannot be
  cancelled after saga confirmation, blocking the Agent BC demo which requires
  3+ cancellations to trigger churn risk detection. The Reservation FSM already
  supports `confirmed -> released`, but no coordination exists to release
  reservations when confirmed orders are cancelled.

  **Solution:** Enable cancellation of confirmed orders with automatic reservation release:
  1. **FSM change:** Add `confirmed -> cancelled` transition to Order FSM
  2. **Decider change:** Remove `ORDER_ALREADY_CONFIRMED` rejection in CancelOrder
  3. **Process Manager:** ReservationReleaseOnOrderCancel PM releases reservation
     when a confirmed order is cancelled

  **Why It Matters:**
  | Benefit | How |
  | Agent BC enablement | 3+ cancellations trigger churn risk pattern detection |
  | Business flexibility | Customers can cancel even after confirmation |
  | Stock recovery | Reserved inventory returns to available pool |
  | Consistency | Order and Reservation states stay synchronized |

  **Cross-Context Coordination:**
  | Event Source | Event | PM Action | Target BC |
  | Orders BC | OrderCancelled | Trigger | PM |
  | PM | ReleaseReservation | Command | Inventory BC |
  | Inventory BC | ReservationReleased | Audit | - |

  **Design Decision: PM vs Saga:**
  - No compensation needed (simple event -> command)
  - No multi-step coordination
  - No external event awaits
  - Therefore: **Process Manager** is the correct choice (per ADR-033)

  Background: Deliverables
    Given the following deliverables:
      | Deliverable | Status | Location | Tests | Test Type |
      | Order FSM confirmed->cancelled transition | Implemented | contexts/orders/domain/orderFSM.ts | Yes | behavior |
      | CancelOrder decider remove confirmed rejection | Implemented | contexts/orders/domain/deciders/cancelOrder.ts | Yes | behavior |
      | ReservationReleaseOnOrderCancel PM | Implemented | processManagers/reservationRelease.ts | Yes | integration |
      | PM subscription registration | Implemented | eventSubscriptions.ts | Yes | integration |
      | order-evolve.feature update | Implemented | tests/features/behavior/deciders/order-evolve.feature | - | - |
      | cancel-order.decider.feature update | Implemented | tests/features/behavior/deciders/cancel-order.decider.feature | - | - |
      | cancel-order.feature (behavior) update | Implemented | tests/features/behavior/orders/cancel-order.feature | - | - |
      | cancel-order.feature (integration) update | Implemented | tests/integration-features/orders/cancel-order.feature | - | - |

  Rule: Confirmed orders can be cancelled

    The Order FSM must allow transitioning from `confirmed` to `cancelled`.
    The CancelOrder decider must accept cancellation requests for confirmed orders.

    **FSM Change:**
    """typescript
    // Before:
    confirmed: [], // terminal state

    // After:
    confirmed: ["cancelled"], // can cancel confirmed orders
    """

    **Decider Change:**
    """typescript
    // Remove this rejection:
    // if (state.status === "confirmed") {
    //   return rejected("ORDER_ALREADY_CONFIRMED", "...");
    // }
    // Let FSM handle the transition validation
    """

    @acceptance-criteria @happy-path
    Scenario: Cancel a confirmed order
      Given an order "ord-conf-cancel-01" exists with status "confirmed"
      When I send a CancelOrder command for "ord-conf-cancel-01" with reason "Customer changed mind"
      Then the command should succeed
      And the order "ord-conf-cancel-01" status should be "cancelled"

    @acceptance-criteria @validation
    Scenario: Cannot cancel already cancelled order (unchanged behavior)
      Given an order "ord-conf-cancel-02" exists with status "cancelled"
      When I send a CancelOrder command for "ord-conf-cancel-02" with reason "Double cancel attempt"
      Then the command should be rejected with code "ORDER_ALREADY_CANCELLED"

    @acceptance-criteria @evolve
    Scenario: OrderCancelled evolves confirmed state to cancelled
      Given an order state with status "confirmed"
      When OrderCancelled event is applied
      Then state should have status "cancelled"

  Rule: Reservation is released when confirmed order is cancelled

    The ReservationReleaseOnOrderCancel PM subscribes to OrderCancelled events.
    When triggered, it checks if the order had a reservation and releases it.

    **PM Definition:**
    | Property | Value |
    | processManagerName | reservationReleaseOnOrderCancel |
    | eventSubscriptions | OrderCancelled |
    | emitsCommands | ReleaseReservation |
    | context | orders |
    | correlationStrategy | orderId |

    **PM Logic:**
    """typescript
    async function handleOrderCancelled(ctx, event) {
      // Query orderWithInventoryStatus projection for reservationId
      const orderStatus = await ctx.db
        .query("orderWithInventoryStatus")
        .withIndex("by_orderId", q => q.eq("orderId", event.payload.orderId))
        .first();

      // Only release if reservation exists and is not already released
      if (orderStatus?.reservationId &&
          orderStatus.reservationStatus !== "released") {
        return [{
          commandType: "ReleaseReservation",
          payload: {
            reservationId: orderStatus.reservationId,
            reason: `Order ${event.payload.orderId} cancelled: ${event.payload.reason}`,
          },
          causationId: event.eventId,
          correlationId: event.correlationId,
        }];
      }

      return []; // No command to emit
    }
    """

    @acceptance-criteria @happy-path
    Scenario: Reservation is released after confirmed order cancellation
      Given a product "prod-rel-01" exists with 10 available and 5 reserved stock
      And a confirmed order "ord-rel-01" with a confirmed reservation for 5 units
      When I cancel order "ord-rel-01" with reason "Customer changed mind"
      Then the order "ord-rel-01" should have status "cancelled"
      And I wait for projections to process
      And the reservation for order "ord-rel-01" should have status "released"
      And the product "prod-rel-01" should have 15 available and 0 reserved stock

    @acceptance-criteria @edge-case
    Scenario: Cancelling draft order does not trigger reservation release
      Given a draft order "ord-rel-02" exists
      When I cancel order "ord-rel-02" with reason "Changed mind early"
      Then the order "ord-rel-02" should have status "cancelled"
      And no ReleaseReservation command should be emitted

    @acceptance-criteria @edge-case
    Scenario: Cancelling submitted order with pending reservation releases it
      Given a submitted order "ord-rel-03" with a pending reservation
      When I cancel order "ord-rel-03" with reason "Changed mind before confirmation"
      Then the order "ord-rel-03" should have status "cancelled"
      And the reservation for order "ord-rel-03" should have status "released"

    @acceptance-criteria @idempotency
    Scenario: PM is idempotent for duplicate OrderCancelled events
      Given a confirmed order "ord-rel-04" with a confirmed reservation
      When OrderCancelled event is delivered twice for "ord-rel-04"
      Then the reservation should only be released once

  Rule: Agent BC demo flow is enabled

    The primary use case is enabling the Agent BC churn risk detection demo.

    @acceptance-criteria @agent-bc-demo
    Scenario: Three cancellations trigger churn risk agent
      Given a customer "cust-churn-01" exists
      And 3 confirmed orders for customer "cust-churn-01"
      When I cancel all 3 orders for customer "cust-churn-01"
      Then the churn risk agent should detect the pattern
      And an approval request should be created for customer outreach
