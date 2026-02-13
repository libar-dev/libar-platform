# ConfirmedOrderCancellation - Remaining Work

**Purpose:** Detailed remaining work for ConfirmedOrderCancellation

---

## Summary

**Progress:** [██████████░░░░░░░░░░] 3/6 (50%)

**Remaining:** 3 patterns (3 active, 0 planned)

---

## 🚧 In Progress

| Pattern                         | Effort | Business Value |
| ------------------------------- | ------ | -------------- |
| 🚧 Agent BC Component Isolation | 1w     | -              |
| 🚧 Agent LLM Integration        | 1w     | -              |
| 🚧 Confirmed Order Cancellation | 2d     | -              |

---

## All Remaining Patterns

### 🚧 Agent BC Component Isolation

| Property     | Value                 |
| ------------ | --------------------- |
| Status       | active                |
| Effort       | 1w                    |
| Dependencies | AgentAsBoundedContext |

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
| agentCheckpoints | Agent component schema | Via components.agent.checkpoints._ |
| agentAuditEvents | Agent component schema | Via components.agent.audit._ |
| agentDeadLetters | Agent component schema | Via components.agent.deadLetters._ |
| agentCommands | Agent component schema | Via components.agent.commands._ |
| pendingApprovals | Agent component schema | Via components.agent.approvals.\* |

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

app.use(agentBC); // BC: checkpoints, audit, commands, approvals
app.use(agent, { name: "llmAgent" }); // LLM: threads, messages, embeddings
app.use(workpool, { name: "agentPool" }); // Dedicated pool for agent actions
"""

**Data Flow with Peer Components:**
"""
EventBus → agentPool.enqueueAction() → app-level action handler
action: ctx.runQuery(agentBC.checkpoints._) + llmAgent.generateText()
onComplete: ctx.runMutation(agentBC.audit._) + ctx.runMutation(agentBC.checkpoints.\*)
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

#### Acceptance Criteria

**Agent component registers with isolated schema**

- Given the agent component is defined with defineComponent
- When the app mounts the agent component via app.use
- Then the agent's tables are isolated from the app schema
- And the app cannot directly query agentCheckpoints
- And all access goes through components.agent.\* handlers

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

### 🚧 Agent LLM Integration

| Property     | Value                     |
| ------------ | ------------------------- |
| Status       | active                    |
| Effort       | 1w                        |
| Dependencies | AgentBCComponentIsolation |

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

1. Fall back to rule-based confidence scoring (existing logic in \_config.ts)
2. Record fallback decision with `analysisMethod: "rule-based-fallback"` in audit
3. Apply lower confidence threshold for fallback decisions (configurable)

This ensures the agent continues providing value even without LLM access.

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
2. Handler falls back to rule-based confidence scoring
3. Decision audit records `analysisMethod: "rule-based-fallback"` and `circuitState: "open"`
4. Circuit half-opens after timeout, allowing one probe request

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

**LLM unavailable falls back to rule-based analysis**

- Given an agent configured with LLM runtime
- And the LLM API returns an error or times out
- When the action handler processes the event
- Then it falls back to rule-based confidence scoring
- And the decision audit records analysisMethod as "rule-based-fallback"
- And processing continues without failure

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
- And the event falls back to rule-based analysis

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
}): RegisteredAction<"internal", AgentEventHandlerArgs, AgentDecision>;
```

**Verified by:** Action calls LLM, onComplete persists, fallback works, timeout handled

_Verified by: Agent action handler calls LLM and returns decision, onComplete mutation persists decision atomically, Action handler rejects invalid agent configuration, LLM unavailable falls back to rule-based analysis, Action failure triggers dead letter via onComplete_

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

### 🚧 Confirmed Order Cancellation

| Property     | Value                                    |
| ------------ | ---------------------------------------- |
| Status       | active                                   |
| Effort       | 2d                                       |
| Dependencies | SagaOrchestration, AgentAsBoundedContext |

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
    .withIndex("by_orderId", (q) => q.eq("orderId", event.payload.orderId))
    .first();

  // Only release if reservation exists and is not already released
  if (orderStatus?.reservationId && orderStatus.reservationStatus !== "released") {
    return [
      {
        commandType: "ReleaseReservation",
        payload: {
          reservationId: orderStatus.reservationId,
          reason: `Order ${event.payload.orderId} cancelled: ${event.payload.reason}`,
        },
        causationId: event.eventId,
        correlationId: event.correlationId,
      },
    ];
  }

  return []; // No command to emit
}
```

_Verified by: Reservation is released after confirmed order cancellation, Cancelling draft order does not trigger reservation release, Cancelling submitted order with pending reservation releases it, PM is idempotent for duplicate OrderCancelled events_

**Agent BC demo flow is enabled**

The primary use case is enabling the Agent BC churn risk detection demo.

_Verified by: Three cancellations trigger churn risk agent_

---

[← Back to Remaining Work](../REMAINING-WORK.md)
