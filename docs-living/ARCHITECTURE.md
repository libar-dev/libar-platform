# Architecture

**Purpose:** Auto-generated architecture diagram from source annotations
**Detail Level:** Component diagram with bounded context subgraphs

---

## Overview

This diagram was auto-generated from 12 annotated source files across 2 bounded contexts.

| Metric           | Count |
| ---------------- | ----- |
| Total Components | 12    |
| Bounded Contexts | 2     |
| Component Roles  | 7     |

---

## System Overview

Component architecture with bounded context isolation:

```mermaid
graph TB
    subgraph inventory["Inventory BC"]
        ActiveReservationsProjection["ActiveReservationsProjection[projection]"]
        InventoryCommandHandlers["InventoryCommandHandlers[command-handler]"]
    end
    subgraph orders["Orders BC"]
        OrderNotificationPM["OrderNotificationPM[process-manager]"]
        OrderSummaryProjection["OrderSummaryProjection[projection]"]
        OrderCommandHandlers["OrderCommandHandlers[command-handler]"]
        OrderDomainEvents["OrderDomainEvents[bounded-context]"]
        OrderDeciders["OrderDeciders[decider]"]
    end
    subgraph shared["Shared Infrastructure"]
        OrderManagementInfrastructure["OrderManagementInfrastructure[infrastructure]"]
        EventSubscriptionRegistry["EventSubscriptionRegistry[infrastructure]"]
        SagaRouter["SagaRouter[infrastructure]"]
        OrderFulfillmentSaga["OrderFulfillmentSaga[saga]"]
        OrderWithInventoryProjection["OrderWithInventoryProjection[projection]"]
    end
    EventSubscriptionRegistry --> OrderNotificationPM
    SagaRouter --> OrderFulfillmentSaga
    OrderFulfillmentSaga --> OrderCommandHandlers
    OrderFulfillmentSaga --> InventoryCommandHandlers
    OrderNotificationPM --> OrderCommandHandlers
    OrderWithInventoryProjection --> OrderCommandHandlers
    OrderWithInventoryProjection --> InventoryCommandHandlers
    ActiveReservationsProjection --> InventoryCommandHandlers
    OrderCommandHandlers --> OrderDeciders
```

---

## Legend

| Arrow Style | Relationship | Description                              |
| ----------- | ------------ | ---------------------------------------- |
| `-->`       | uses         | Direct dependency (solid arrow)          |
| `-.->`      | depends-on   | Weak dependency (dashed arrow)           |
| `..->`      | implements   | Realization relationship (dotted arrow)  |
| `-->>`      | extends      | Generalization relationship (open arrow) |

---

## Component Inventory

All components with architecture annotations:

| Component                          | Context   | Role            | Layer          | Source File                                                                                    |
| ---------------------------------- | --------- | --------------- | -------------- | ---------------------------------------------------------------------------------------------- |
| ✅ Inventory Command Handlers      | inventory | command-handler | application    | libar-platform/examples/order-management/convex/contexts/inventory/handlers/commands.ts        |
| ✅ Active Reservations Projection  | inventory | projection      | application    | libar-platform/examples/order-management/convex/projections/inventory/activeReservations.ts    |
| ✅ Order Domain Events             | orders    | bounded-context | domain         | libar-platform/examples/order-management/convex/contexts/orders/domain/events.ts               |
| ✅ Order Command Handlers          | orders    | command-handler | application    | libar-platform/examples/order-management/convex/contexts/orders/handlers/commands.ts           |
| ✅ Order Deciders                  | orders    | decider         | domain         | libar-platform/examples/order-management/convex/contexts/orders/domain/deciders/index.ts       |
| ✅ Order Notification PM           | orders    | process-manager | application    | libar-platform/examples/order-management/convex/processManagers/orderNotification.ts           |
| ✅ Order Summary Projection        | orders    | projection      | application    | libar-platform/examples/order-management/convex/projections/orders/orderSummary.ts             |
| ✅ Event Subscription Registry     | -         | infrastructure  | infrastructure | libar-platform/examples/order-management/convex/eventSubscriptions.ts                          |
| ✅ Order Management Infrastructure | -         | infrastructure  | infrastructure | libar-platform/examples/order-management/convex/infrastructure.ts                              |
| ✅ Saga Router                     | -         | infrastructure  | infrastructure | libar-platform/examples/order-management/convex/sagas/router.ts                                |
| ✅ Order With Inventory Projection | -         | projection      | application    | libar-platform/examples/order-management/convex/projections/crossContext/orderWithInventory.ts |
| ✅ Order Fulfillment Saga          | -         | saga            | application    | libar-platform/examples/order-management/convex/sagas/orderFulfillment.ts                      |
