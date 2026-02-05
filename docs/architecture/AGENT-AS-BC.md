# Agent as Bounded Context

> AI agents as first-class bounded contexts that subscribe to domain events and emit commands autonomously.

## Overview

The Agent as Bounded Context pattern treats AI agents as reactive event consumers within the event-sourced architecture. Like other bounded contexts (Orders, Inventory), agents:

- Subscribe to events via EventBus
- Maintain internal state (checkpoints)
- Emit commands based on detected patterns
- Integrate with the Command Bus for downstream processing

### Problem Statement

Traditional approaches to AI integration face several challenges:

| Challenge         | Traditional Approach    | Agent BC Approach            |
| ----------------- | ----------------------- | ---------------------------- |
| Event access      | Ad-hoc polling/webhooks | Native EventBus subscription |
| State management  | External databases      | Built-in checkpoint pattern  |
| Explainability    | Black box decisions     | Audit trail with reasoning   |
| Reliability       | Fire-and-forget         | Workpool-based durability    |
| Approval workflow | Manual intervention     | Configurable human-in-loop   |

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              EventBus                                       │
│         (publishes OrderCancelled, OrderRefunded, etc.)                    │
└───────────────────────────────────┬─────────────────────────────────────────┘
                                    │ subscribe (priority: 250)
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          Agent BC                                           │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                     Event Handler (Mutation)                         │  │
│  │                                                                      │  │
│  │  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐              │  │
│  │  │  Checkpoint │───▶│   Pattern   │───▶│   Decision  │              │  │
│  │  │    Check    │    │   Trigger   │    │    Logic    │              │  │
│  │  └─────────────┘    └─────────────┘    └─────────────┘              │  │
│  │         │                  │                  │                      │  │
│  │         ▼                  ▼                  ▼                      │  │
│  │  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐              │  │
│  │  │    Skip     │    │    Load     │    │   Emit or   │              │  │
│  │  │  Duplicate  │    │   History   │    │   Approve   │              │  │
│  │  └─────────────┘    └─────────────┘    └─────────────┘              │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐                   │
│  │  Checkpoints  │  │  Dead Letter  │  │   Approvals   │                   │
│  │    (State)    │  │    Queue      │  │   (Pending)   │                   │
│  └───────────────┘  └───────────────┘  └───────────────┘                   │
└───────────────────────────────────┬─────────────────────────────────────────┘
                                    │ emit command (with metadata)
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Command Bus                                       │
│           (routes SuggestCustomerOutreach to appropriate handler)          │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Key Concepts

### Agent BC vs Regular BC

| Aspect                | Regular BC               | Agent BC                       |
| --------------------- | ------------------------ | ------------------------------ |
| State source          | CMS tables               | Checkpoint + event history     |
| Decision logic        | Pure deciders            | Rules + optional LLM           |
| Command emission      | Explicit via handler     | Autonomous with explainability |
| State mutations       | Dual-write (CMS + event) | Checkpoint update only         |
| Subscription priority | Varies                   | 250 (after projections/PMs)    |

### Event Subscription

Agents subscribe to events via the EventBus using `createAgentSubscription`:

```typescript
import { createAgentSubscription } from "@libar-dev/platform-bus/agent-subscription";

const subscription = createAgentSubscription(agentConfig, {
  handler: internal.agents.churnRisk.handleEvent,
  onComplete: internal.agents.churnRisk.onComplete,
  priority: 250, // After projections (100) and PMs (200)
});

// Register with EventBus
registry.add(subscription);
```

### Pattern Detection

Patterns define when the agent should analyze events:

```typescript
import { definePattern, PatternTriggers } from "@libar-dev/platform-core/agent";

const churnRiskPattern = definePattern({
  name: "churn-risk",
  description: "Detect customer churn based on cancellations",

  window: {
    duration: "30d", // Look back 30 days
    minEvents: 3, // Require at least 3 events
    eventLimit: 100, // Max events to load
  },

  // Fast rule-based trigger
  trigger: PatternTriggers.all(
    PatternTriggers.eventTypePresent(["OrderCancelled"], 3),
    PatternTriggers.countThreshold(3)
  ),

  // Optional LLM analysis for complex patterns
  analyze: async (events, agent) => {
    const result = await agent.analyze(prompt, events);
    return {
      detected: result.confidence > 0.7,
      confidence: result.confidence,
      reasoning: result.reasoning,
      matchingEventIds: events.map((e) => e.eventId),
    };
  },
});
```

### Command Emission

Agents emit commands with full explainability metadata:

```typescript
const command = createEmittedAgentCommand(
  "churn-risk-agent", // agentId
  "SuggestCustomerOutreach", // command type
  { customerId, riskLevel }, // payload
  0.85, // confidence
  "3 cancellations in 30 days", // reason
  ["evt-1", "evt-2", "evt-3"] // triggering events
);

// Command includes metadata for audit trail:
// - agentId: Which agent made the decision
// - decisionId: Unique ID for correlation
// - confidence: Score for approval routing
// - reason: Human-readable explanation
// - eventIds: Events that triggered the decision
```

## Integration with @convex-dev/agent

For LLM-powered analysis, integrate with `@convex-dev/agent`:

```typescript
import { Agent } from "@convex-dev/agent";

const agent = new Agent(components.agent, {
  model: openai.chat("gpt-4o"),
  instructions: "Analyze customer behavior for churn risk...",
});

// Use in pattern analyzer
analyze: async (events, agentInterface) => {
  const thread = await agent.createThread(ctx, { userId });

  const result = await thread.generateText({
    prompt: buildAnalysisPrompt(events),
  });

  return parseAnalysisResult(result);
},
```

## Execution Models

### Workpool-Based (Recommended)

Use Workpool for most agent processing:

```typescript
// Events are delivered via Workpool for:
// - Parallelism control (maxConcurrent: 5)
// - Partition-ordered processing (by streamId)
// - Retry with exponential backoff
// - Dead letter handling

const subscription = createAgentSubscription(config, {
  handler: internal.agents.churnRisk.handleEvent,
  onComplete: internal.agents.churnRisk.onComplete,
});
```

### Workflow-Based (For Approvals)

Use Workflow when human approval is required:

```typescript
import { WorkflowManager } from "@convex-dev/workflow";

const workflow = new WorkflowManager(components.workflow);

// Define approval workflow
export const approvalWorkflow = workflow.define({
  args: { approvalId: v.string() },
  handler: async (ctx, { approvalId }) => {
    // Wait for human decision (external event)
    const decision = await ctx.waitForEvent("approval-decision", {
      timeoutMs: 24 * 60 * 60 * 1000, // 24h
    });

    if (decision.approved) {
      await ctx.runMutation(internal.agents.executeApprovedAction, {
        approvalId,
        reviewerId: decision.reviewerId,
      });
    }

    return decision;
  },
});
```

## Checkpoint Pattern

Checkpoints track the agent's position in the event stream:

```typescript
interface AgentCheckpoint {
  agentId: string;
  subscriptionId: string;
  lastProcessedPosition: number; // Global position for idempotency
  lastEventId: string; // For causation tracking
  status: "active" | "paused" | "stopped";
  eventsProcessed: number;
  updatedAt: number;
}

// Initial checkpoint uses sentinel value
const checkpoint = createInitialAgentCheckpoint(agentId, subscriptionId);
// checkpoint.lastProcessedPosition === -1 (all events have position >= 0)

// Check if event should be processed
if (shouldProcessAgentEvent(event.globalPosition, checkpoint.lastProcessedPosition)) {
  // Process event...
  // Update checkpoint with new position
}
```

## Human-in-Loop Configuration

Configure when human approval is required:

```typescript
const config: AgentBCConfig = {
  // ...
  confidenceThreshold: 0.8, // Auto-execute above 0.8

  humanInLoop: {
    confidenceThreshold: 0.9, // Flag below 0.9 for review

    // These always require approval
    requiresApproval: ["DeleteCustomer", "RefundOrder"],

    // These never require approval
    autoApprove: ["LogEvent", "UpdateMetrics"],

    approvalTimeout: "24h", // Expire after 24 hours
  },
};

// Determination logic:
// 1. If action in requiresApproval -> require approval
// 2. If action in autoApprove -> auto-execute
// 3. If confidence < confidenceThreshold -> require approval
// 4. Otherwise -> auto-execute
```

## Rate Limiting

Control LLM API costs and prevent abuse:

```typescript
const config: AgentBCConfig = {
  // ...
  rateLimits: {
    maxRequestsPerMinute: 60,
    maxConcurrent: 5,
    queueDepth: 100, // Max pending events before backpressure

    costBudget: {
      daily: 10.0, // $10/day limit
      alertThreshold: 0.8, // Alert at 80% usage
    },
  },
};
```

## Audit Trail

All decisions are audited for compliance and debugging:

```typescript
// AgentDecisionMade audit event
{
  eventType: "AgentDecisionMade",
  agentId: "churn-risk-agent",
  decisionId: "dec_123_abc",
  timestamp: 1699567890123,
  payload: {
    patternDetected: "churn-risk",
    confidence: 0.85,
    reasoning: "Customer cancelled 3 orders in 30 days",
    action: {
      type: "SuggestCustomerOutreach",
      executionMode: "auto-execute",
    },
    triggeringEvents: ["evt-1", "evt-2", "evt-3"],
    llmContext: {
      model: "gpt-4o",
      tokens: 1500,
      duration: 2500,
    },
  },
}
```

## Example Implementation

See the order-management example for a complete implementation:

```
examples/order-management/convex/contexts/agent/
├── index.ts              # Exports and documentation
├── config.ts             # Agent configuration
├── patterns/
│   └── churnRisk.ts      # Pattern definitions
├── handlers/
│   ├── eventHandler.ts   # Main event processing
│   └── onComplete.ts     # Workpool completion handler
└── tools/
    └── emitCommand.ts    # Command emission utilities
```

### Quick Start

1. Define agent configuration:

```typescript
// config.ts
export const myAgentConfig: AgentBCConfig = {
  id: "my-agent",
  subscriptions: ["EventTypeA", "EventTypeB"],
  patternWindow: { duration: "7d", minEvents: 2 },
  confidenceThreshold: 0.8,
  onEvent: async (event, ctx) => {
    // Analyze and return decision
    return {
      command: "MyCommand",
      payload: { ... },
      confidence: 0.85,
      reason: "...",
      requiresApproval: false,
      triggeringEvents: [event.eventId],
    };
  },
};
```

2. Create handler mutation:

```typescript
// handlers/eventHandler.ts
export const handleEvent = internalMutation({
  args: { /* AgentEventHandlerArgs */ },
  handler: async (ctx, args) => {
    const handler = createAgentEventHandler({ config, runtime, ... });
    return handler(toPublishedEvent(args), checkpoint);
  },
});
```

3. Register subscription:

```typescript
// subscriptions.ts
const subscription = createAgentSubscription(myAgentConfig, {
  handler: internal.agents.myAgent.handleEvent,
});
```

## API Reference

### Core Types

| Type                  | Description                    |
| --------------------- | ------------------------------ |
| `AgentBCConfig`       | Full agent configuration       |
| `AgentDecision`       | Decision output from onEvent   |
| `PatternDefinition`   | Pattern detection rules        |
| `AgentCheckpoint`     | Position tracking state        |
| `EmittedAgentCommand` | Command with explainability    |
| `PendingApproval`     | Human-in-loop approval request |

### Factory Functions

| Function                      | Description                     |
| ----------------------------- | ------------------------------- |
| `createAgentSubscription()`   | Create EventBus subscription    |
| `createAgentEventHandler()`   | Create event processing handler |
| `definePattern()`             | Define validated pattern        |
| `createEmittedAgentCommand()` | Create command with metadata    |
| `createPendingApproval()`     | Create approval request         |
| `initializeAgentBC()`         | Initialize agent lifecycle      |

### Pattern Triggers

| Trigger                                      | Description                         |
| -------------------------------------------- | ----------------------------------- |
| `PatternTriggers.countThreshold(n)`          | Fire when n events present          |
| `PatternTriggers.eventTypePresent(types, n)` | Fire when n events of types present |
| `PatternTriggers.multiStreamPresent(n)`      | Fire when events from n streams     |
| `PatternTriggers.all(...triggers)`           | AND combination                     |
| `PatternTriggers.any(...triggers)`           | OR combination                      |

## Best Practices

1. **Start with rules, add LLM later** - Rule-based triggers are faster and cheaper. Add LLM analysis only for complex patterns.

2. **Use appropriate confidence thresholds** - High-impact actions should require higher confidence or human approval.

3. **Implement dead letter handling** - Always provide onComplete handler for error tracking.

4. **Partition by entity** - Use streamId partitioning for entity-ordered processing.

5. **Monitor costs** - Set rate limits and cost budgets for LLM-based analysis.

6. **Audit everything** - Record all decisions for compliance and debugging.

## Related Patterns

- [Event Subscription](./EVENT-SUBSCRIPTION.md) - EventBus mechanics
- [Process Manager](./PROCESS-MANAGER.md) - Event-driven coordination
- [Saga](./SAGA.md) - Compensation workflows
- [Workpool](./WORKPOOL.md) - Durable job processing
