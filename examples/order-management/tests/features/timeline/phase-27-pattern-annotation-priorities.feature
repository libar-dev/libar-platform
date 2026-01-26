Feature: Pattern Annotation Prioritization
  Prioritize core infrastructure patterns for annotation to support roadmap design.

  **Problem:**
  - PATTERNS.md needs annotations in @convex-es/* packages
  - New roadmap milestones require understanding core patterns first
  - Current annotation coverage is sparse
  - Need strategic prioritization, not exhaustive annotation

  **Solution:**
  - Prioritize core infrastructure patterns that inform roadmap decisions:
    1. Middleware (command/event flow)
    2. Event Bus (event delivery mechanism)
    3. Command Orchestrator (7-step lifecycle)
    4. CMS (Command Model State)
    5. Handlers (command/event handling)
  - Annotate foundational patterns before advanced ones
  - Use @libar-docs-roadmap tag for patterns relevant to planned phases
  - Progressive annotation: annotate per PR as code is touched

  **Priority Tiers:**
  | Tier | Category | Examples | Business Value |
  |------|----------|----------|----------------|
  | P0 | Core Infrastructure | Middleware, EventBus, Orchestrator | Required for all commands |
  | P1 | Domain Modeling | CMS, Handlers, Decider | Required for BC implementation |
  | P2 | Persistence | EventStore, Repository | Required for data access |
  | P3 | Coordination | Projections, Sagas, ProcessManager | Required for read models/workflows |

  Background: Deliverables
    Given the following deliverables:
      | Deliverable | Status | Tests | Location | Release |
      | Annotate Middleware pattern in @libar-dev/platform-core | Pending | No | deps/libar-dev-packages/packages/platform/core/src/middleware/ | - |
      | Annotate EventBus pattern in @libar-dev/platform-core | Pending | No | deps/libar-dev-packages/packages/platform/core/src/eventbus/ | - |
      | Annotate CommandOrchestrator pattern | Pending | No | deps/libar-dev-packages/packages/platform/core/src/orchestration/ | - |
      | Annotate CMS (Command Model State) pattern | Pending | No | deps/libar-dev-packages/packages/platform/core/src/cms/ | - |
      | Annotate Handlers pattern | Pending | No | deps/libar-dev-packages/packages/platform/core/src/handlers/ | - |
      | Annotate Decider pattern (from Phase 14) | Pending | No | deps/libar-dev-packages/packages/platform/core/src/decider/ | - |
      | Annotate EventStore component patterns | Pending | No | packages/@convex-es/event-store/src/ | - |
      | Annotate CommandBus component patterns | Pending | No | packages/@convex-es/command-bus/src/ | - |
      | Define progressive annotation policy in CLAUDE.md | Pending | No | CLAUDE.md | - |
      | Verify docs:patterns generates comprehensive catalog | Pending | No | docs-living/PATTERNS.md | - |

  @acceptance-criteria
  Scenario: Core patterns are documented for roadmap planning
    Given P0 and P1 patterns are annotated
    When designing new roadmap phases
    Then pattern docs provide architectural context
    And relationships between patterns are visible

  @acceptance-criteria
  Scenario: Progressive annotation policy is sustainable
    Given annotation policy is defined
    When developers touch code
    Then they annotate changed/related patterns
    And annotation coverage grows organically
