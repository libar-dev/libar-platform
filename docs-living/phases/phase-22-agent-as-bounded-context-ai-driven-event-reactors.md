# Agent as Bounded Context - AI-Driven Event Reactors

**Purpose:** Detailed patterns for Agent as Bounded Context - AI-Driven Event Reactors

---

## Summary

**Progress:** [███░░░░░░░░░░░░░░░░░] 1/6 (17%)

| Status      | Count |
| ----------- | ----- |
| ✅ Completed | 1     |
| 🚧 Active   | 4     |
| 📋 Planned  | 1     |
| **Total**   | 6     |

---

## 🚧 Active Patterns

### 🚧 Agent as Bounded Context - AI-Driven Event Reactors

| Property | Value  |
| -------- | ------ |
| Status   | active |

## Agent as Bounded Context - AI-Driven Event Reactors

Demonstrates the Agent as Bounded Context pattern where AI agents subscribe to
domain events via EventBus and emit commands based on pattern detection.

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           EventBus                                      │
│  (publishes OrderCancelled, OrderRefunded, OrderComplaintFiled, etc.)  │
└────────────────────────────────┬────────────────────────────────────────┘
                                 │ subscribe
                                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      Agent BC (Churn Risk)                             │
│ ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐            │
│ │   Checkpoint    │ │     Pattern     │ │     Config      │            │
│ │   (Position)    │ │   (Detection)   │ │  (Subscriptions)│            │
│ └─────────────────┘ └─────────────────┘ └─────────────────┘            │
│           │                   │                   │                    │
│           └───────────────────┼───────────────────┘                    │
│                               ▼                                        │
│ ┌───────────────────────────────────────────────────────────────────┐  │
│ │                     Event Handler                                 │  │
│ │  1. Load checkpoint (idempotency)                                 │  │
│ │  2. Load event history (pattern window)                           │  │
│ │  3. Evaluate pattern trigger                                      │  │
│ │  4. Make decision (rule-based or LLM)                             │  │
│ │  5. Emit command (with explainability)                            │  │
│ │  6. Update checkpoint                                             │  │
│ └───────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────┬────────────────────────────────────────┘
                                 │ emit command
                                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                           Command Bus                                   │
│              (routes SuggestCustomerOutreach, etc.)                    │
└─────────────────────────────────────────────────────────────────────────┘
```

### Key Concepts

- **Agent BC**: AI agent treated as a first-class bounded context
- **Pattern Detection**: Rules + optional LLM for complex patterns
- **Autonomous Commands**: Agent emits commands with full explainability
- **Human-in-Loop**: Configurable approval workflow for low-confidence decisions
- **Checkpoint Pattern**: Position tracking for exactly-once semantics

### Example: Churn Risk Detection

This example implements a churn risk agent that:
1. Subscribes to OrderCancelled events via EventBus
2. Tracks cancellation patterns per customer (30-day window)
3. Detects churn risk when a customer cancels 3+ orders
4. Emits SuggestCustomerOutreach command with confidence score

#### Dependencies

- Depends on: ReactiveProjections

---

### 🚧 Agent BC Component Isolation

| Property | Value  |
| -------- | ------ |
| Status   | active |
| Effort   | 1w     |

**Problem:** Agent BC tables (`agentCheckpoints`, `agentAuditEvents`, `agentDeadLetters`,
  `agentCommands`, `pendingApprovals`) reside in the shared app schema without physical
  BC isolation. Any app mutation can read/write agent tables directly, violating the core
  platform principle that bounded contexts should have isolated databases enforced by
  Convex component boundaries.

  **Solution:** Implement agent as a proper Convex component:
  1. **`defineComponent("agent")`** with isolated schema and private tables
  2. **Public API handlers** for checkpoint, audit, dead letter, and command operations
  3. **Cross-component query pattern** for app-level projections like `customerCancellations`

  **Why It Matters for Convex-Native ES:**
  | Benefit | How |
  | Physical BC isolation | Component tables are private, accessed only via API boundary |
  | Schema evolution safety | Component schema evolves independently of app schema |
  | Clear ownership | Agent component owns its domain data exclusively |
  | Consistent patterns | Aligns with orders/inventory component architecture |
  | OCC blast radius reduction | Agent writes isolated from app-level transaction conflicts |
  | Testing isolation | Component can be tested with `t.registerComponent()` |

  **Current State (app-level tables):**
  | Table | Current Location | Issue |
  | agentCheckpoints | Main schema.ts | No access control, OCC blast radius |
  | agentAuditEvents | Main schema.ts | Any mutation can modify audit trail |
  | agentDeadLetters | Main schema.ts | No encapsulation |
  | agentCommands | Main schema.ts | No API boundary |
  | pendingApprovals | Main schema.ts | Shared transaction scope |

  **Target State (component isolation):**
  | Table | Target Location | Access Pattern |
  | agentCheckpoints | Agent component schema | Via components.agent.checkpoints.* |
  | agentAuditEvents | Agent component schema | Via components.agent.audit.* |
  | agentDeadLetters | Agent component schema | Via components.agent.deadLetters.* |
  | agentCommands | Agent component schema | Via components.agent.commands.* |
  | pendingApprovals | Agent component schema | Via components.agent.approvals.* |

  **Design Decision: Projection Ownership (customerCancellations)**

  The `customerCancellations` projection is updated by CommandOrchestrator (orders BC context)
  but consumed exclusively by the agent for O(1) pattern detection lookup.

  | Option | Trade-off |
  | A: Keep at app level (Recommended) | Agent queries via cross-component query; natural per CLAUDE.md "all projections at app level" |
  | B: Move into agent component | Faster queries but requires cross-BC event subscription for updates |
  | C: Duplicate to both locations | Redundant data, consistency challenges |

  **Decision:** Option A. Projections often combine data from multiple BCs and belong at
  the app level per platform architecture. The agent uses a cross-component query pattern
  to access `customerCancellations` — the same pattern any component uses to read app data.

  **Design Decision: Component API Surface**

  Expose minimal API that supports all current use cases without over-engineering:

  | API Group | Handlers | Purpose |
  | Checkpoints | loadCheckpoint, updateCheckpoint | Exactly-once processing |
  | Audit | recordAuditEvent, queryAuditEvents, getAuditEventsByAgent | Explainability |
  | Dead Letters | recordDeadLetter, replayDeadLetter, ignoreDeadLetter, queryDeadLetters | Error management |
  | Commands | recordCommand, updateCommandStatus, queryCommands | Command lifecycle |
  | Approvals | createApproval, approveAction, rejectAction, queryPendingApprovals | Human-in-loop |

  **Design Decision: Migration Strategy**

  Staged migration from app tables to component tables:
  1. Create component with new schema (parallel to existing tables)
  2. Update handlers to use component API
  3. Migrate existing data (one-time migration script)
  4. Remove old tables from app schema

  **Design Decision: Peer Mounting Architecture (AD-6)**

  `agentBC`, `@convex-dev/agent` (as `llmAgent`), and `agentPool` workpool are all PEER
  components at the app level — NOT nested (agentBC does NOT `component.use(agent)`).

  | Component | Purpose | Why Peer |
  | agentBC | BC state: checkpoints, audit, commands, approvals | Owns domain data |
  | llmAgent (@convex-dev/agent) | LLM: threads, messages, embeddings | Needs process.env for API keys |
  | agentPool (workpool) | Dedicated pool for agent actions | Separate parallelism from projections |

  Components cannot access `process.env` — the app-level action handler coordinates
  between both components, passing API keys as arguments.

  """typescript
  // convex.config.ts — all three are app-level peers
  import agentBC from "@libar-dev/platform-core/agent/convex.config";
  import { agent } from "@convex-dev/agent/convex.config";
  import { workpool } from "@convex-dev/workpool/convex.config";

  app.use(agentBC);                         // BC: checkpoints, audit, commands, approvals
  app.use(agent, { name: "llmAgent" });     // LLM: threads, messages, embeddings
  app.use(workpool, { name: "agentPool" }); // Dedicated pool for agent actions
  """

  **Data Flow with Peer Components:**
  """
  EventBus → agentPool.enqueueAction() → app-level action handler
    action: ctx.runQuery(agentBC.checkpoints.*) + llmAgent.generateText()
    onComplete: ctx.runMutation(agentBC.audit.*) + ctx.runMutation(agentBC.checkpoints.*)
  """

  **Schema Evolution Notes (from design stubs):**

  The component schema expands beyond the current app-level definitions:

  | Aspect | Current (app schema) | Target (component schema) |
  | Checkpoint statuses | 3: active, paused, stopped | 4: adds error_recovery (DS-5 lifecycle) |
  | Audit event types | 6: Decision, Approved, Rejected, Expired, Completed, Failed | 16: adds DS-4 routing + DS-5 lifecycle types |
  | Checkpoint indexes | by_agentId only | Adds by_agentId_subscriptionId for O(1) lookup |
  | Forward declarations | None | configOverrides: v.optional(v.any()) for ReconfigureAgent (DS-5) |

  All 16 audit event types declared from day one to avoid schema migration:
  - DS-1 base (8): PatternDetected, CommandEmitted, ApprovalRequested/Granted/Rejected/Expired, DeadLetterRecorded, CheckpointUpdated
  - DS-4 routing (2): AgentCommandRouted, AgentCommandRoutingFailed
  - DS-5 lifecycle (6): AgentStarted, AgentPaused, AgentResumed, AgentStopped, AgentReconfigured, AgentErrorRecoveryStarted

  **Cron Migration Note:**

  The existing `expirePendingApprovals` cron runs as an `internalMutation` with direct
  `ctx.db` access. After component isolation, crons cannot call component internals
  directly — an app-level wrapper mutation must delegate to `components.agent.approvals.expirePending`.

  **Component Isolation Constraints (per platform architecture):**
  | Constraint | Impact on Agent Component |
  | No ctx.auth inside component | Pass userId as argument to all handlers |
  | IDs become strings at boundary | Use business IDs (agentId, eventId) not Convex doc IDs |
  | Sub-transactions | Agent writes commit independently from parent mutations |
  | No process.env | Pass configuration (API keys, model names) as arguments |

#### Dependencies

- Depends on: AgentAsBoundedContext

#### Acceptance Criteria

**Agent component registers with isolated schema**

- Given the agent component is defined with defineComponent
- When the app mounts the agent component via app.use
- Then the agent's tables are isolated from the app schema
- And the app cannot directly query agentCheckpoints
- And all access goes through components.agent.* handlers

**Component API provides full CRUD for checkpoints**

- Given the agent component is mounted
- When a checkpoint is created via components.agent.checkpoints.load
- Then the checkpoint is stored in the component's isolated database
- And it can be updated via components.agent.checkpoints.update
- And it can be queried via components.agent.checkpoints.load

**Direct table access is not possible from parent**

- Given the agent component is mounted
- When the parent app attempts ctx.db.query("agentCheckpoints")
- Then the query returns no results
- And agent data is only accessible through component API handlers

**Component sub-transactions provide isolation**

- Given a parent mutation that calls agent component handlers
- When the agent component handler throws an error
- And the parent catches the exception
- Then only the agent component write is rolled back
- And the parent mutation's other writes succeed

**Agent handler receives projection data as argument**

- Given the agent event handler is triggered by an OrderCancelled event
- When the handler needs customer cancellation history
- Then it receives the history as a pre-loaded argument
- And it does not directly query customerCancellations table

**Missing projection data returns empty result**

- Given a new customer with no cancellation history
- When the agent handler receives an event for this customer
- Then the cancellation history argument is an empty array
- And the handler proceeds with rule-based analysis
- And no error is thrown

**Agent handler cannot directly access app-level projection tables**

- Given the agent component is processing an event
- When the handler attempts to query customerCancellations directly
- Then the query is not available inside the component context
- And the handler must use the injected data argument instead

**App-level queries can access agent data via component API**

- Given the admin UI needs to display agent audit events
- When it queries via components.agent.audit.queryAuditEvents
- Then it receives the audit events for the requested agent
- And the query respects agent component boundaries

#### Business Rules

**Agent component provides isolated database**

**Invariant:** All agent-specific state (checkpoints, audit events, dead letters,
    commands, pending approvals) must reside in the agent component's isolated database.
    No agent data in the shared app schema.

    **Rationale:** Physical BC isolation prevents accidental coupling. Parent app mutations
    cannot query agent tables directly — this is enforced by Convex's component architecture,
    not just convention. This matches the orders/inventory pattern where each BC owns its
    tables via `defineComponent()`.

    **Verified by:** Component isolation test, API boundary test, schema separation test

_Verified by: Agent component registers with isolated schema, Component API provides full CRUD for checkpoints, Direct table access is not possible from parent, Component sub-transactions provide isolation_

**Cross-component queries use explicit API**

**Invariant:** Agent BC must access external data (like `customerCancellations` projection)
    through explicit cross-component query patterns, never through direct table access.

    **Rationale:** Maintains BC isolation while enabling necessary data access. The
    `customerCancellations` projection lives at the app level (owned by CommandOrchestrator),
    so the agent handler must receive this data as an argument or query it through
    a well-defined interface.

    **Cross-Component Data Flow:**
    | Data Source | Owner | Consumer | Access Pattern |
    | customerCancellations | App (projection) | Agent handler | Passed as argument to handler |
    | Order events | EventBus | Agent subscription | Delivered via Workpool |
    | Agent decisions | Agent component | Admin UI queries | Via component API |

    **Verified by:** Cross-component query works, missing data handled gracefully,
    no direct table coupling between agent and app

_Verified by: Agent handler receives projection data as argument, Missing projection data returns empty result, Agent handler cannot directly access app-level projection tables, App-level queries can access agent data via component API_

---

### 🚧 Agent LLM Integration

| Property | Value  |
| -------- | ------ |
| Status   | active |
| Effort   | 1w     |

**Problem:** The agent event handler (`handleChurnRiskEvent`) is a Convex mutation that
  cannot call external APIs. The LLM runtime (`_llm/runtime.ts`) exists with OpenRouter
  integration but is never invoked because mutations cannot make HTTP calls. Additionally,
  rate limiting config exists as types only — no runtime enforcement protects against
  runaway LLM costs.

  **Solution:** Implement hybrid action/mutation handler pattern:
  1. **Action handler factory** — EventBus delivers to Workpool action (not mutation)
  2. **onComplete mutation** — Persists state atomically after LLM analysis
  3. **Rate limiting enforcement** — `@convex-dev/rate-limiter` token bucket per agent
  4. **Cost budget tracking** — Daily spend limits with automatic pause
  5. **LLM fallback** — Graceful degradation to rule-based when LLM unavailable

  **Why It Matters for Convex-Native ES:**
  | Benefit | How |
  | LLM integration works | Actions can make external HTTP calls (mutations cannot) |
  | Atomic persistence | Mutations in onComplete provide transactional guarantees |
  | Cost control | Rate limiting prevents runaway LLM API costs |
  | Graceful degradation | Fallback to rules when LLM unavailable or rate-limited |
  | Conversation context | Thread adapter retains analysis history across events |
  | Fault isolation | Circuit breaker prevents cascade failures from LLM outages |

  **The Fundamental Constraint:**

  | Function Type | Can Call External APIs | Database Writes | Workpool Retry |
  | Mutation | No | Yes (atomic) | No (OCC auto-retry) |
  | Action | Yes (fetch, LLM) | No (must use runMutation) | Yes (if enabled) |

  This means the current single-mutation handler architecture fundamentally blocks LLM
  integration. The solution requires splitting into action (LLM) + mutation (persist).

  **Action/Mutation Split Architecture:**
  """
  EventBus
     |
     v
  Workpool.enqueueAction (agent event handler)
     |
     +--- 1. Load checkpoint (via runQuery)
     +--- 2. Check idempotency (skip if already processed)
     +--- 3. Load event history (via cross-component query)
     +--- 4. Evaluate rule trigger (cheap, no LLM)
     +--- 5. If triggered: call LLM analysis (external API)
     +--- 6. Return AgentDecision
     |
     v
  onComplete Mutation
     |
     +--- 7. Validate decision
     +--- 8. Record to agent component (audit, command)
     +--- 9. Create pending approval (if needed)
     +--- 10. Update checkpoint
     +--- 11. Handle failure (dead letter)
  """

  **Design Decision: @convex-dev/agent Integration**

  | Option | Trade-off |
  | A: Full @convex-dev/agent | Thread management, tool execution, but opinionated patterns that may conflict with event-reactive architecture |
  | B: Vercel AI SDK only (current) | More control, but must implement thread/tool patterns manually |
  | C: Hybrid (Recommended) | Use @convex-dev/agent for threads and tools, keep custom EventBus subscription and pattern detection |

  **Decision:** Option C — Hybrid approach.
  - **@convex-dev/agent provides:** Thread management (conversation context), tool execution (structured tool calls), model abstraction
  - **Platform provides:** EventBus subscription, pattern detection triggers, checkpoint/audit infrastructure, rate limiting
  - **Integration point:** Agent action handler creates/resumes thread per customer, uses @convex-dev/agent for LLM call, returns result to platform's onComplete handler

  **Design Decision: Rate Limiting Implementation**

  Use `@convex-dev/rate-limiter` component (already installed in example app):
  - **Token bucket per agent** — configurable maxRequestsPerMinute
  - **Cost budget** — daily USD limit with alertThreshold and hard pause
  - **Exceeded behavior** — queue event for later retry, or dead letter if queue full

  | Rate Limit Type | Mechanism | Action When Exceeded |
  | Requests/minute | Token bucket (@convex-dev/rate-limiter) | Queue for retry |
  | Concurrent calls | Workpool maxParallelism | Natural backpressure |
  | Daily cost budget | Custom tracker (agent component table) | Pause agent |
  | Queue overflow | Workpool queueDepth | Dead letter |

  **Design Decision: LLM Fallback Strategy**

  When LLM is unavailable (API key missing, rate limited, circuit breaker open):
  1. Error propagates from pattern.analyze() through the action handler
  2. Workpool retries with exponential backoff (maxAttempts: 3)
  3. After retries exhausted, event goes to dead letter queue

  This ensures failed events are tracked and can be replayed after the issue is resolved.

  **Dedicated Agent Workpool:**

  A dedicated `agentPool` peer mount exists in `convex.config.ts`, separating LLM
  work from `projectionPool` to avoid resource contention.

  | Config | Value | Rationale |
  | Name | agentPool | Dedicated pool, separate from projectionPool |
  | maxParallelism | 10 | LLM calls are slow (~1-5s) — limit concurrency to control costs |
  | retryActionsByDefault | true | LLM APIs have transient failures |
  | defaultRetryBehavior | 3 attempts, 1s initial, base 2 | Exponential backoff for rate limits |
  | Partition key | event.streamId | Per-customer ordering (matches PM pattern) |

  """typescript
  // convex.config.ts — dedicated agent pool
  app.use(workpool, { name: "agentPool" });

  // Agent pool configuration
  const agentPool = new Workpool(components.agentPool, {
    maxParallelism: 10,
    retryActionsByDefault: true,
    defaultRetryBehavior: { maxAttempts: 3, initialBackoffMs: 1000, base: 2 },
  });
  """

  Separation of concerns: agent LLM calls don't compete with projection processing
  in `projectionPool` (which handles high-throughput, low-latency CMS updates).

  **createAgentActionHandler — Factory:**

  `createAgentActionHandler` returns an `internalAction` that can call external APIs
  (LLM). The legacy `createAgentEventHandler` (mutation-based `onEvent` callback) has
  been removed — all agent event handling now uses the action-based handler.
  The action handler reuses existing pure logic from the mutation handler:
  - Pattern window filtering (`filterEventsInWindow`)
  - Minimum event check (`hasMinimumEvents`)
  - Approval determination (`shouldRequireApproval`)

  The new capability is the LLM call between trigger evaluation and decision creation:
  """typescript
  // Simplified action handler flow
  // Steps 1-4: Same as mutation handler (reused pure functions)
  // Step 5: NEW — LLM analysis (only possible in action context)
  const analysis = await runtime.analyze(prompt, filteredEvents);
  // Step 6: Build AgentDecision from analysis (reused pure function)
  """

  **Thread Adapter Design — @convex-dev/agent Integration:**

  One thread per (agentId, customerId) pair enables conversation context across events:

  | Concern | Mechanism |
  | Thread identity | Key: `agent:{agentId}:customer:{customerId}` |
  | First event | Creates new thread, seeds with customer context |
  | Subsequent events | Resumes existing thread, appends new event context |
  | History window | Thread retains LLM conversation history for richer analysis |
  | Thread cleanup | Threads expire naturally via @convex-dev/agent TTL |

  The adapter translates between platform's `AgentInterface` (analyze/reason methods)
  and `@convex-dev/agent`'s `Agent.generateText()`:
  """typescript
  // Thread adapter bridges platform interface to @convex-dev/agent
  class ThreadAdapter implements AgentInterface {
    async analyze(prompt: string, events: FatEvent[]): Promise<LLMAnalysisResult> {
      const threadId = await this.getOrCreateThread(agentId, customerId);
      const result = await this.agent.generateText(ctx, { threadId }, {
        prompt: buildAnalysisPrompt(prompt, events),
      });
      return parseAnalysisResult(result);
    }
  }
  """

  **Circuit Breaker Integration — Phase 18 Relationship:**

  Phase 18's circuit breaker (`platform-core/src/infrastructure/circuit-breaker.ts`)
  provides the failure isolation pattern. Agent LLM calls use a named instance:

  | Config | Value |
  | Circuit name | "llm-provider" (or per-provider: "openrouter", "openai") |
  | Failure threshold | 5 consecutive failures |
  | Reset timeout | 60 seconds |
  | Fallback | Rule-based analysis via existing `createMockAgentRuntime()` pattern |

  When circuit is open:
  1. LLM call is skipped (no HTTP request made)
  2. Error propagates to Workpool which retries after backoff
  3. Dead letter records circuit state context if retries exhausted
  4. Circuit half-opens after timeout, allowing one probe request

#### Dependencies

- Depends on: AgentBCComponentIsolation

#### Acceptance Criteria

**Agent action handler calls LLM and returns decision**

- Given an agent configured with LLM runtime
- And an OrderCancelled event is delivered via EventBus
- When the action handler processes the event
- Then it loads the checkpoint via runQuery
- And it loads event history via cross-component query
- And it calls the LLM for pattern analysis
- And it returns an AgentDecision with confidence and reasoning

**onComplete mutation persists decision atomically**

- Given an agent action returned a successful AgentDecision
- When the onComplete handler fires with result.kind "success"
- Then the decision is recorded as an audit event in agent component
- And the command is emitted to agent component commands table
- And the checkpoint is updated with new position
- And all writes happen in a single atomic mutation

**Action handler rejects invalid agent configuration**

- Given an agent action handler with missing LLM runtime config
- And no fallback to rule-based analysis is configured
- When the handler is initialized
- Then it fails with AGENT_RUNTIME_REQUIRED error
- And the error message indicates LLM runtime or fallback must be configured

**LLM unavailable propagates error through retries to dead letter**

- Given an agent configured with LLM runtime
- And the LLM API returns an error or times out
- When the action handler processes the event
- Then the error propagates to the Workpool for retry
- And after retries exhausted the event is dead-lettered
- And a DeadLetterRecorded audit event is created

**Action failure triggers dead letter via onComplete**

- Given an agent action that throws an unrecoverable error
- When the onComplete handler fires with result.kind "failed"
- Then a dead letter entry is created in agent component
- And the checkpoint is NOT advanced
- And an AgentAnalysisFailed audit event is recorded

**Rate limiter allows LLM call within limits**

- Given an agent with rate limit of 60 requests per minute
- And 30 requests have been made this minute
- When a new event triggers LLM analysis
- Then the rate limiter allows the call
- And the LLM analysis proceeds normally

**Rate limiter blocks LLM call when exceeded**

- Given an agent with rate limit of 60 requests per minute
- And 60 requests have already been made this minute
- When a new event triggers LLM analysis
- Then the rate limiter denies the call
- And the event is requeued for later processing
- And an AgentRateLimited audit event is recorded

**Cost budget exceeded pauses agent**

- Given an agent with daily cost budget of 10.00 USD
- And 9.50 USD has been spent today
- When a new LLM call would cost approximately 0.60 USD
- Then the agent is paused automatically
- And an AgentBudgetExceeded audit event is recorded
- And the event is dead-lettered with reason "budget_exceeded"

**Queue overflow triggers dead letter**

- Given an agent with queue depth of 100
- And 100 events are already queued
- When another event is rate-limited
- Then it is sent to dead letter with reason "queue_overflow"
- And an AgentQueueOverflow audit event is recorded

**Agent subscription with onComplete receives completion callbacks**

- Given an agent subscription configured with custom onComplete handler
- When the agent action completes successfully
- Then the custom onComplete handler fires with result.kind "success"
- And the handler can update the agent checkpoint
- And the handler can record agent-specific audit events

**Failed agent jobs create dead letters via onComplete**

- Given an agent subscription configured with custom onComplete handler
- When the agent action fails with an error
- Then the custom onComplete handler fires with result.kind "failed"
- And a dead letter entry is created in the agent component
- And the checkpoint is not advanced past the failed event

**Agent subscription without onComplete uses global default**

- Given an agent subscription without a custom onComplete handler
- When the agent action fails
- Then the EventBus defaultOnComplete handler fires
- And the global dead letter handler processes the failure

#### Business Rules

**Agent event handlers are actions for LLM integration**

**Invariant:** Agent event handlers that require LLM analysis must be Convex actions,
    not mutations. All state changes (checkpoint, audit, commands) happen in the onComplete
    mutation handler, never in the action.

    **Rationale:** Convex mutations cannot make external HTTP calls. The action/mutation
    split enables LLM integration while maintaining atomic state persistence. Actions are
    retryable by Workpool (mutations are not — they rely on OCC auto-retry).

    **Handler Factory Signature:**

```typescript
// createAgentActionHandler replaces createAgentEventHandler
    // Returns an internalAction (not internalMutation)
    export function createAgentActionHandler(config: {
      agentConfig: AgentBCConfig;
      runtime: AgentRuntimeConfig; // LLM runtime (or mock)
      loadHistory: (ctx: ActionCtx, event: AgentEventHandlerArgs) => Promise<EventHistory>;
    }): RegisteredAction<"internal", AgentEventHandlerArgs, AgentDecision>
```

**Verified by:** Action calls LLM, onComplete persists, fallback works, timeout handled

_Verified by: Agent action handler calls LLM and returns decision, onComplete mutation persists decision atomically, Action handler rejects invalid agent configuration, LLM unavailable propagates error through retries to dead letter, Action failure triggers dead letter via onComplete_

**Rate limiting is enforced before LLM calls**

**Invariant:** Every LLM call must check rate limits before execution. Exceeded
    limits queue the event for later retry or send to dead letter if queue is full.

    **Rationale:** LLM API costs can spiral quickly under high event volume. Rate limiting
    protects against runaway costs and external API throttling. The existing `rateLimits`
    config in `AgentBCConfig` defines the limits — this rule enforces them at runtime.

    **Rate Limit Check Flow:**

```text
Event arrives → Check token bucket → Allowed? → Proceed to LLM
                                        → Denied?  → Check queue depth
                                                    → Queue available? → Requeue
                                                    → Queue full?      → Dead letter
```

**Verified by:** Rate limit blocks excess calls, cost budget pauses agent,
    queue overflow creates dead letter

_Verified by: Rate limiter allows LLM call within limits, Rate limiter blocks LLM call when exceeded, Cost budget exceeded pauses agent, Queue overflow triggers dead letter_

**Agent subscriptions support onComplete callbacks**

**Invariant:** `CreateAgentSubscriptionOptions` must include an optional `onComplete`
    field that receives Workpool completion callbacks, enabling agent-specific dead letter
    handling and checkpoint updates.

    **Rationale:** The current `CreateAgentSubscriptionOptions` type lacks the `onComplete`
    field. While the EventBus falls back to the global `defaultOnComplete` (dead letter handler),
    agents need custom completion logic: checkpoint updates, agent-specific audit events,
    and rate limit tracking. Without this field, the agent-specific `handleChurnRiskOnComplete`
    handler is orphaned — defined but never wired.

    **Current Gap:**

```typescript
// CreateAgentSubscriptionOptions (current - missing onComplete)
    interface CreateAgentSubscriptionOptions {
      handler: FunctionReference<...>;
      priority?: number;
      toHandlerArgs?: ...;
      getPartitionKey?: ...;
      logger?: Logger;
      // No onComplete field!
    }
```

**Target:**

```typescript
// CreateAgentSubscriptionOptions (target - with onComplete)
    interface CreateAgentSubscriptionOptions {
      handler: FunctionReference<...>;
      onComplete?: FunctionReference<...>; // Agent-specific completion handler
      priority?: number;
      toHandlerArgs?: ...;
      getPartitionKey?: ...;
      logger?: Logger;
    }
```

**Verified by:** onComplete receives callbacks, dead letters created on failure,
    checkpoint updated on success

_Verified by: Agent subscription with onComplete receives completion callbacks, Failed agent jobs create dead letters via onComplete, Agent subscription without onComplete uses global default_

---

### 🚧 Confirmed Order Cancellation

| Property | Value  |
| -------- | ------ |
| Status   | active |
| Effort   | 2d     |

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

#### Dependencies

- Depends on: SagaOrchestration
- Depends on: AgentAsBoundedContext

#### Acceptance Criteria

**Cancel a confirmed order**

- Given an order "ord-conf-cancel-01" exists with status "confirmed"
- When I send a CancelOrder command for "ord-conf-cancel-01" with reason "Customer changed mind"
- Then the command should succeed
- And the order "ord-conf-cancel-01" status should be "cancelled"

**Cannot cancel already cancelled order (unchanged behavior)**

- Given an order "ord-conf-cancel-02" exists with status "cancelled"
- When I send a CancelOrder command for "ord-conf-cancel-02" with reason "Double cancel attempt"
- Then the command should be rejected with code "ORDER_ALREADY_CANCELLED"

**OrderCancelled evolves confirmed state to cancelled**

- Given an order state with status "confirmed"
- When OrderCancelled event is applied
- Then state should have status "cancelled"

**Reservation is released after confirmed order cancellation**

- Given a product "prod-rel-01" exists with 10 available and 5 reserved stock
- And a confirmed order "ord-rel-01" with a confirmed reservation for 5 units
- When I cancel order "ord-rel-01" with reason "Customer changed mind"
- Then the order "ord-rel-01" should have status "cancelled"
- And I wait for projections to process
- And the reservation for order "ord-rel-01" should have status "released"
- And the product "prod-rel-01" should have 15 available and 0 reserved stock

**Cancelling draft order does not trigger reservation release**

- Given a draft order "ord-rel-02" exists
- When I cancel order "ord-rel-02" with reason "Changed mind early"
- Then the order "ord-rel-02" should have status "cancelled"
- And no ReleaseReservation command should be emitted

**Cancelling submitted order with pending reservation releases it**

- Given a submitted order "ord-rel-03" with a pending reservation
- When I cancel order "ord-rel-03" with reason "Changed mind before confirmation"
- Then the order "ord-rel-03" should have status "cancelled"
- And the reservation for order "ord-rel-03" should have status "released"

**PM is idempotent for duplicate OrderCancelled events**

- Given a confirmed order "ord-rel-04" with a confirmed reservation
- When OrderCancelled event is delivered twice for "ord-rel-04"
- Then the reservation should only be released once

**Three cancellations trigger churn risk agent**

- Given a customer "cust-churn-01" exists
- And 3 confirmed orders for customer "cust-churn-01"
- When I cancel all 3 orders for customer "cust-churn-01"
- Then the churn risk agent should detect the pattern
- And an approval request should be created for customer outreach

#### Business Rules

**Confirmed orders can be cancelled**

The Order FSM must allow transitioning from `confirmed` to `cancelled`.
    The CancelOrder decider must accept cancellation requests for confirmed orders.

    **FSM Change:**

```typescript
// Before:
    confirmed: [], // terminal state

    // After:
    confirmed: ["cancelled"], // can cancel confirmed orders
```

**Decider Change:**

```typescript
// Remove this rejection:
    // if (state.status === "confirmed") {
    //   return rejected("ORDER_ALREADY_CONFIRMED", "...");
    // }
    // Let FSM handle the transition validation
```

_Verified by: Cancel a confirmed order, Cannot cancel already cancelled order (unchanged behavior), OrderCancelled evolves confirmed state to cancelled_

**Reservation is released when confirmed order is cancelled**

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

```typescript
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
```

_Verified by: Reservation is released after confirmed order cancellation, Cancelling draft order does not trigger reservation release, Cancelling submitted order with pending reservation releases it, PM is idempotent for duplicate OrderCancelled events_

**Agent BC demo flow is enabled**

The primary use case is enabling the Agent BC churn risk detection demo.

_Verified by: Three cancellations trigger churn risk agent_

---

## 📋 Planned Patterns

### 📋 Agent Admin Frontend

| Property | Value   |
| -------- | ------- |
| Status   | planned |
| Effort   | 2w      |

**Problem:** The admin UI at `/admin/agents` has implementation gaps identified
  in the E2E feature file (`agent-approvals.feature`) and investigation:

  1. **Only one agent implemented** — The churn-risk agent (22d) is the only backend
     agent. The admin UI can only show churn-risk data. A second agent that triggers
     on a different event (no cancellation required) is needed for demo and validation.
  2. **Dead letter management missing** — Backend has full API (`queryDeadLetters`,
     `replayDeadLetter`, `ignoreDeadLetter`) but no frontend UI.
  3. **Decision history incomplete** — E2E spec describes decision history tab with
     filtering, but component is not built.
  4. **No action feedback** — Approve/reject has no success/error toast notifications.
  5. **No loading states** — No skeleton UI during Suspense boundaries.
  6. **E2E steps missing** — `agent-approvals.feature` has ~50 scenarios with no step
     definitions, causing CI failures (179 missing steps including journey scenarios).
  7. **Authentication placeholder** — `useReviewerId()` returns `"reviewer-placeholder"`.

  **Solution:** Complete the agent admin frontend with multi-agent support:
  1. **High-value order detection agent** — Second agent backend + frontend integration
  2. **Dead letter management panel** — List, replay, ignore with feedback for both agents
  3. **Decision history with filtering** — By agent ID, action type, time range
  4. **Toast notifications** — Success/error feedback for all mutating actions
  5. **E2E step definitions** — For churn-risk + high-value-order scenarios
  6. **Tag unimplemented agents @skip** — Low stock alert, order consolidation agents

  **Why It Matters for Convex-Native ES:**
  | Benefit | How |
  | Multi-agent validation | Two different agents prove the platform pattern is reusable |
  | Operational visibility | Dead letters visible and actionable by operators |
  | Agent observability | Decision history filterable by agent for analysis and debugging |
  | User feedback | Toast notifications confirm approve/reject/replay/ignore actions |
  | Test coverage | E2E tests validate full UI-to-backend agent workflow |
  | Demo-friendly | High-value order agent triggers without needing 3 cancellations |

  **Current Admin UI Structure (from Phase 22a-22c):**
  | Tab | Status | Component |
  | Dashboard | Implemented | AgentDashboard (3 summary cards) |
  | Pending Approvals | Implemented | PendingApprovalsList, ApprovalDetail |
  | Monitoring | Implemented | AgentMonitoring (checkpoint cards) |
  | Decision History | Not built | (planned — this spec) |
  | Dead Letters | Not built | (planned — this spec) |

  **Existing Hooks (working):**
  | Hook | File | Purpose |
  | usePendingApprovals() | hooks/use-pending-approvals.ts | Pending approvals list |
  | useApprovalDetail(id) | hooks/use-approval-detail.ts | Single approval with events |
  | useApprovalActions() | hooks/use-approval-actions.ts | Approve/reject mutations |
  | useActiveAgents() | hooks/use-active-agents.ts | Active agent checkpoints |

  **Backend Queries (ready, from `queries/agent.ts`):**
  | Query | Purpose | Frontend Hook Needed |
  | getDeadLetters | Dead letters by agent/status | useDeadLetters |
  | getDeadLetterStats | Pending counts per agent | useDeadLetterStats |
  | getAuditEvents | Audit events by agent/type | useDecisionHistory |
  | getCheckpoint | Agent checkpoint by ID | (exists via useActiveAgents) |
  | getActiveAgents | All active checkpoints | (exists) |
  | getPendingApprovals | Approvals by agent/status | (exists) |
  | getApprovalById | Single approval lookup | (exists) |

#### Dependencies

- Depends on: AgentChurnRiskCompletion

#### Acceptance Criteria

**Dead letter list displays failed events from both agents**

- Given 2 dead letter entries exist for the churn-risk agent
- And 1 dead letter entry exists for the high-value-order agent
- When I navigate to the Monitoring tab
- Then I see a "Dead Letters" section with 3 entries
- And each entry shows agent ID, event type, error, and timestamp
- And each entry has "Replay" and "Ignore" action buttons

**Replay action triggers backend mutation with toast feedback**

- Given a dead letter entry for the churn-risk agent
- When I click the "Replay" button
- Then the replayDeadLetter mutation is called
- And a success toast shows "Dead letter replayed successfully"
- And the entry status updates to "replayed"
- And the Replay button is replaced with a "Replayed" status indicator

**Ignore action with reason provides confirmation**

- Given a dead letter entry for event "evt_456"
- When I click "Ignore" and enter reason "Duplicate event, already processed"
- Then the ignoreDeadLetter mutation is called with the reason
- And a success toast shows "Dead letter ignored"
- And the entry status updates to "ignored"

**Replay failure shows error toast**

- Given a dead letter entry whose original event no longer exists
- When I click the "Replay" button
- Then the mutation fails with an error
- And an error toast shows a descriptive message
- And the entry remains in "pending" status

**Filter dead letters by agent**

- Given dead letters exist for both churn-risk and high-value-order agents
- When I select "high-value-order-agent" in the agent filter
- Then only dead letters for the high-value-order agent are shown

**View decision history with decisions from both agents**

- Given the churn-risk agent has detected 3 patterns
- And the high-value-order agent has flagged 2 orders
- When I click the "Decision History" tab
- Then I see 5 audit entries in chronological order
- And entries from both agents are interleaved by timestamp

**Filter decision history by agent**

- Given decisions exist for "churn-risk-agent" and "high-value-order-agent"
- When I select "churn-risk-agent" in the agent filter
- Then only churn-risk agent decisions are displayed
- And the entry count updates to reflect the filter

**Filter decision history by action type**

- Given decisions with actions "SuggestCustomerOutreach" and "FlagForVIPReview"
- When I select "FlagForVIPReview" in the action filter
- Then only FlagForVIPReview decisions are displayed

**View decision detail with full reasoning**

- Given the churn-risk agent has made a decision with confidence 0.87
- When I click on the decision entry
- Then I see the full LLM reasoning text
- And I see the triggering event IDs
- And I see whether a command was emitted
- And I see whether approval was required

**Empty decision history shows guidance message**

- Given no agents have made any decisions yet
- When I view the "Decision History" tab
- Then I see a message explaining what will appear here
- And the message mentions both active agents by name

**Approve action shows success toast**

- Given a pending approval for the churn-risk agent
- When I click "Approve"
- Then a success toast appears with "Approval recorded"
- And the toast auto-dismisses after 5 seconds
- And the approval list refreshes

**Reject action shows success toast**

- Given a pending approval for the high-value-order agent
- When I click "Reject" and provide a note
- Then a success toast appears with "Action rejected"
- And the approval is removed from the pending list

**Error action shows descriptive error toast**

- Given a pending approval that has already been expired
- When I attempt to approve it
- Then an error toast appears with "Approval has expired"
- And the toast has role="alert" for accessibility
- And the approval status shows "expired"

**Multiple rapid actions show stacked toasts**

- Given 3 pending approvals from different agents
- When I quickly approve all 3
- Then 3 success toasts appear in sequence
- And each toast is individually dismissable
- And they auto-dismiss in order

**High-value order detected and surfaces as VIP approval**

- Given a product exists with price $200 per unit
- And the product has sufficient stock
- When a customer creates an order with 3 units (total $600)
- And the order is submitted and confirmed by the saga
- Then the high-value-order-agent detects the OrderConfirmed event
- And the LLM analyzes the order for VIP treatment
- And a FlagForVIPReview approval appears in the admin dashboard
- And the approval shows confidence, reasoning, and order details

**Low-value order does not trigger agent**

- Given a product exists with price $10 per unit
- When a customer creates an order with 2 units (total $20)
- And the order is submitted and confirmed
- Then the high-value-order-agent receives the event
- But the pattern trigger does not fire (totalAmount < $500)
- And no approval is created

**Admin approves VIP flag for high-value order**

- Given there is a pending FlagForVIPReview approval
- And the approval shows order total $1,200 with confidence 0.91
- When the admin reviews the reasoning and clicks "Approve"
- Then a success toast shows "Approval recorded for high-value-order-agent"
- And the FlagForVIPReview command is routed to the VIP handler
- And the decision appears in the decision history tab

**Both agents trigger from same customer activity**

- Given a customer has cancelled 2 orders previously
- And the customer places a new high-value order ($800)
- When the customer cancels the high-value order (3rd cancellation)
- Then the churn-risk agent detects the 3+ cancellation pattern
- And the high-value-order agent had previously flagged the order
- And both decisions appear in the decision history
- And the admin can filter by agent to see each agent's perspective

**Dashboard shows both active agents**

- Given the churn-risk agent has processed 100 events
- And the high-value-order agent has processed 50 events
- When I view the agents dashboard
- Then the Active Agents count shows "2"
- And the Events Processed count shows "150"
- And both agent names are visible

**Pending approvals count includes both agents**

- Given there are 2 pending approvals from churn-risk agent
- And there is 1 pending approval from high-value-order agent
- When I view the agents dashboard
- Then the Pending Approvals count shows "3"
- And the Pending Approvals tab badge shows "3"

**One agent stopped, one active**

- Given the churn-risk agent is in "active" status
- And the high-value-order agent is in "stopped" status
- When I view the monitoring tab
- Then I see the churn-risk agent with "Active" badge
- And I see the high-value-order agent with "Stopped" badge
- And the Active Agents count on dashboard shows "1"

#### Business Rules

**Dead letters are visible and actionable**

**Invariant:** Admin UI must display dead letter entries from all agents with
    replay/ignore actions. Each action must provide feedback via toast notification.
    Dead letters are operational concerns for system health monitoring.

    **Rationale:** Without dead letter UI, operators cannot manage failed agent event
    processing. With the removal of rule-based fallback in 22d, LLM failures create
    dead letters that MUST be visible for operator triage.

    **Dead Letter Section (within Monitoring tab):**
    | Column | Source | Purpose |
    | Agent | deadLetter.agentId | Which agent failed |
    | Event Type | deadLetter.eventType | What event failed |
    | Error | deadLetter.error | Why it failed (truncated) |
    | Status | deadLetter.status | pending/replayed/ignored |
    | Timestamp | deadLetter.createdAt | When it failed |
    | Actions | buttons | Replay / Ignore |

    **Data source:** `getDeadLetters` query from `queries/agent.ts`, supports
    filtering by agentId and status. `getDeadLetterStats` provides counts.

    **Verified by:** List displays correctly, replay works, ignore works, toast shows

_Verified by: Dead letter list displays failed events from both agents, Replay action triggers backend mutation with toast feedback, Ignore action with reason provides confirmation, Replay failure shows error toast, Filter dead letters by agent_

**Decision history supports multi-agent filtering**

**Invariant:** Decision history must be filterable by agent ID, action type, and
    time range. The tab displays audit events from all active agents, providing a
    unified view of agent decision-making across the system.

    **Rationale:** With multiple agents producing decisions, the history view must
    let operators quickly narrow to specific agents or action types. This is critical
    for debugging (why did the agent make this decision?) and analysis (how often does
    each agent trigger?).

    **Decision History Entry:**
    | Column | Source | Purpose |
    | Agent | auditEvent.agentId | Which agent made the decision |
    | Event Type | auditEvent.eventType | PatternDetected, CommandEmitted, etc. |
    | Action Type | auditEvent.payload.commandType | SuggestCustomerOutreach, FlagForVIPReview |
    | Confidence | auditEvent.payload.confidence | 0-1 confidence score |
    | Timestamp | auditEvent.timestamp | When the decision was made |
    | Detail Link | navigation | Click to expand full reasoning |

    **Filter Parameters:**
    | Filter | Default | Description |
    | Agent ID | All agents | Filter by specific agent |
    | Action Type | All actions | Filter by command type |
    | Time Range | Last 7 days | Date range filter |

    **Data source:** `getAuditEvents` query from `queries/agent.ts`, supports
    filtering by agentId and eventType.

    **Verified by:** Filters work, multi-agent data shows, detail expands

_Verified by: View decision history with decisions from both agents, Filter decision history by agent, Filter decision history by action type, View decision detail with full reasoning, Empty decision history shows guidance message_

**Actions provide feedback via toast**

**Invariant:** All mutating actions (approve, reject, replay, ignore) must show
    toast notifications for success and error states. Toasts use accessible ARIA
    attributes and auto-dismiss after a reasonable timeout.

    **Rationale:** Users need immediate feedback that their action was processed.
    The current implementation performs mutations silently — the user clicks
    "Approve" and has no visual confirmation that it worked or failed.

    **Toast Behavior:**
    | Action | Success Message | Error Behavior |
    | Approve | "Approval recorded for {agentId}" | Show error with reason |
    | Reject | "Action rejected" | Show error with reason |
    | Replay dead letter | "Dead letter replayed successfully" | Show error with reason |
    | Ignore dead letter | "Dead letter ignored" | Show error with reason |

    **Implementation:** Wrap existing mutation calls in `useApprovalActions` and
    new `useDeadLetterActions` with try/catch + `toast.success()` / `toast.error()`.
    Sonner's `<Toaster>` component added to the root layout.

    **Verified by:** Success toast appears, error toast appears, auto-dismiss works

_Verified by: Approve action shows success toast, Reject action shows success toast, Error action shows descriptive error toast, Multiple rapid actions show stacked toasts_

**High-value order agent functions end-to-end**

**Invariant:** The high-value order detection agent must detect orders above
    the value threshold ($500), analyze via LLM, and surface in the admin UI as
    a FlagForVIPReview approval — demonstrating the full agent infrastructure
    without requiring order cancellations.

    **Rationale:** A single-agent demo requires 3+ order cancellations which is
    cumbersome. The high-value order agent triggers on any expensive order, making
    it easy to demonstrate the entire agent pipeline in a presentation or review.

    **Trigger Condition:**
    | Field | Threshold | Source |
    | totalAmount | > $500 | OrderConfirmed event payload |

    **LLM Analysis Prompt Context:**
    | Data | Source | Purpose |
    | Order total | Event payload | Primary trigger value |
    | Customer ID | Event payload | Customer context for LLM |
    | Confirmed timestamp | Event payload | Recency context |

    **Verified by:** High-value order triggers agent, approval appears in admin UI

_Verified by: High-value order detected and surfaces as VIP approval, Low-value order does not trigger agent, Admin approves VIP flag for high-value order, Both agents trigger from same customer activity_

**Dashboard reflects multi-agent state**

**Invariant:** The dashboard summary cards must aggregate data across all active
    agents. Individual agent status must be distinguishable.

    **Rationale:** With two active agents, the dashboard must show which agents are
    active and give a consolidated view of the system's agent-driven activity.

    **Dashboard Cards (updated):**
    | Card | Source | Shows |
    | Pending Approvals | usePendingApprovals() | Total count across all agents |
    | Active Agents | useActiveAgents() | Count + agent name list |
    | Events Processed | checkpoint data | Total across all agents |

    **Per-Agent Detail (within dashboard or monitoring):**
    | Agent | Events Processed | Status | Last Activity |
    | churn-risk-agent | 1,247 | Active | 2 min ago |
    | high-value-order-agent | 89 | Active | 5 min ago |

    **Verified by:** Dashboard shows both agents, counts are correct

_Verified by: Dashboard shows both active agents, Pending approvals count includes both agents, One agent stopped, one active_

---

## ✅ Completed Patterns

### ✅ Agent Command Infrastructure

| Property | Value     |
| -------- | --------- |
| Status   | completed |
| Effort   | 1w        |

**Problem:** Three interconnected gaps in agent command infrastructure:
  1. **Commands go nowhere** — Agent emits commands to `agentCommands` table but nothing
     consumes or routes them to target BC handlers
  2. **No lifecycle control** — Agent cannot be paused, resumed, or reconfigured.
The `pause()`, `resume()` lifecycle hooks in `init.ts` are explicit deferred backlog items, not silent placeholders
  3. **Parallel pattern systems** — `_patterns/churnRisk.ts` defines formal `PatternDefinition`
     with `analyze()` that calls LLM, while `_config.ts` has inline `onEvent` that reimplements
     trigger logic without LLM. These are disconnected implementations

  **Solution:** Complete agent command infrastructure:
  1. **Command routing** via CommandOrchestrator — agent commands flow through existing infrastructure
  2. **Agent lifecycle FSM** — formal state machine with commands for state transitions
  3. **Unified pattern registry** — single source of truth for pattern trigger + analysis

  **Why It Matters for Convex-Native ES:**
  | Benefit | How |
  | Commands have effect | Emitted agent commands route to actual domain handlers |
  | Agent controllability | Operators can pause/resume/reconfigure agents via commands |
  | Single pattern source | One PatternDefinition powers both trigger and LLM analysis |
  | Audit completeness | Full command lifecycle tracked through Command Bus |
  | Consistent architecture | Agent commands use same infrastructure as domain commands |
  | Operational safety | Lifecycle FSM prevents invalid state transitions |

  **Current Gap: Command Emission Dead End**
  """
  Agent detects pattern
       |
       v
  emitAgentCommand()
       |
       v
  INSERT into agentCommands table
       |
       v
  ??? (nothing consumes the command)
  """

  **Target: Full Command Routing**
  """
  Agent detects pattern
       |
       v
  CommandOrchestrator.execute(agentCommandConfig)
       |
       +--> Command Bus (idempotency, audit)
       +--> Target BC handler (e.g., customerOutreach)
       +--> Event Store (CommandEmitted event)
       +--> Projection update
  """

  **Design Decision: Command Routing Approach**

  | Option | Mechanism | Trade-off |
  | A: CommandOrchestrator (Recommended) | Agent commands flow through same orchestrator as domain commands | Consistent, audited, idempotent; adds standard indirection |
  | B: Direct handler calls | Agent calls target BC mutation directly via makeFunctionReference | Simpler but bypasses command infrastructure |
  | C: Integration events | Agent publishes integration event, consumer PM handles | Loosest coupling but most complex; better for cross-system |

  **Decision:** Option A — CommandOrchestrator provides:
  - Command idempotency via Command Bus
  - Full audit trail (command recorded, status tracked)
  - Middleware pipeline (validation, logging, authorization)
  - Consistent with how all other commands work in the platform

  **Design Decision: Agent Lifecycle FSM**

  """
  stopped ──> active ──> paused ──> active
                 |                     |
                 v                     v
              stopped              stopped
                 |
                 v
           error_recovery ──> active
  """

  | State | Description | Allowed Transitions |
  | stopped | Not processing events | -> active (via StartAgent) |
  | active | Processing events normally | -> paused, stopped, error_recovery |
  | paused | Temporarily not processing, checkpoint preserved | -> active, stopped |
  | error_recovery | Automatic recovery after repeated failures | -> active (after cooldown) |

  **Lifecycle Commands:**
  | Command | Transition | Effect |
  | StartAgent | stopped -> active | Resume/start EventBus subscription from checkpoint |
  | PauseAgent | active -> paused | Stop processing, preserve checkpoint for resume |
  | ResumeAgent | paused -> active | Resume from last checkpoint position |
  | StopAgent | any -> stopped | Stop and clear subscription (checkpoint preserved) |
  | ReconfigureAgent | active/paused -> active | Update config without losing state |

  **Design Decision: Pattern System Unification**

  **Current disconnect:**
  | Implementation | Location | Uses LLM | Used in Production |
  | _config.ts onEvent (inline) | contexts/agent/_config.ts | No | Yes (EventBus handler) |
  | PatternDefinition.analyze() | contexts/agent/_patterns/churnRisk.ts | Yes | No (never called) |

  **Target: Unified pattern flow**
  1. Remove inline `onEvent` from `AgentBCConfig`
  2. Add `patterns: PatternDefinition[]` field to `AgentBCConfig`
  3. Handler uses pattern's `trigger()` to check if analysis needed
  4. Handler uses pattern's `analyze()` for LLM analysis (in action)
  5. Single definition powers both cheap rule check and expensive LLM call

  """typescript
  // Target AgentBCConfig (simplified)
  interface AgentBCConfig {
    id: string;
    subscriptions: string[];
    patterns: PatternDefinition[];  // Replaces onEvent
    confidenceThreshold: number;
    humanInLoop?: HumanInLoopConfig;
    rateLimits?: RateLimitConfig;
    // onEvent removed - patterns handle detection + analysis
  }
  """

  **SuggestCustomerOutreach Command Registration:**

  Agent commands are domain commands — they route to target BC handlers (e.g.,
  `customerOutreach`), not back to the agent. Registration follows the existing
  `commands/registry.ts` pattern used by order and inventory commands.

  """typescript
  // commands/agent/configs.ts — agent command config
  import { z } from "zod";
  import { globalRegistry } from "@libar-dev/platform-core";

  const SuggestCustomerOutreachSchema = z.object({
    customerId: z.string(),
    suggestedAction: z.string(),
    riskLevel: z.enum(["low", "medium", "high"]),
    triggeringPatternId: z.string(),
  });

  globalRegistry.register("SuggestCustomerOutreach", {
    schema: SuggestCustomerOutreachSchema,
    description: "Agent-emitted suggestion for customer outreach based on detected pattern",
    category: "agent",
    version: 1,
    handler: internal.commands.agent.handleSuggestCustomerOutreach,
    projections: [],  // No projections — handler creates follow-up task or notification
  });
  """

  **Lifecycle FSM ↔ Checkpoint Status Mapping:**

  Lifecycle commands map directly to checkpoint statuses (from stubs `schema.ts:72-77`):

  | Command | From Status | To Status | EventBus Effect | Checkpoint Effect |
  | StartAgent | stopped | active | Subscription activated from checkpoint position | Status → active |
  | PauseAgent | active | paused | Subscription deactivated | Status → paused, position preserved |
  | ResumeAgent | paused | active | Subscription reactivated from lastProcessedPosition + 1 | Status → active |
  | StopAgent | any | stopped | Subscription removed | Status → stopped, position preserved |
  | (automatic) | active | error_recovery | Subscription paused after repeated failures | Status → error_recovery, cooldown starts |
  | (automatic) | error_recovery | active | Auto-resume after cooldown period | Status → active |

  The `error_recovery` state is NOT triggered by commands but by the agent framework
  detecting repeated failures (e.g., 5 consecutive dead letters). After a configurable
  cooldown period, the agent auto-resumes to `active`. This prevents tight retry loops
  that amplify transient failures.

  **ReconfigureAgent** applies runtime config overrides stored in checkpoint's
  `configOverrides: v.optional(v.any())` field (forward-declared in stubs). Overrides
  are merged with base `AgentBCConfig` at handler invocation time, allowing threshold
  changes without redeployment.

  **Pattern Registry Concrete API:**

  """typescript
  // Agent pattern registry — maps pattern names to definitions
  const patternRegistry = new Map<string, PatternDefinition>();

  export function registerPattern(name: string, definition: PatternDefinition): void {
    if (patternRegistry.has(name)) throw new Error(`Pattern '${name}' already registered`);
    patternRegistry.set(name, definition);
  }

  export function getPattern(name: string): PatternDefinition | undefined {
    return patternRegistry.get(name);
  }

  // Registration at module init (existing patterns from _patterns/)
  registerPattern("churn-risk", churnRiskPattern);
  registerPattern("high-value-churn", highValueChurnPattern);
  """

  Agent config references patterns by name string, resolved at initialization:
  """typescript
  const churnRiskAgentConfig: AgentBCConfig = {
    id: "churn-risk-agent",
    subscriptions: ["OrderCancelled", "OrderSubmitted", "PaymentFailed"],
    patterns: ["churn-risk", "high-value-churn"],  // Resolved from registry
    confidenceThreshold: 0.8,
  };
  """

  **Migration Notes — Inline onEvent to Pattern-Based Architecture:**

  Backward-compatible transition in 4 phases:

  | Phase | Change | Breaking |
  | 1 | Add optional `patterns` field to `AgentBCConfig` (alongside existing `onEvent`) | No |
  | 2 | Handler checks: if `patterns` present → use pattern registry; if `onEvent` → legacy path | No |
  | 3 | Migrate `churnRiskAgentConfig` from `onEvent` to `patterns` array | No (both paths work) |
  | 4 | Deprecate `onEvent` field (log warning when used) | No (soft deprecation) |

  The existing `_config.ts` inline `onEvent` handler and `_patterns/churnRisk.ts` formal
  `PatternDefinition` converge into a single code path: patterns handle both cheap trigger
  evaluation (formerly inline in `onEvent`) and expensive LLM analysis (formerly unreachable
  in `_patterns/churnRisk.ts`).

#### Dependencies

- Depends on: AgentLLMIntegration

#### Acceptance Criteria

**Agent command routes through CommandOrchestrator to handler**

- Given an agent has emitted a SuggestCustomerOutreach command
- When the command is routed via CommandOrchestrator
- Then the registered handler for SuggestCustomerOutreach is called
- And the command status transitions pending -> processing -> completed
- And an audit event records the command execution

**Unknown command type is rejected with validation error**

- Given an agent emits a command with unregistered type "UnknownAction"
- When the command routing attempts to find a handler
- Then the routing fails with UNKNOWN_COMMAND_TYPE error
- And the command status transitions to "failed"
- And an audit event records the failure

**Command idempotency prevents duplicate processing**

- Given an agent emits a SuggestCustomerOutreach command with commandId "cmd_123"
- And the command has already been processed successfully
- When the same commandId is submitted again
- Then the Command Bus rejects it as a duplicate
- And no handler is called

**PauseAgent transitions active agent to paused**

- Given a churn-risk agent in "active" state
- When a PauseAgent command is executed
- Then the agent state transitions to "paused"
- And the checkpoint is preserved at current position
- And new events are not processed while paused
- And an AgentPaused audit event is recorded

**ResumeAgent resumes from checkpoint position**

- Given a churn-risk agent in "paused" state
- And the checkpoint is at position 42
- When a ResumeAgent command is executed
- Then the agent state transitions to "active"
- And event processing resumes from position 43
- And an AgentResumed audit event is recorded

**Invalid lifecycle transition is rejected**

- Given a churn-risk agent in "stopped" state
- When a PauseAgent command is executed
- Then the command is rejected with INVALID_LIFECYCLE_TRANSITION
- And the agent remains in "stopped" state
- And the rejection is recorded in audit trail

**ReconfigureAgent updates configuration without losing state**

- Given an active churn-risk agent with confidenceThreshold 0.8
- When a ReconfigureAgent command changes threshold to 0.7
- Then the agent continues from its current checkpoint
- And future analysis uses the new threshold
- And the config change is recorded in audit trail

**Agent config references patterns from registry**

- Given a pattern "churn-risk" registered in the pattern registry
- When configuring a churn-risk agent
- Then the agent config references patterns by name
- And the handler loads pattern definitions from registry at startup

**Handler uses pattern trigger for cheap detection**

- Given an event delivered to the agent handler
- When the handler evaluates patterns
- Then it calls pattern.trigger(eventHistory) first
- And only proceeds to pattern.analyze() if trigger returns true
- And this avoids unnecessary LLM calls for non-matching events

**Handler uses pattern analyze for LLM analysis**

- Given a pattern trigger has fired for 3+ cancellations
- When the handler calls pattern.analyze(eventHistory, agentContext)
- Then the LLM analysis provides confidence, reasoning, and suggested action
- And the result is wrapped in an AgentDecision
- And the analysis method is recorded as "llm" in the audit trail

**Unknown pattern name in config fails validation**

- Given an agent config referencing pattern "nonexistent-pattern"
- When the agent is initialized
- Then initialization fails with PATTERN_NOT_FOUND error
- And the error includes the pattern name for debugging

#### Business Rules

**Emitted commands are routed to handlers**

**Invariant:** Commands emitted by agents must flow through CommandOrchestrator and
    be processed by registered handlers. Commands cannot remain unprocessed in a table.

    **Rationale:** The current `agentCommands` table receives inserts from `emitAgentCommand()`
    but nothing acts on them. The emitted `SuggestCustomerOutreach` command sits with status
    "pending" forever. For the agent to have real impact, its commands must reach domain handlers.

    **Command Routing Flow:**
    | Step | Action | Component |
    | 1 | Agent decides to emit command | Agent action handler |
    | 2 | Command recorded in onComplete | Agent component |
    | 3 | CommandOrchestrator.execute() | Platform orchestrator |
    | 4 | Target BC handler processes command | Domain BC |
    | 5 | Command status updated | Agent component |

    **Verified by:** Command routes to handler, status lifecycle tracked,
    unknown command rejected

_Verified by: Agent command routes through CommandOrchestrator to handler, Unknown command type is rejected with validation error, Command idempotency prevents duplicate processing_

**Agent lifecycle is controlled via commands**

**Invariant:** Agent state changes (start, pause, resume, stop, reconfigure) must
    happen via commands, not direct database manipulation. Each transition is validated
    by the lifecycle FSM and recorded in the audit trail.

    **Rationale:** Commands provide audit trail, FSM validation, and consistent state
    transitions. Direct DB manipulation bypasses these safeguards. The lifecycle FSM
    prevents invalid transitions (e.g., pausing an already-stopped agent).

    **Verified by:** Valid transitions succeed, invalid transitions rejected,
    paused agent stops processing

_Verified by: PauseAgent transitions active agent to paused, ResumeAgent resumes from checkpoint position, Invalid lifecycle transition is rejected, ReconfigureAgent updates configuration without losing state_

**Pattern definitions are the single source of truth**

**Invariant:** Each agent references named patterns from a registry. The pattern's
    `trigger()` and `analyze()` functions are used by the event handler, eliminating
    parallel implementations.

    **Rationale:** The current codebase has two disconnected pattern implementations:
    `_config.ts` with inline rule-based detection and `_patterns/churnRisk.ts` with
    formal `PatternDefinition` including LLM analysis. This creates confusion about
    which code path runs in production and makes the LLM analysis unreachable.

    **Unified Flow:**

```text
Event arrives at agent
         |
         v
    For each pattern in agent.patterns:
         |
         +--- pattern.trigger(events) -> boolean
         |         |
         |    No?  +--- Skip to next pattern
         |    Yes? |
         |         v
         +--- pattern.analyze(events, agent) -> AnalysisResult
         |         |
         |         v
         +--- Build AgentDecision from analysis
```

**Verified by:** Config references patterns by name, handler uses pattern methods,
    inline onEvent removed

_Verified by: Agent config references patterns from registry, Handler uses pattern trigger for cheap detection, Handler uses pattern analyze for LLM analysis, Unknown pattern name in config fails validation_

---

[← Back to Roadmap](../ROADMAP.md)
