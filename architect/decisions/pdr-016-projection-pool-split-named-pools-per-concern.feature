@architect
@architect-adr:016
@architect-adr-status:accepted
@architect-adr-category:architecture
@architect-pattern:PDR016ProjectionPoolSplitNamedPoolsPerConcern
@architect-status:completed
@architect-completed:2026-04-22
@architect-release:vNEXT
@architect-quarter:Q2-2026
@architect-product-area:Platform
@architect-infra
Feature: PDR-016 - projectionPool Split into Named Pools per Concern

  Background: Deliverables
    Given the following deliverables:
      | Deliverable | Status | Location |
      | Decision spec (this file) | accepted | libar-platform/architect/decisions/pdr-016-projection-pool-split-named-pools-per-concern.feature |
      | Orchestrator named-pool dependency contract | complete | libar-platform/packages/platform-core/src/orchestration/types.ts |
      | Projection / saga / fanout routing implementation | complete | libar-platform/packages/platform-core/src/orchestration/CommandOrchestrator.ts |
      | Example-app pool mounting and wiring | complete | libar-platform/examples/order-management/convex/convex.config.ts and infrastructure.ts |
      | Pool routing regression coverage | complete | libar-platform/packages/platform-core/tests/features/behavior/orchestration/command-orchestrator.feature |

  Rule: Context - One projectionPool created avoidable head-of-line contention

    The tranche-2 packet adds more async traffic classes than the original single-pool design handled cleanly.

    Traffic classes:

    | Traffic | Risk when sharing one pool |
    | Primary projections | Latency-sensitive read-model freshness can regress |
    | Saga routing | Deep workflow dispatch can compete with projection updates |
    | Secondary projection / event fanout | Wide fanout bursts can starve primary projection work |

    Known constraint: upstream Workpool still does not provide the native FIFO `key:` ordering contract needed for
    general projection serialization. This ADR does not invent fake ordering semantics around that missing feature.

  Rule: Decision - The orchestrator and app infrastructure use three named pools by concern

    The canonical named-pool topology is:

    | Concern | Pool | Canonical callers |
    | Primary projection updates | projectionPool | command config primary projection, failed projection |
    | Saga router dispatch | sagaPool | `CommandOrchestrator.sagaRoute` |
    | Secondary fanout dispatch | fanoutPool | secondary projections, EventBus default pool, IntegrationEventPublisher |

    Dependency contract:

    | Surface | Decision |
    | `OrchestratorDependencies` | Requires `projectionPool`, `sagaPool`, and `fanoutPool` |
    | Example app composition root | Mounts all three named pools explicitly |
    | EventBus default pool | fanoutPool |
    | IntegrationEventPublisher pool | fanoutPool |

    @acceptance-criteria @happy-path
    Scenario: Secondary fanout and saga routing no longer share the primary projection pool
      Given the orchestrator is configured with projectionPool, sagaPool, and fanoutPool
      When a command triggers a primary projection, a secondary projection, and a saga route
      Then the primary projection stays on projectionPool
      And the secondary projection runs on fanoutPool
      And the saga route runs on sagaPool

    @acceptance-criteria @validation
    Scenario: The pool split does not claim nonexistent Workpool ordering behavior
      Given upstream Workpool still lacks the general native `key:` ordering feature for projections
      When the pool split is documented and implemented
      Then no fake FIFO guarantee is added around projectionPool, sagaPool, or fanoutPool
      And ordering expectations remain limited to the capabilities actually provided upstream

  Rule: Consequences - Isolation improves without changing command semantics

    Positive outcomes:
    - Primary projection latency is insulated from saga and fanout bursts
    - Saga routing and wide fanout become observable as separate queue concerns
    - The topology is explicit at the orchestrator boundary instead of being implicit in app wiring

    Negative outcomes:
    - App infrastructure must mount and wire more named Workpool components
    - Tests and codegen surfaces must stay aligned with the expanded pool topology
