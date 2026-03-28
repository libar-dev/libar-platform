# Design Review: DurableFunctionAdapters

**Purpose:** Auto-generated design review with sequence and component diagrams
**Detail Level:** Design review artifact from sequence annotations

---

**Pattern:** DurableFunctionAdapters | **Phase:** Phase 18 | **Status:** completed | **Orchestrator:** durable-adapter-bridge | **Steps:** 3 | **Participants:** 7

**Source:** `libar-platform/architect/specs/platform/durable-function-adapters.feature`

---

## Annotation Convention

This design review is generated from the following annotations:

| Tag                   | Level    | Format | Purpose                            |
| --------------------- | -------- | ------ | ---------------------------------- |
| sequence-orchestrator | Feature  | value  | Identifies the coordinator module  |
| sequence-step         | Rule     | number | Explicit execution ordering        |
| sequence-module       | Rule     | csv    | Maps Rule to deliverable module(s) |
| sequence-error        | Scenario | flag   | Marks scenario as error/alt path   |

Description markers: `**Input:**` and `**Output:**` in Rule descriptions define data flow types for sequence diagram call arrows and component diagram edges.

---

## Sequence Diagram — Runtime Interaction Flow

Generated from: `@architect-sequence-step`, `@architect-sequence-module`, `@architect-sequence-error`, `**Input:**`/`**Output:**` markers, and `@architect-sequence-orchestrator` on the Feature.

```mermaid
sequenceDiagram
    participant User
    participant durable_adapter_bridge as "durable-adapter-bridge.ts"
    participant rate_limit_adapter as "rate-limit-adapter.ts"
    participant rate_limiter_component as "rate-limiter-component.ts"
    participant dcb_retry as "dcb-retry.ts"
    participant backoff_calculator as "backoff-calculator.ts"
    participant middleware_pipeline as "middleware-pipeline.ts"
    participant workpool_mount as "workpool-mount.ts"

    User->>durable_adapter_bridge: invoke

    Note over durable_adapter_bridge: Rule 1 — Rate limiting decisions must persist across server restarts and scale horizontally via sharding—no in-memory implementations in production.

    durable_adapter_bridge->>+rate_limit_adapter: RateLimitCheckArgs
    rate_limit_adapter-->>-durable_adapter_bridge: RateLimitResult
    durable_adapter_bridge->>+rate_limiter_component: RateLimitCheckArgs
    rate_limiter_component-->>-durable_adapter_bridge: RateLimitResult

    Note over durable_adapter_bridge: Rule 2 — OCC conflicts from DCB operations must be retried automatically with exponential backoff and scope-based serialization—callers must not implement retry logic.

    durable_adapter_bridge->>+dcb_retry: DCBRetryOptions
    dcb_retry-->>-durable_adapter_bridge: DCBRetryResult
    durable_adapter_bridge->>+backoff_calculator: DCBRetryOptions
    backoff_calculator-->>-durable_adapter_bridge: DCBRetryResult

    alt Max retries exceeded returns rejected
        durable_adapter_bridge-->>User: error
        durable_adapter_bridge->>durable_adapter_bridge: exit(1)
    end

    Note over durable_adapter_bridge: Rule 3 — Adapters must plug into existing platform interfaces without requiring changes to middleware pipeline, command configs, or core orchestration logic.

    durable_adapter_bridge->>+middleware_pipeline: PlatformInterfaces
    middleware_pipeline-->>-durable_adapter_bridge: IntegrationResult
    durable_adapter_bridge->>+workpool_mount: PlatformInterfaces
    workpool_mount-->>-durable_adapter_bridge: IntegrationResult

```

---

## Component Diagram — Types and Data Flow

Generated from: `@architect-sequence-module` (nodes), `**Input:**`/`**Output:**` (edges and type shapes), deliverables table (locations), and `sequence-step` (grouping).

```mermaid
graph LR
    subgraph phase_1["Phase 1: RateLimitCheckArgs"]
        phase_1_rate_limit_adapter["rate-limit-adapter.ts"]
        phase_1_rate_limiter_component["rate-limiter-component.ts"]
    end

    subgraph phase_2["Phase 2: DCBRetryOptions"]
        phase_2_dcb_retry["dcb-retry.ts"]
        phase_2_backoff_calculator["backoff-calculator.ts"]
    end

    subgraph phase_3["Phase 3: PlatformInterfaces"]
        phase_3_middleware_pipeline["middleware-pipeline.ts"]
        phase_3_workpool_mount["workpool-mount.ts"]
    end

    subgraph orchestrator["Orchestrator"]
        durable_adapter_bridge["durable-adapter-bridge.ts"]
    end

    subgraph types["Key Types"]
        RateLimitResult{{"RateLimitResult\n-----------\nallowed\nretryAfterMs"}}
        DCBRetryResult{{"DCBRetryResult\n-----------\nstatus\nretryKey\nscheduledAt"}}
        IntegrationResult{{"IntegrationResult\n-----------\nrateLimiterMounted\ndcbRetryPoolMounted"}}
    end

    phase_1_rate_limit_adapter -->|"RateLimitResult"| durable_adapter_bridge
    phase_1_rate_limiter_component -->|"RateLimitResult"| durable_adapter_bridge
    phase_2_dcb_retry -->|"DCBRetryResult"| durable_adapter_bridge
    phase_2_backoff_calculator -->|"DCBRetryResult"| durable_adapter_bridge
    phase_3_middleware_pipeline -->|"IntegrationResult"| durable_adapter_bridge
    phase_3_workpool_mount -->|"IntegrationResult"| durable_adapter_bridge
    durable_adapter_bridge -->|"RateLimitCheckArgs"| phase_1_rate_limit_adapter
    durable_adapter_bridge -->|"RateLimitCheckArgs"| phase_1_rate_limiter_component
    durable_adapter_bridge -->|"DCBRetryOptions"| phase_2_dcb_retry
    durable_adapter_bridge -->|"DCBRetryOptions"| phase_2_backoff_calculator
    durable_adapter_bridge -->|"PlatformInterfaces"| phase_3_middleware_pipeline
    durable_adapter_bridge -->|"PlatformInterfaces"| phase_3_workpool_mount
```

---

## Key Type Definitions

| Type                | Fields                                  | Produced By                                | Consumed By |
| ------------------- | --------------------------------------- | ------------------------------------------ | ----------- |
| `RateLimitResult`   | allowed, retryAfterMs                   | rate-limit-adapter, rate-limiter-component |             |
| `DCBRetryResult`    | status, retryKey, scheduledAt           | dcb-retry, backoff-calculator              |             |
| `IntegrationResult` | rateLimiterMounted, dcbRetryPoolMounted | middleware-pipeline, workpool-mount        |             |

---

## Design Questions

Verify these design properties against the diagrams above:

| #    | Question                             | Auto-Check                      | Diagram   |
| ---- | ------------------------------------ | ------------------------------- | --------- |
| DQ-1 | Is the execution ordering correct?   | 3 steps in monotonic order      | Sequence  |
| DQ-2 | Are all interfaces well-defined?     | 3 distinct types across 3 steps | Component |
| DQ-3 | Is error handling complete?          | 1 error paths identified        | Sequence  |
| DQ-4 | Is data flow unidirectional?         | Review component diagram edges  | Component |
| DQ-5 | Does validation prove the full path? | Review final step               | Both      |

---

## Findings

Record design observations from reviewing the diagrams above. Each finding should reference which diagram revealed it and its impact on the spec.

| #   | Finding                                     | Diagram Source | Impact on Spec |
| --- | ------------------------------------------- | -------------- | -------------- |
| F-1 | (Review the diagrams and add findings here) | —              | —              |

---

## Summary

The DurableFunctionAdapters design review covers 3 sequential steps across 7 participants with 3 key data types and 1 error paths.
