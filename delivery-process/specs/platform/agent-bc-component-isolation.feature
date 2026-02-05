@libar-docs
@libar-docs-release:v0.2.0
@libar-docs-pattern:AgentBCComponentIsolation
@libar-docs-status:roadmap
@libar-docs-phase:22a
@libar-docs-effort:1w
@libar-docs-product-area:Platform
@libar-docs-depends-on:AgentAsBoundedContext
@libar-docs-executable-specs:platform-core/tests/features/behavior/agent/component-isolation
Feature: Agent BC Component Isolation - Physical Bounded Context Enforcement

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

  **Component Isolation Constraints (per platform architecture):**
  | Constraint | Impact on Agent Component |
  | No ctx.auth inside component | Pass userId as argument to all handlers |
  | IDs become strings at boundary | Use business IDs (agentId, eventId) not Convex doc IDs |
  | Sub-transactions | Agent writes commit independently from parent mutations |
  | No process.env | Pass configuration (API keys, model names) as arguments |

  Background: Deliverables
    Given the following deliverables:
      | Deliverable | Status | Location | Tests | Test Type |
      | Agent component definition | planned | @libar-dev/platform-core/src/agent/component/convex.config.ts | Yes | unit |
      | Agent component schema | planned | @libar-dev/platform-core/src/agent/component/schema.ts | Yes | unit |
      | Checkpoint public API | planned | @libar-dev/platform-core/src/agent/component/checkpoints.ts | Yes | unit |
      | Audit public API | planned | @libar-dev/platform-core/src/agent/component/audit.ts | Yes | unit |
      | Dead letter public API | planned | @libar-dev/platform-core/src/agent/component/deadLetters.ts | Yes | unit |
      | Command public API | planned | @libar-dev/platform-core/src/agent/component/commands.ts | Yes | unit |
      | Approval public API | planned | @libar-dev/platform-core/src/agent/component/approvals.ts | Yes | unit |
      | Cross-component query pattern | planned | @libar-dev/platform-core/src/agent/cross-bc-query.ts | Yes | integration |
      | Migration guide | planned | docs/migration/AGENT-COMPONENT-MIGRATION.md | No | - |

  # ============================================================================
  # RULE 1: Agent Component Provides Isolated Database
  # ============================================================================

  Rule: Agent component provides isolated database

    **Invariant:** All agent-specific state (checkpoints, audit events, dead letters,
    commands, pending approvals) must reside in the agent component's isolated database.
    No agent data in the shared app schema.

    **Rationale:** Physical BC isolation prevents accidental coupling. Parent app mutations
    cannot query agent tables directly — this is enforced by Convex's component architecture,
    not just convention. This matches the orders/inventory pattern where each BC owns its
    tables via `defineComponent()`.

    **Verified by:** Component isolation test, API boundary test, schema separation test

    @acceptance-criteria @happy-path
    Scenario: Agent component registers with isolated schema
      Given the agent component is defined with defineComponent
      When the app mounts the agent component via app.use
      Then the agent's tables are isolated from the app schema
      And the app cannot directly query agentCheckpoints
      And all access goes through components.agent.* handlers

    @acceptance-criteria @happy-path
    Scenario: Component API provides full CRUD for checkpoints
      Given the agent component is mounted
      When a checkpoint is created via components.agent.checkpoints.load
      Then the checkpoint is stored in the component's isolated database
      And it can be updated via components.agent.checkpoints.update
      And it can be queried via components.agent.checkpoints.load

    @acceptance-criteria @validation
    Scenario: Direct table access is not possible from parent
      Given the agent component is mounted
      When the parent app attempts ctx.db.query("agentCheckpoints")
      Then the query returns no results
      And agent data is only accessible through component API handlers

    @acceptance-criteria @edge-case
    Scenario: Component sub-transactions provide isolation
      Given a parent mutation that calls agent component handlers
      When the agent component handler throws an error
      And the parent catches the exception
      Then only the agent component write is rolled back
      And the parent mutation's other writes succeed

  # ============================================================================
  # RULE 2: Cross-Component Queries Use Explicit API
  # ============================================================================

  Rule: Cross-component queries use explicit API

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

    @acceptance-criteria @happy-path
    Scenario: Agent handler receives projection data as argument
      Given the agent event handler is triggered by an OrderCancelled event
      When the handler needs customer cancellation history
      Then it receives the history as a pre-loaded argument
      And it does not directly query customerCancellations table

    @acceptance-criteria @edge-case
    Scenario: Missing projection data returns empty result
      Given a new customer with no cancellation history
      When the agent handler receives an event for this customer
      Then the cancellation history argument is an empty array
      And the handler proceeds with rule-based analysis
      And no error is thrown

    @acceptance-criteria @happy-path
    Scenario: App-level queries can access agent data via component API
      Given the admin UI needs to display agent audit events
      When it queries via components.agent.audit.queryAuditEvents
      Then it receives the audit events for the requested agent
      And the query respects agent component boundaries
