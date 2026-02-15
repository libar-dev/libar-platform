# Component Topology

**Purpose:** Reference document: Component Topology
**Detail Level:** Full reference

---

## Component Topology

Scoped architecture diagram showing component relationships:

```mermaid
graph TB
    subgraph agent["Agent"]
        Churn_Risk_Agent_Configuration["Churn Risk Agent Configuration[infrastructure]"]
        AgentOnCompleteHandler["AgentOnCompleteHandler[infrastructure]"]
        AgentActionHandler["AgentActionHandler[command-handler]"]
    end
    subgraph inventory["Inventory"]
        ProductCatalogProjection["ProductCatalogProjection[projection]"]
        ActiveReservationsProjection["ActiveReservationsProjection[projection]"]
        InventoryCommandConfigs["InventoryCommandConfigs[infrastructure]"]
        InventoryCommandHandlers["InventoryCommandHandlers[command-handler]"]
    end
    subgraph orders["Orders"]
        ReservationReleasePM["ReservationReleasePM[process-manager]"]
        OrderNotificationPM["OrderNotificationPM[process-manager]"]
        OrderSummaryProjection["OrderSummaryProjection[projection]"]
        OrderCommandConfigs["OrderCommandConfigs[infrastructure]"]
        OrderCommandHandlers["OrderCommandHandlers[command-handler]"]
    end
    OrderManagementInfrastructure["OrderManagementInfrastructure"]
    EventSubscriptionRegistry["EventSubscriptionRegistry"]
    AppCompositionRoot["AppCompositionRoot"]
    OrderFulfillmentSaga["OrderFulfillmentSaga"]
    subgraph related["Related"]
        EventStore["EventStore"]:::neighbor
        CommandBus["CommandBus"]:::neighbor
        OrderItemsProjection["OrderItemsProjection"]:::neighbor
        OrderWithInventoryProjection["OrderWithInventoryProjection"]:::neighbor
        CustomerCancellationsProjection["CustomerCancellationsProjection"]:::neighbor
        OrderDeciders["OrderDeciders"]:::neighbor
        InventoryDeciders["InventoryDeciders"]:::neighbor
        AgentLLMIntegration["AgentLLMIntegration"]:::neighbor
        AgentBCComponentIsolation["AgentBCComponentIsolation"]:::neighbor
        AgentAsBoundedContext["AgentAsBoundedContext"]:::neighbor
    end
    OrderManagementInfrastructure --> EventStore
    OrderManagementInfrastructure --> CommandBus
    EventSubscriptionRegistry --> OrderNotificationPM
    EventSubscriptionRegistry --> ReservationReleasePM
    EventSubscriptionRegistry --> AgentAsBoundedContext
    EventSubscriptionRegistry --> AgentLLMIntegration
    OrderFulfillmentSaga --> OrderCommandHandlers
    OrderFulfillmentSaga --> InventoryCommandHandlers
    ReservationReleasePM --> InventoryCommandHandlers
    ReservationReleasePM --> OrderWithInventoryProjection
    OrderNotificationPM --> OrderCommandHandlers
    OrderSummaryProjection --> EventStore
    ProductCatalogProjection --> InventoryCommandHandlers
    ActiveReservationsProjection --> InventoryCommandHandlers
    Churn_Risk_Agent_Configuration --> AgentAsBoundedContext
    OrderCommandConfigs --> OrderSummaryProjection
    OrderCommandConfigs --> OrderWithInventoryProjection
    OrderCommandConfigs --> OrderItemsProjection
    OrderCommandConfigs --> CustomerCancellationsProjection
    InventoryCommandConfigs --> ActiveReservationsProjection
    InventoryCommandConfigs --> ProductCatalogProjection
    InventoryCommandConfigs --> OrderWithInventoryProjection
    OrderCommandHandlers --> OrderDeciders
    AgentOnCompleteHandler --> AgentAsBoundedContext
    AgentOnCompleteHandler --> AgentLLMIntegration
    AgentActionHandler --> AgentLLMIntegration
    AgentActionHandler --> AgentBCComponentIsolation
    InventoryCommandHandlers --> InventoryDeciders
    OrderItemsProjection --> OrderCommandHandlers
    OrderWithInventoryProjection --> OrderCommandHandlers
    OrderWithInventoryProjection --> InventoryCommandHandlers
    CustomerCancellationsProjection --> OrderCommandHandlers
    AgentLLMIntegration -.-> AgentBCComponentIsolation
    AgentBCComponentIsolation -.-> AgentAsBoundedContext
    classDef neighbor stroke-dasharray: 5 5
```

---

## API Types

### OrderFulfillmentArgs (interface)

/\*\*

- Saga arguments (what triggers the saga).
  \*/

```typescript
interface OrderFulfillmentArgs {
  orderId: string;
  customerId: string;
  items: Array<{
    productId: string;
    productName: string;
    quantity: number;
    unitPrice: number;
  }>;
  totalAmount: number;
  /** Correlation ID from triggering event for distributed tracing */
  correlationId: string;
}
```

| Property      | Description                                                  |
| ------------- | ------------------------------------------------------------ |
| correlationId | Correlation ID from triggering event for distributed tracing |

### OrderFulfillmentResult (interface)

/\*\*

- Saga result.
  \*/

```typescript
interface OrderFulfillmentResult {
  status: "completed" | "compensated";
  reservationId?: string;
  reason?: string;
}
```

### CHURN_RISK_AGENT_ID (const)

/\*\*

- Agent identifier used for checkpoints, subscriptions, and audit.
  \*/

```typescript
CHURN_RISK_AGENT_ID = "churn-risk-agent" as const;
```

### CHURN_RISK_SUBSCRIPTIONS (const)

/\*\*

- Event types the churn risk agent subscribes to.
  \*/

```typescript
CHURN_RISK_SUBSCRIPTIONS = [
  "OrderCancelled",
  // Future: "OrderRefunded", "OrderComplaintFiled"
] as const;
```

### churnRiskAgentConfig (const)

/\*\*

- Churn risk agent configuration.
-
- Detects customer churn risk by analyzing cancellation patterns:
- - Window: 30 days
- - Trigger: 3+ cancellation events
- - Confidence threshold: 0.8 for auto-execution
-
- @example
- ```typescript

  ```

- // Use in subscription registration
- const subscription = createAgentSubscription(churnRiskAgentConfig, {
- actionHandler: internal.contexts.agent.handlers.analyzeEvent.analyzeChurnRiskEvent,
- });
- ```
  */
  ```

```typescript
const churnRiskAgentConfig: AgentBCConfig;
```

---
