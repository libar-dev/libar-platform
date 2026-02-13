# 🚧 Agent BC Component Isolation

**Purpose:** Detailed requirements for the Agent BC Component Isolation feature

---

## Overview

| Property     | Value    |
| ------------ | -------- |
| Status       | active   |
| Product Area | Platform |
| Phase        | 22       |

## Description

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

## Acceptance Criteria

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

## Business Rules

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

## Deliverables

- Agent component definition (pending)
- Agent component schema (pending)
- Checkpoint public API (pending)
- Audit public API (pending)
- Dead letter public API (pending)
- Command public API (pending)
- Approval public API (pending)
- Cross-component query pattern (pending)
- Design session methodology (complete)
- Argument injection pattern (complete)

---

[← Back to Product Requirements](../PRODUCT-REQUIREMENTS.md)
