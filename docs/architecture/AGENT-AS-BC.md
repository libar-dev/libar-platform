# Agent as Bounded Context

> AI agents as first-class bounded contexts that subscribe to domain events and emit commands autonomously.

## Overview

The Agent as Bounded Context pattern treats AI agents as reactive event consumers within the event-sourced architecture. Like other bounded contexts (Orders, Inventory), agents:

- Subscribe to events via EventBus
- Maintain internal state (checkpoints) in a **physically isolated Convex component**
- Emit commands via the CommandOrchestrator (same infrastructure as domain commands)
- Support both rule-based and LLM-powered analysis via the action/mutation split
- Expose a lifecycle FSM for operational control (start, pause, resume, stop, reconfigure)

### Problem Statement

Traditional approaches to AI integration face several challenges:

| Challenge         | Traditional Approach      | Agent BC Approach                  |
| ----------------- | ------------------------- | ---------------------------------- |
| Event access      | Ad-hoc polling/webhooks   | Native EventBus subscription       |
| State management  | External databases        | Isolated component tables          |
| LLM integration   | Mutations can't call APIs | Action/mutation split via Workpool |
| Explainability    | Black box decisions       | Audit trail with reasoning         |
| Reliability       | Fire-and-forget           | Workpool-based durability          |
| Approval workflow | Manual intervention       | Configurable human-in-loop         |
| Cost control      | No guardrails             | Rate limiter + cost budget         |
| Fault isolation   | Cascade failures          | Circuit breaker + fallback         |

## Architecture

The agent BC is a physically isolated Convex component with its own database, mounted as a peer alongside infrastructure components. Three peer mounts provide the agent subsystem:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      convex.config.ts (App Level)                          │
│                                                                             │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐      │
│  │  Event Store  │ │ Command Bus  │ │  Workflow     │ │ Rate Limiter │      │
│  └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘      │
│                                                                             │
│  ┌─────────────────────── Agent Infrastructure ───────────────────────┐    │
│  │                                                                     │    │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐             │    │
│  │  │   agentBC     │  │  llmAgent    │  │  agentPool   │             │    │
│  │  │  (Component)  │  │ @convex-dev/ │  │  (Workpool)  │             │    │
│  │  │  5 tables     │  │   agent      │  │  max‖: 10    │             │    │
│  │  └──────────────┘  └──────────────┘  └──────────────┘             │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐                        │
│  │  Orders BC   │ │ Inventory BC │ │projectionPool│                        │
│  └──────────────┘ └──────────────┘ └──────────────┘                        │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Component Isolation

Agent tables live in the `agentBC` Convex component — the parent app **cannot** access them via `ctx.db.query()`. All access goes through the component's public API:

```typescript
// convex.config.ts
import agentBC from "@libar-dev/platform-core/agent/convex.config";
import agent from "@convex-dev/agent/convex.config";
import { workpool } from "@convex-dev/workpool";

app.use(agentBC); // Agent component (5 isolated tables)
app.use(agent, { name: "llmAgent" }); // @convex-dev/agent for LLM threads
app.use(workpool, { name: "agentPool" }); // Dedicated pool for agent actions
```

### Component Tables

| Table              | Purpose                                      | Key Indexes                              |
| ------------------ | -------------------------------------------- | ---------------------------------------- |
| `agentCheckpoints` | Position tracking for exactly-once semantics | `by_agentId_subscriptionId`, `by_status` |
| `agentAuditEvents` | Decision audit trail (16 event types)        | `by_agentId_timestamp`, `by_decisionId`  |
| `agentCommands`    | Persisted commands with lifecycle tracking   | `by_agentId_status`, `by_decisionId`     |
| `pendingApprovals` | Human-in-loop approval workflow              | `by_approvalId`, `by_status_expiresAt`   |
| `agentDeadLetters` | Failed event processing                      | `by_agentId_status`, `by_eventId`        |

## Action/Mutation Split

The fundamental Convex constraint: **mutations cannot call external APIs** (no `fetch`, no LLM calls). **Actions can call APIs but cannot write to the database directly.** The Workpool's `onComplete` callback bridges this gap.

```
EventBus
   │
   ▼
agentPool.enqueueAction(analyzeEvent, args, { onComplete })
   │
   ▼
┌─────────────────────────────────────────────────────┐
│              ACTION: analyzeEvent                     │
│                                                       │
│  1. Load checkpoint via ctx.runQuery()                │
│  2. Check idempotency (skip if position ≤ checkpoint) │
│  3. Load event history via cross-component query      │
│  4. Evaluate pattern triggers (cheap, no LLM)         │
│  5. If triggered → call LLM analysis (external API)   │
│     If rate limited/circuit open → rule-based fallback │
│  6. Return AgentActionResult (NO DB writes)           │
└──────────────────────┬──────────────────────────────┘
                       │ Workpool delivers result
                       ▼
┌─────────────────────────────────────────────────────┐
│           MUTATION: onComplete                       │
│                                                       │
│  7. Validate decision                                 │
│  8. Record audit event → agentBC component            │
│  9. Persist command → agentBC component               │
│  10. Create pending approval (if confidence < thresh)  │
│  11. Update checkpoint LAST (OCC conflict detection)  │
│  12. Schedule command routing (if auto-execute)        │
│  13. Dead letter on failure (NO-THROW zone)           │
└─────────────────────────────────────────────────────┘
```

### Two Handler Factories

| Factory                      | Returns            | Can Call LLM          | Used For                 |
| ---------------------------- | ------------------ | --------------------- | ------------------------ |
| `createAgentEventHandler()`  | `onEvent` callback | No (mutation context) | Rule-only agents, no LLM |
| `createAgentActionHandler()` | Action handler     | Yes (action context)  | LLM-integrated agents    |

`createAgentEventHandler` is **not removed** — it serves rule-only agents. The action handler reuses existing pure logic (pattern window filtering, minimum event check, approval determination).

### EventBus Subscription Types

`EventSubscription` is now a discriminated union:

```typescript
// Existing: mutation-based (projections, sagas, process managers)
interface MutationSubscription {
  handlerType?: "mutation"; // Optional for backward compatibility
  handler: FunctionReference<"mutation", ...>;
  onComplete?: FunctionReference<"mutation", ...>;
}

// New: action-based (agent LLM handlers)
interface ActionSubscription {
  handlerType: "action"; // Required discriminant
  actionHandler: FunctionReference<"action", ...>;
  onComplete: FunctionReference<"mutation", ...>; // REQUIRED (actions can't persist)
  retry?: boolean | { maxAttempts: number; initialBackoffMs: number; base: number };
  pool?: WorkpoolClient; // Dedicated agentPool
}

type EventSubscription = MutationSubscription | ActionSubscription;
```

## Event Subscription

Create subscriptions using `createAgentSubscription` (mutation) or `createAgentActionSubscription` (action):

```typescript
import {
  createAgentSubscription,
  createAgentActionSubscription,
} from "@libar-dev/platform-bus/agent-subscription";

// Rule-only agent (mutation handler)
const ruleSubscription = createAgentSubscription(agentConfig, {
  handler: internal.contexts.agent.handlers.eventHandler.handleEvent,
  onComplete: internal.contexts.agent.handlers.onComplete.handleOnComplete,
  priority: 250,
});

// LLM-powered agent (action handler + dedicated pool)
const llmSubscription = createAgentActionSubscription(agentConfig, {
  actionHandler: internal.contexts.agent.handlers.analyzeEvent.analyzeEvent,
  onComplete: internal.contexts.agent.handlers.onComplete.handleOnComplete,
  retry: { maxAttempts: 3, initialBackoffMs: 1000, base: 2 },
  pool: agentPool, // Dedicated pool, separate from projectionPool
  priority: 250,
});
```

### Dedicated Agent Workpool

The `agentPool` is separate from `projectionPool` to prevent slow LLM actions (1-5s) from blocking time-critical projection updates:

```typescript
// pools.ts — leaf module with no domain imports
export const agentPool: WorkpoolClient = new Workpool(components.agentPool, {
  maxParallelism: 10,
  retryActionsByDefault: true,
  defaultRetryBehavior: { maxAttempts: 3, initialBackoffMs: 1000, base: 2 },
  logLevel: "INFO",
});
```

## Pattern Detection

Patterns define when an agent should analyze events. Two modes are supported (XOR):

### Pattern-Based (Recommended)

Use `PatternDefinition` array with a unified trigger + analyze flow:

```typescript
import { definePattern, PatternTriggers } from "@libar-dev/platform-core/agent";

const churnRiskPattern = definePattern({
  name: "churn-risk",
  description: "Detect customer churn based on cancellations",

  window: {
    duration: "30d",
    minEvents: 3,
    eventLimit: 100,
  },

  // Fast rule-based trigger (cheap, no LLM)
  trigger: PatternTriggers.all(
    PatternTriggers.eventTypePresent(["OrderCancelled"], 3),
    PatternTriggers.countThreshold(3)
  ),

  // LLM analysis for complex patterns (only called if trigger fires)
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

### onEvent (Legacy)

Inline handler for simple rule-only agents:

```typescript
const config: AgentBCConfig = {
  id: "simple-agent",
  subscriptions: ["OrderCancelled"],
  patternWindow: { duration: "7d", minEvents: 2 },
  confidenceThreshold: 0.8,
  onEvent: async (event, ctx) => {
    // Rule-based analysis only (no LLM)
    return { command: "MyCommand", payload: {}, confidence: 0.9, ... };
  },
};
```

> **Exactly one** of `onEvent` or `patterns` must be set — the validator rejects configs with both or neither.

### Pattern Registry Validation

Pattern arrays are validated at initialization:

```typescript
import { validatePatternDefinitions } from "@libar-dev/platform-core/agent";

const result = validatePatternDefinitions(config.patterns);
// Checks: no duplicate names, each pattern has trigger/window, names non-empty
```

### Pattern Executor

The `executePatterns()` function runs patterns in priority order and returns a summary:

```typescript
import { executePatterns } from "@libar-dev/platform-core/agent";

const summary: PatternExecutionSummary = await executePatterns(patterns, events, agent);
// summary.matchedPattern — name of first matching pattern (or null)
// summary.decision — AgentDecision (or null if no match)
// summary.analysisMethod — "llm" | "rule-based" | "rule-based-fallback"
```

## Command Routing

Agent-emitted commands flow through the existing `CommandOrchestrator` infrastructure — same audit trail, idempotency, and middleware as domain commands.

```
Agent detects pattern
       │
       ▼
onComplete persists command to agentBC component
       │
       ▼
ctx.scheduler.runAfter(0, routeCommandRef, args)
       │
       ▼
┌─────────────────────────────────────────────────┐
│              Command Bridge                      │
│                                                   │
│  1. Look up route in AgentCommandRouteMap         │
│  2. Transform args via route.toOrchestratorArgs() │
│  3. Resolve CommandConfig from CommandRegistry    │
│  4. Call CommandOrchestrator.execute()             │
│  5. Record audit (AgentCommandRouted/Failed)      │
│  6. Update command status                         │
└─────────────────────────────────────────────────┘
       │
       ▼
Target BC handler (e.g., customerOutreach)
```

### Route Registration

```typescript
// Command routes map agent command types to BC handlers
const agentCommandRoutes: AgentCommandRouteMap = {
  SuggestCustomerOutreach: {
    boundedContext: "customers",
    commandConfig: "SuggestCustomerOutreach",
    toOrchestratorArgs: (ctx: RoutingContext) => ({
      customerId: ctx.payload.customerId,
      suggestedAction: ctx.payload.suggestedAction,
      riskLevel: ctx.payload.riskLevel,
      triggeringPatternId: ctx.patternId,
    }),
  },
};
```

## Lifecycle FSM

Agents have a formal state machine for operational control. The FSM is a pure module with no I/O:

```
                    ┌──────────────────────┐
                    │                      │
                    ▼                      │
stopped ──START──▶ active ──PAUSE──▶ paused
                    │    ◀──RESUME──  │
                    │                  │
            RECONFIGURE               RECONFIGURE
              (self)                    │
                    │                  │
                    ├──STOP──▶ stopped ◀──STOP──┘
                    │
          ENTER_ERROR_RECOVERY
                    │
                    ▼
              error_recovery ──RECOVER──▶ active
                    │
                    └──STOP──▶ stopped
```

### States

| State            | Description                                | Allowed Transitions                                         |
| ---------------- | ------------------------------------------ | ----------------------------------------------------------- |
| `stopped`        | Not processing events                      | → `active` (START)                                          |
| `active`         | Processing events normally                 | → `paused`, `stopped`, `error_recovery`, self (RECONFIGURE) |
| `paused`         | Temporarily halted, checkpoint preserved   | → `active` (RESUME/RECONFIGURE), `stopped`                  |
| `error_recovery` | Automatic recovery after repeated failures | → `active` (RECOVER), `stopped`                             |

### Lifecycle Commands

| Command            | Transition             | Effect                                         |
| ------------------ | ---------------------- | ---------------------------------------------- |
| `StartAgent`       | stopped → active       | Activate EventBus subscription from checkpoint |
| `PauseAgent`       | active → paused        | Stop processing, preserve checkpoint           |
| `ResumeAgent`      | paused → active        | Resume from last checkpoint position           |
| `StopAgent`        | any → stopped          | Stop and clear subscription                    |
| `ReconfigureAgent` | active/paused → active | Update config without losing state             |

`error_recovery` is triggered **automatically** by the framework after repeated failures (not by commands). After a configurable cooldown, the agent auto-resumes.

```typescript
import { transitionState, getValidEvents } from "@libar-dev/platform-core/agent";

// Pure function — no I/O
const nextState = transitionState("active", "PAUSE");
// nextState === "paused"

const invalidTransition = transitionState("stopped", "PAUSE");
// invalidTransition === null (invalid)

const validEvents = getValidEvents("active");
// ["PAUSE", "STOP", "ENTER_ERROR_RECOVERY", "RECONFIGURE"]
```

## @convex-dev/agent Integration

For LLM-powered analysis, the platform uses a **hybrid approach**:

| Responsibility              | Provider            |
| --------------------------- | ------------------- |
| Thread management           | `@convex-dev/agent` |
| Tool execution              | `@convex-dev/agent` |
| Model abstraction           | `@convex-dev/agent` |
| EventBus subscription       | Platform            |
| Pattern detection triggers  | Platform            |
| Checkpoint/audit infra      | Platform            |
| Rate limiting + cost budget | Platform            |

### Thread Adapter

The thread adapter bridges the platform's `AgentInterface` to any `generateText`-compatible function, keeping `platform-core` decoupled from the agent SDK:

```typescript
import { createThreadAdapter } from "@libar-dev/platform-core/agent";

const adapter = createThreadAdapter({
  generateText: async (prompt: string) => {
    // Wire to @convex-dev/agent or any LLM provider
    const result = await agent.generateText(ctx, { threadId }, { prompt });
    return { text: result.text, usage: result.usage };
  },
  defaultModel: "gpt-4o",
  logger,
});

// adapter implements AgentInterface { analyze, reason }
```

## Checkpoint Pattern

Checkpoints track the agent's position in the event stream. They live in the `agentBC` component:

```typescript
interface AgentCheckpoint {
  agentId: string;
  subscriptionId: string;
  lastProcessedPosition: number; // Global position for idempotency
  lastEventId: string;
  status: "active" | "paused" | "stopped" | "error_recovery";
  eventsProcessed: number;
  updatedAt: number;
  configOverrides?: unknown; // Runtime config overrides via ReconfigureAgent
}

// Access via component API (NOT ctx.db.query)
const checkpoint = await ctx.runQuery(components.agentBC.checkpoints.getByAgentAndSubscription, {
  agentId: "churn-risk-agent",
  subscriptionId: "sub_churn-risk-agent_...",
});
```

### Idempotency

```typescript
import { shouldProcessAgentEvent } from "@libar-dev/platform-core/agent";

// True only if event.globalPosition > checkpoint.lastProcessedPosition
if (shouldProcessAgentEvent(event.globalPosition, checkpoint.lastProcessedPosition)) {
  // Process event...
}
```

### Config Resolution

Runtime config overrides are merged with the base `AgentBCConfig`:

```typescript
import { resolveEffectiveConfig } from "@libar-dev/platform-core/agent";

const effective = resolveEffectiveConfig(baseConfig, checkpoint.configOverrides);
// Allows threshold changes without redeployment
```

## Human-in-Loop Configuration

Configure when human approval is required:

```typescript
const config: AgentBCConfig = {
  // ...
  confidenceThreshold: 0.8, // Auto-execute above 0.8

  humanInLoop: {
    confidenceThreshold: 0.9, // Flag below 0.9 for review
    requiresApproval: ["DeleteCustomer", "RefundOrder"], // Always require approval
    autoApprove: ["LogEvent", "UpdateMetrics"], // Never require approval
    approvalTimeout: "24h",
  },
};

// Determination logic:
// 1. If action in requiresApproval → require approval
// 2. If action in autoApprove → auto-execute
// 3. If confidence < humanInLoop.confidenceThreshold → require approval
// 4. Otherwise → auto-execute
```

Approval records live in the `pendingApprovals` table of the `agentBC` component:

```
Agent Decision (confidence < threshold)
        │
        ▼
 pendingApprovals (status: pending)
        │
   ┌────┴────┐────────────────────┐
   ▼         ▼                    ▼
Approved   Rejected           Expired (cron)
   │         │
   ▼         ▼
Command    Audit Only
Routed    (no action)
```

## Rate Limiting

Controls LLM API costs and prevents abuse. Uses `@convex-dev/rate-limiter` (token bucket) plus a custom cost budget tracker:

```typescript
const config: AgentBCConfig = {
  // ...
  rateLimits: {
    maxRequestsPerMinute: 60, // Token bucket via @convex-dev/rate-limiter
    maxConcurrent: 5, // Workpool maxParallelism
    queueDepth: 100, // Max pending before dead letter

    costBudget: {
      daily: 10.0, // $10/day hard limit
      alertThreshold: 0.8, // Alert at 80% usage
    },
  },
};
```

| Rate Limit Type   | Mechanism                                 | Action When Exceeded |
| ----------------- | ----------------------------------------- | -------------------- |
| Requests/minute   | Token bucket (`@convex-dev/rate-limiter`) | Queue for retry      |
| Concurrent calls  | Workpool `maxParallelism`                 | Natural backpressure |
| Daily cost budget | Custom tracker (agent component)          | Pause agent          |
| Queue overflow    | Workpool `queueDepth`                     | Dead letter          |

### Circuit Breaker

The circuit breaker prevents cascade failures from LLM outages:

```typescript
import { checkCircuit, recordSuccess, recordFailure } from "@libar-dev/platform-core";

const state = checkCircuit("llm-provider"); // "closed" | "open" | "half-open"

if (state === "open") {
  // Skip LLM call, fall back to rule-based analysis
  // Decision audit records analysisMethod: "rule-based-fallback"
}
```

> **Convex limitation:** The in-memory circuit breaker resets per function invocation. It's useful within a single action making multiple sequential LLM calls. Cross-invocation circuit breaking requires table-backed state (future Phase 18).

## Audit Trail

All decisions are audited with 16 event types. Records live in the `agentBC` component's `agentAuditEvents` table:

```typescript
// PatternDetected audit event (formerly AgentDecisionMade)
{
  eventType: "PatternDetected",
  agentId: "churn-risk-agent",
  decisionId: "dec_123_abc",
  timestamp: 1699567890123,
  payload: {
    patternDetected: "churn-risk",
    confidence: 0.85,
    reasoning: "Customer cancelled 3 orders in 30 days",
    analysisMethod: "llm",         // "llm" | "rule-based" | "rule-based-fallback"
    action: {
      type: "SuggestCustomerOutreach",
      executionMode: "auto-execute", // or "requires-approval"
    },
    triggeringEvents: ["evt-1", "evt-2", "evt-3"],
    llmContext: {
      model: "gpt-4o",
      tokens: 1500,
      durationMs: 2500,
    },
  },
}
```

### Audit Event Types

| Category          | Event Types                                                                                                     |
| ----------------- | --------------------------------------------------------------------------------------------------------------- |
| Pattern detection | `PatternDetected`                                                                                               |
| Approvals         | `ApprovalRequested`, `ApprovalGranted`, `ApprovalRejected`, `ApprovalExpired`                                   |
| Command lifecycle | `CommandEmitted`, `AgentCommandRouted`, `AgentCommandRoutingFailed`                                             |
| Agent lifecycle   | `AgentStarted`, `AgentPaused`, `AgentResumed`, `AgentStopped`, `AgentReconfigured`, `AgentErrorRecoveryStarted` |
| Infrastructure    | `CheckpointUpdated`, `DeadLetterRecorded`                                                                       |

## Example Implementation

See the order-management example for a complete implementation:

```
examples/order-management/convex/contexts/agent/
├── index.ts                # Exports and documentation
├── _component.ts           # Agent component API wiring
├── _config.ts              # AgentBCConfig with patterns array
├── _llm/
│   ├── config.ts           # LLM model + provider configuration
│   └── runtime.ts          # AgentRuntimeConfig with thread adapter
├── _patterns/
│   └── churnRisk.ts        # PatternDefinition with trigger + analyze
├── handlers/
│   ├── analyzeEvent.ts     # Action handler (LLM path)
│   ├── eventHandler.ts     # Mutation handler (rule-only path)
│   ├── onComplete.ts       # Workpool completion handler
│   └── routeCommand.ts     # Command bridge mutation
└── tools/
    ├── approval.ts         # Approval mutations (approve, reject, expire)
    └── emitCommand.ts      # Command emission utilities
```

### Quick Start

1. **Mount the agent component** in `convex.config.ts`:

```typescript
import agentBC from "@libar-dev/platform-core/agent/convex.config";
import agent from "@convex-dev/agent/convex.config";
app.use(agentBC);
app.use(agent, { name: "llmAgent" });
app.use(workpool, { name: "agentPool" });
```

2. **Define agent configuration** with patterns:

```typescript
const churnRiskAgentConfig: AgentBCConfig = {
  id: "churn-risk-agent",
  subscriptions: ["OrderCancelled", "OrderSubmitted", "PaymentFailed"],
  patternWindow: { duration: "30d", minEvents: 3 },
  confidenceThreshold: 0.8,
  patterns: [churnRiskPattern],
  humanInLoop: {
    confidenceThreshold: 0.9,
    requiresApproval: ["RefundOrder"],
  },
  rateLimits: {
    maxRequestsPerMinute: 60,
    costBudget: { daily: 10.0, alertThreshold: 0.8 },
  },
};
```

3. **Create the action handler**:

```typescript
export const analyzeEvent = internalAction({
  args: { /* AgentEventHandlerArgs */ },
  handler: async (ctx, args) => {
    const actionHandler = createAgentActionHandler({
      config: churnRiskAgentConfig,
      runtime: agentRuntime,
      loadState: async (ctx, args) => ({
        checkpoint: await ctx.runQuery(components.agentBC.checkpoints.get, ...),
        injectedData: { /* projection data */ },
      }),
      logger,
    });
    return actionHandler(ctx, args);
  },
});
```

4. **Register the subscription**:

```typescript
const subscription = createAgentActionSubscription(churnRiskAgentConfig, {
  actionHandler: internal.contexts.agent.handlers.analyzeEvent.analyzeEvent,
  onComplete: internal.contexts.agent.handlers.onComplete.handleOnComplete,
  pool: agentPool,
  priority: 250,
});
```

## API Reference

### Core Types

| Type                      | Description                       |
| ------------------------- | --------------------------------- |
| `AgentBCConfig`           | Full agent configuration          |
| `AgentDecision`           | Decision output from analysis     |
| `PatternDefinition`       | Pattern detection rules           |
| `PatternExecutionSummary` | Result of pattern executor run    |
| `AgentCheckpoint`         | Position tracking state           |
| `AgentCheckpointState`    | Read-only view of checkpoint      |
| `EmittedAgentCommand`     | Command with explainability       |
| `PendingApproval`         | Human-in-loop approval request    |
| `AgentInterface`          | LLM reasoning interface           |
| `LLMAnalysisResult`       | LLM analysis output               |
| `AgentLifecycleState`     | FSM state type                    |
| `AgentLifecycleEvent`     | FSM event type                    |
| `AgentActionResult`       | Action handler return type        |
| `AgentWorkpoolContext`    | Event metadata through Workpool   |
| `AgentComponentAPI`       | Component mutation/query wrappers |

### Factory Functions

| Function                          | Description                           |
| --------------------------------- | ------------------------------------- |
| `createAgentSubscription()`       | Create mutation EventBus subscription |
| `createAgentActionSubscription()` | Create action EventBus subscription   |
| `createAgentEventHandler()`       | Create mutation event handler         |
| `createAgentActionHandler()`      | Create action event handler (LLM)     |
| `createOnCompleteHandler()`       | Create Workpool completion handler    |
| `createCommandBridgeHandler()`    | Create command routing handler        |
| `definePattern()`                 | Define validated pattern              |
| `executePatterns()`               | Run patterns against events           |
| `createEmittedAgentCommand()`     | Create command with metadata          |
| `createPendingApproval()`         | Create approval request               |
| `createThreadAdapter()`           | Bridge to LLM generateText            |
| `initializeAgentBC()`             | Initialize agent lifecycle            |

### Lifecycle Functions (Pure)

| Function                         | Description                   |
| -------------------------------- | ----------------------------- |
| `transitionState(from, event)`   | Compute next state (or null)  |
| `getValidEvents(state)`          | List valid events for a state |
| `isValidTransition(from, event)` | Check if transition is valid  |

### Pattern Triggers

| Trigger                                      | Description                         |
| -------------------------------------------- | ----------------------------------- |
| `PatternTriggers.countThreshold(n)`          | Fire when n events present          |
| `PatternTriggers.eventTypePresent(types, n)` | Fire when n events of types present |
| `PatternTriggers.multiStreamPresent(n)`      | Fire when events from n streams     |
| `PatternTriggers.all(...triggers)`           | AND combination                     |
| `PatternTriggers.any(...triggers)`           | OR combination                      |

## Projection-Based Pattern Detection

For high-volume pattern detection, use dedicated projections instead of N+1 queries:

```typescript
// ❌ N+1 queries — O(N) performance
const customerOrders = await ctx.db.query("orderSummaries")...;
for (const order of customerOrders) {
  const events = await ctx.runQuery(eventStore.lib.readStream, { streamId: order.orderId });
}

// ✅ O(1) lookup via projection
const customerData = await ctx.db
  .query("customerCancellations")
  .withIndex("by_customerId", (q) => q.eq("customerId", customerId))
  .first();
```

| Approach    | Query Complexity | Latency (100 orders) | Scaling   |
| ----------- | ---------------- | -------------------- | --------- |
| N+1 queries | O(N)             | 500-2000ms           | Poor      |
| Projection  | O(1)             | 5-20ms               | Excellent |

## Best Practices

1. **Start with rules, add LLM later** — Rule-based triggers are faster and cheaper. Add LLM analysis only for complex patterns.

2. **Use the action/mutation split for LLM** — Never try to call external APIs from mutations. Use `createAgentActionHandler` + `onComplete`.

3. **Isolate agent workload** — Use the dedicated `agentPool` to prevent slow LLM calls from blocking projection processing.

4. **Implement dead letter handling** — Always provide `onComplete` handler for error tracking.

5. **Partition by entity** — Use `streamId` partitioning for entity-ordered processing.

6. **Monitor costs** — Set rate limits and cost budgets for LLM-based analysis.

7. **Audit everything** — Record all decisions for compliance and debugging.

8. **Use projections for pattern detection** — Avoid N+1 queries by maintaining denormalized projections (e.g., customer cancellations).

9. **Respect component boundaries** — Access agent state through component API only, never via direct `ctx.db.query()`.

10. **Use lifecycle commands for operational control** — Pause/resume agents via FSM commands rather than ad-hoc state manipulation.

## Related Patterns

- [Event Subscription](./EVENT-SUBSCRIPTION.md) — EventBus mechanics
- [Component Isolation](./COMPONENT_ISOLATION.md) — Convex component boundaries
- [Process Manager](./PROCESS-MANAGER.md) — Event-driven coordination
- [Saga](./SAGA.md) — Compensation workflows
- [Workpool](./WORKPOOL.md) — Durable job processing
