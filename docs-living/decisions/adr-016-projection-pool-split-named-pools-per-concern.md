# ADR-016: PDR 016 Projection Pool Split Named Pools Per Concern

**Purpose:** Architecture decision record for PDR 016 Projection Pool Split Named Pools Per Concern

---

## Overview

| Property | Value        |
| -------- | ------------ |
| Status   | accepted     |
| Category | architecture |

## Context

| Traffic                             | Risk when sharing one pool                                 |
| ----------------------------------- | ---------------------------------------------------------- |
| Primary projections                 | Latency-sensitive read-model freshness can regress         |
| Saga routing                        | Deep workflow dispatch can compete with projection updates |
| Secondary projection / event fanout | Wide fanout bursts can starve primary projection work      |

The tranche-2 packet adds more async traffic classes than the original single-pool design handled cleanly.

    Traffic classes:


    Known constraint: upstream Workpool still does not provide the native FIFO `key:` ordering contract needed for
    general projection serialization. This ADR does not invent fake ordering semantics around that missing feature.

## Decision

| Concern                    | Pool           | Canonical callers                                                       |
| -------------------------- | -------------- | ----------------------------------------------------------------------- |
| Primary projection updates | projectionPool | command config primary projection, failed projection                    |
| Saga router dispatch       | sagaPool       | `CommandOrchestrator.sagaRoute`                                         |
| Secondary fanout dispatch  | fanoutPool     | secondary projections, EventBus default pool, IntegrationEventPublisher |

| Surface                        | Decision                                                |
| ------------------------------ | ------------------------------------------------------- |
| `OrchestratorDependencies`     | Requires `projectionPool`, `sagaPool`, and `fanoutPool` |
| Example app composition root   | Mounts all three named pools explicitly                 |
| EventBus default pool          | fanoutPool                                              |
| IntegrationEventPublisher pool | fanoutPool                                              |

The canonical named-pool topology is:


    Dependency contract:

## Consequences

Positive outcomes:
    - Primary projection latency is insulated from saga and fanout bursts
    - Saga routing and wide fanout become observable as separate queue concerns
    - The topology is explicit at the orchestrator boundary instead of being implicit in app wiring

    Negative outcomes:
    - App infrastructure must mount and wire more named Workpool components
    - Tests and codegen surfaces must stay aligned with the expanded pool topology

---

[← Back to All Decisions](../DECISIONS.md)
