# Architecture

**Purpose:** Auto-generated architecture diagram from source annotations
**Detail Level:** Component diagram with bounded context subgraphs

---

## Overview

This diagram shows 51 key components with explicit architectural roles across 3 bounded contexts.

| Metric             | Count |
| ------------------ | ----- |
| Diagram Components | 51    |
| Bounded Contexts   | 3     |
| Component Roles    | 9     |

---

## System Overview

Component architecture with bounded context isolation:

```mermaid
graph TB
    subgraph agent["Agent BC"]
        Agent_Approval_Workflow_Tools["Agent Approval Workflow Tools[service]"]
        Agent_BC_Utility_Functions["Agent BC Utility Functions[service]"]
        Agent_Command_Emission_Tool["Agent Command Emission Tool[service]"]
        AgentActionHandler["AgentActionHandler[command-handler]"]
        AgentOnCompleteHandler["AgentOnCompleteHandler[infrastructure]"]
        Churn_Risk_Agent_Configuration["Churn Risk Agent Configuration[infrastructure]"]
        Churn_Risk_Pattern_Definition["Churn Risk Pattern Definition[decider]"]
        Confidence_Calculation_Utilities_for_Agent_BC["Confidence Calculation Utilities for Agent BC[service]"]
        Customer_Utility_Functions_for_Agent_BC["Customer Utility Functions for Agent BC[service]"]
        LLM_Configuration_and_Runtime_Exports["LLM Configuration and Runtime Exports[infrastructure]"]
        LLM_Provider_Configuration["LLM Provider Configuration[infrastructure]"]
        OpenRouter_Agent_Runtime["OpenRouter Agent Runtime[infrastructure]"]
    end
    subgraph inventory["Inventory BC"]
        ActiveReservationsProjection["ActiveReservationsProjection[projection]"]
        InventoryCommandConfigs["InventoryCommandConfigs[infrastructure]"]
        InventoryCommandHandlers["InventoryCommandHandlers[command-handler]"]
        InventoryDeciders["InventoryDeciders[decider]"]
        InventoryDomainEvents["InventoryDomainEvents[bounded-context]"]
        InventoryInternalMutations["InventoryInternalMutations[infrastructure]"]
        InventoryPublicAPI["InventoryPublicAPI[infrastructure]"]
        ProductCatalogProjection["ProductCatalogProjection[projection]"]
    end
    subgraph orders["Orders BC"]
        CustomerCancellationsProjection["CustomerCancellationsProjection[projection]"]
        OrderCommandConfigs["OrderCommandConfigs[infrastructure]"]
        OrderCommandHandlers["OrderCommandHandlers[command-handler]"]
        OrderDeciders["OrderDeciders[decider]"]
        OrderDomainEvents["OrderDomainEvents[bounded-context]"]
        OrderItemsProjection["OrderItemsProjection[projection]"]
        OrderNotificationPM["OrderNotificationPM[process-manager]"]
        OrderPublicAPI["OrderPublicAPI[infrastructure]"]
        OrderSummaryProjection["OrderSummaryProjection[projection]"]
        ReservationReleasePM["ReservationReleasePM[process-manager]"]
    end
    subgraph shared["Shared Infrastructure"]
        AppCompositionRoot["AppCompositionRoot[infrastructure]"]
        CommandRegistry["CommandRegistry[infrastructure]"]
        CrossContextReadModel["CrossContextReadModel[read-model]"]
        DCBRetryExecution["DCBRetryExecution[infrastructure]"]
        DurableAppendAction["DurableAppendAction[infrastructure]"]
        EventSubscriptionRegistry["EventSubscriptionRegistry[infrastructure]"]
        IntegrationDeadLetters["IntegrationDeadLetters[infrastructure]"]
        IntegrationEventHandlers["IntegrationEventHandlers[infrastructure]"]
        IntegrationEventSchemas["IntegrationEventSchemas[infrastructure]"]
        IntegrationRoutes["IntegrationRoutes[infrastructure]"]
        MockPaymentActions["MockPaymentActions[infrastructure]"]
        OrderFulfillmentSaga["OrderFulfillmentSaga[saga]"]
        OrderManagementInfrastructure["OrderManagementInfrastructure[infrastructure]"]
        OrderWithInventoryProjection["OrderWithInventoryProjection[projection]"]
        PaymentOutboxHandler["PaymentOutboxHandler[infrastructure]"]
        ProjectionDeadLetters["ProjectionDeadLetters[infrastructure]"]
        ProjectionDefinitions["ProjectionDefinitions[infrastructure]"]
        RateLimitDefinitions["RateLimitDefinitions[infrastructure]"]
        SagaCompletionHandler["SagaCompletionHandler[infrastructure]"]
        SagaRegistry["SagaRegistry[infrastructure]"]
        SagaRouter["SagaRouter[infrastructure]"]
    end
    ActiveReservationsProjection --> InventoryCommandHandlers
    CommandRegistry --> InventoryCommandHandlers
    CommandRegistry --> OrderCommandHandlers
    CustomerCancellationsProjection --> OrderCommandHandlers
    EventSubscriptionRegistry --> OrderNotificationPM
    EventSubscriptionRegistry --> ReservationReleasePM
    IntegrationRoutes --> OrderCommandHandlers
    InventoryCommandConfigs --> ActiveReservationsProjection
    InventoryCommandConfigs --> OrderWithInventoryProjection
    InventoryCommandConfigs --> ProductCatalogProjection
    InventoryCommandHandlers --> InventoryDeciders
    OrderCommandConfigs --> CustomerCancellationsProjection
    OrderCommandConfigs --> OrderItemsProjection
    OrderCommandConfigs --> OrderSummaryProjection
    OrderCommandConfigs --> OrderWithInventoryProjection
    OrderCommandHandlers --> OrderDeciders
    OrderFulfillmentSaga --> InventoryCommandHandlers
    OrderFulfillmentSaga --> OrderCommandHandlers
    OrderItemsProjection --> OrderCommandHandlers
    OrderNotificationPM --> OrderCommandHandlers
    OrderWithInventoryProjection --> InventoryCommandHandlers
    OrderWithInventoryProjection --> OrderCommandHandlers
    ProductCatalogProjection --> InventoryCommandHandlers
    ReservationReleasePM --> InventoryCommandHandlers
    ReservationReleasePM --> OrderWithInventoryProjection
    SagaCompletionHandler --> SagaRegistry
    SagaRouter --> OrderFulfillmentSaga
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

| Component                                      | Context   | Role            | Layer          | Source File                                                                                    |
| ---------------------------------------------- | --------- | --------------- | -------------- | ---------------------------------------------------------------------------------------------- |
| ✅ Agent Action Handler                         | agent     | command-handler | application    | libar-platform/examples/order-management/convex/contexts/agent/handlers/analyzeEvent.ts        |
|  Churn Risk Pattern Definition                 | agent     | decider         | domain         | libar-platform/examples/order-management/convex/contexts/agent/_patterns/churnRisk.ts          |
| ✅ Agent On Complete Handler                    | agent     | infrastructure  | infrastructure | libar-platform/examples/order-management/convex/contexts/agent/handlers/onComplete.ts          |
|  Churn Risk Agent Configuration                | agent     | infrastructure  | application    | libar-platform/examples/order-management/convex/contexts/agent/_config.ts                      |
|  LLM Configuration and Runtime Exports         | agent     | infrastructure  | infrastructure | libar-platform/examples/order-management/convex/contexts/agent/_llm/index.ts                   |
|  LLM Provider Configuration                    | agent     | infrastructure  | infrastructure | libar-platform/examples/order-management/convex/contexts/agent/_llm/config.ts                  |
|  OpenRouter Agent Runtime                      | agent     | infrastructure  | infrastructure | libar-platform/examples/order-management/convex/contexts/agent/_llm/runtime.ts                 |
|  Agent Approval Workflow Tools                 | agent     | service         | application    | libar-platform/examples/order-management/convex/contexts/agent/tools/approval.ts               |
|  Agent BC Utility Functions                    | agent     | service         | domain         | libar-platform/examples/order-management/convex/contexts/agent/_utils/index.ts                 |
|  Agent Command Emission Tool                   | agent     | service         | application    | libar-platform/examples/order-management/convex/contexts/agent/tools/emitCommand.ts            |
|  Confidence Calculation Utilities for Agent BC | agent     | service         | domain         | libar-platform/examples/order-management/convex/contexts/agent/_utils/confidence.ts            |
|  Customer Utility Functions for Agent BC       | agent     | service         | domain         | libar-platform/examples/order-management/convex/contexts/agent/_utils/customer.ts              |
| ✅ Inventory Domain Events                      | inventory | bounded-context | domain         | libar-platform/examples/order-management/convex/contexts/inventory/domain/events.ts            |
| ✅ Inventory Command Handlers                   | inventory | command-handler | application    | libar-platform/examples/order-management/convex/contexts/inventory/handlers/commands.ts        |
| ✅ Inventory Deciders                           | inventory | decider         | domain         | libar-platform/examples/order-management/convex/contexts/inventory/domain/deciders/index.ts    |
| ✅ Inventory Command Configs                    | inventory | infrastructure  | application    | libar-platform/examples/order-management/convex/commands/inventory/configs.ts                  |
| ✅ Inventory Internal Mutations                 | inventory | infrastructure  | infrastructure | libar-platform/examples/order-management/convex/inventoryInternal.ts                           |
| ✅ Inventory Public API                         | inventory | infrastructure  | infrastructure | libar-platform/examples/order-management/convex/inventory.ts                                   |
| ✅ Active Reservations Projection               | inventory | projection      | application    | libar-platform/examples/order-management/convex/projections/inventory/activeReservations.ts    |
| ✅ Product Catalog Projection                   | inventory | projection      | application    | libar-platform/examples/order-management/convex/projections/inventory/productCatalog.ts        |
| ✅ Order Domain Events                          | orders    | bounded-context | domain         | libar-platform/examples/order-management/convex/contexts/orders/domain/events.ts               |
| ✅ Order Command Handlers                       | orders    | command-handler | application    | libar-platform/examples/order-management/convex/contexts/orders/handlers/commands.ts           |
| ✅ Order Deciders                               | orders    | decider         | domain         | libar-platform/examples/order-management/convex/contexts/orders/domain/deciders/index.ts       |
| ✅ Order Command Configs                        | orders    | infrastructure  | application    | libar-platform/examples/order-management/convex/commands/orders/configs.ts                     |
| ✅ Order Public API                             | orders    | infrastructure  | infrastructure | libar-platform/examples/order-management/convex/orders.ts                                      |
| ✅ Order Notification PM                        | orders    | process-manager | application    | libar-platform/examples/order-management/convex/processManagers/orderNotification.ts           |
| ✅ Reservation Release PM                       | orders    | process-manager | application    | libar-platform/examples/order-management/convex/processManagers/reservationRelease.ts          |
| ✅ Customer Cancellations Projection            | orders    | projection      | application    | libar-platform/examples/order-management/convex/projections/customers/customerCancellations.ts |
| ✅ Order Items Projection                       | orders    | projection      | application    | libar-platform/examples/order-management/convex/projections/orders/orderItems.ts               |
| ✅ Order Summary Projection                     | orders    | projection      | application    | libar-platform/examples/order-management/convex/projections/orders/orderSummary.ts             |
| ✅ App Composition Root                         | -         | infrastructure  | infrastructure | libar-platform/examples/order-management/convex/convex.config.ts                               |
| ✅ Command Registry                             | -         | infrastructure  | infrastructure | libar-platform/examples/order-management/convex/commands/registry.ts                           |
| 🚧 DCB Retry Execution                         | -         | infrastructure  | infrastructure | libar-platform/examples/order-management/convex/dcb/retryExecution.ts                          |
| ✅ Durable Append Action                        | -         | infrastructure  | infrastructure | libar-platform/examples/order-management/convex/eventStore/durableAppend.ts                    |
| ✅ Event Subscription Registry                  | -         | infrastructure  | infrastructure | libar-platform/examples/order-management/convex/eventSubscriptions.ts                          |
| ✅ Integration Dead Letters                     | -         | infrastructure  | infrastructure | libar-platform/examples/order-management/convex/integration/deadLetters.ts                     |
| ✅ Integration Event Handlers                   | -         | infrastructure  | infrastructure | libar-platform/examples/order-management/convex/integration/handlers.ts                        |
| ✅ Integration Event Schemas                    | -         | infrastructure  | infrastructure | libar-platform/examples/order-management/convex/integration/events.ts                          |
| ✅ Integration Routes                           | -         | infrastructure  | infrastructure | libar-platform/examples/order-management/convex/integration/routes.ts                          |
| ✅ Mock Payment Actions                         | -         | infrastructure  | infrastructure | libar-platform/examples/order-management/convex/sagas/payments/actions.ts                      |
| ✅ Order Management Infrastructure              | -         | infrastructure  | infrastructure | libar-platform/examples/order-management/convex/infrastructure.ts                              |
| ✅ Payment Outbox Handler                       | -         | infrastructure  | infrastructure | libar-platform/examples/order-management/convex/sagas/payments/outbox.ts                       |
| ✅ Projection Dead Letters                      | -         | infrastructure  | infrastructure | libar-platform/examples/order-management/convex/projections/deadLetters.ts                     |
| ✅ Projection Definitions                       | -         | infrastructure  | infrastructure | libar-platform/examples/order-management/convex/projections/definitions.ts                     |
| ✅ Rate Limit Definitions                       | -         | infrastructure  | infrastructure | libar-platform/examples/order-management/convex/rateLimits.ts                                  |
| ✅ Saga Completion Handler                      | -         | infrastructure  | infrastructure | libar-platform/examples/order-management/convex/sagas/completion.ts                            |
| ✅ Saga Registry                                | -         | infrastructure  | infrastructure | libar-platform/examples/order-management/convex/sagas/registry.ts                              |
| ✅ Saga Router                                  | -         | infrastructure  | infrastructure | libar-platform/examples/order-management/convex/sagas/router.ts                                |
| ✅ Order With Inventory Projection              | -         | projection      | application    | libar-platform/examples/order-management/convex/projections/crossContext/orderWithInventory.ts |
| ✅ Cross Context Read Model                     | -         | read-model      | application    | libar-platform/examples/order-management/convex/crossContextQueries.ts                         |
| ✅ Order Fulfillment Saga                       | -         | saga            | application    | libar-platform/examples/order-management/convex/sagas/orderFulfillment.ts                      |
