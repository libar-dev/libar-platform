# Design Review: WorkpoolPartitioningStrategy

**Purpose:** Auto-generated design review with sequence and component diagrams
**Detail Level:** Design review artifact from sequence annotations

---

**Pattern:** WorkpoolPartitioningStrategy | **Phase:** Phase 18 | **Status:** completed | **Orchestrator:** partition-key-selection | **Steps:** 6 | **Participants:** 5

**Source:** `libar-platform/architect/specs/platform/workpool-partitioning-strategy.feature`

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
    participant partition_key_selection as "partition-key-selection.ts"
    participant partition_helpers as "partition-helpers.ts"
    participant complexity_classifier as "complexity-classifier.ts"
    participant validation as "validation.ts"
    participant dcb_retry as "dcb-retry.ts"

    User->>partition_key_selection: invoke

    Note over partition_key_selection: Rule 1 — Events for the same entity must process in the exact order they occurred in the Event Store—no out-of-order processing per entity.

    partition_key_selection->>+partition_helpers: EntityPartitionArgs
    partition_helpers-->>-partition_key_selection: PartitionKey

    Note over partition_key_selection: Rule 2 — All events affecting a customer's aggregate view must process in FIFO order for that customer—regardless of which entity generated the event.

    partition_key_selection->>+partition_helpers: CustomerPartitionArgs
    partition_helpers-->>-partition_key_selection: PartitionKey

    Note over partition_key_selection: Rule 3 — Global aggregate projections must serialize all updates—no concurrent writes to the same aggregate document.

    partition_key_selection->>+partition_helpers: RollupCharacteristics
    partition_helpers-->>-partition_key_selection: PartitionKey

    Note over partition_key_selection: Rule 4 — Events within a saga/workflow must process in causal order across all bounded contexts—saga step N+1 must not process before step N.

    partition_key_selection->>+partition_helpers: SagaPartitionArgs
    partition_helpers-->>-partition_key_selection: PartitionKey

    Note over partition_key_selection: Rule 5 — Every projection config must have an explicit `getPartitionKey` function—implicit or missing partition keys are rejected at validation time.

    partition_key_selection->>+complexity_classifier: ProjectionConfig
    complexity_classifier-->>-partition_key_selection: ValidationResult
    partition_key_selection->>+validation: ProjectionConfig
    validation-->>-partition_key_selection: ValidationResult

    alt Missing partition key fails validation
        partition_key_selection-->>User: error
        partition_key_selection->>partition_key_selection: exit(1)
    end

    alt Invalid partition key shape fails validation
        partition_key_selection-->>User: error
        partition_key_selection->>partition_key_selection: exit(1)
    end

    Note over partition_key_selection: Rule 6 — DCB retry partition keys must derive from scope keys so retries serialize with new operations on the same scope—no interleaving.

    partition_key_selection->>+partition_helpers: DCBScopeKey
    partition_helpers-->>-partition_key_selection: PartitionKey
    partition_key_selection->>+dcb_retry: DCBScopeKey
    dcb_retry-->>-partition_key_selection: PartitionKey

```

---

## Component Diagram — Types and Data Flow

Generated from: `@architect-sequence-module` (nodes), `**Input:**`/`**Output:**` (edges and type shapes), deliverables table (locations), and `sequence-step` (grouping).

```mermaid
graph LR
    subgraph phase_1["Phase 1: EntityPartitionArgs"]
        phase_1_partition_helpers["partition-helpers.ts"]
    end

    subgraph phase_2["Phase 2: CustomerPartitionArgs"]
        phase_2_partition_helpers["partition-helpers.ts"]
    end

    subgraph phase_3["Phase 3: RollupCharacteristics"]
        phase_3_partition_helpers["partition-helpers.ts"]
    end

    subgraph phase_4["Phase 4: SagaPartitionArgs"]
        phase_4_partition_helpers["partition-helpers.ts"]
    end

    subgraph phase_5["Phase 5: ProjectionConfig"]
        phase_5_complexity_classifier["complexity-classifier.ts"]
        phase_5_validation["validation.ts"]
    end

    subgraph phase_6["Phase 6: DCBScopeKey"]
        phase_6_partition_helpers["partition-helpers.ts"]
        phase_6_dcb_retry["dcb-retry.ts"]
    end

    subgraph orchestrator["Orchestrator"]
        partition_key_selection["partition-key-selection.ts"]
    end

    subgraph types["Key Types"]
        PartitionKey{{"PartitionKey\n-----------\nname\nvalue"}}
        ValidationResult{{"ValidationResult\n-----------\nvalid\nstrategy\nrationale"}}
    end

    phase_1_partition_helpers -->|"PartitionKey"| partition_key_selection
    phase_2_partition_helpers -->|"PartitionKey"| partition_key_selection
    phase_3_partition_helpers -->|"PartitionKey"| partition_key_selection
    phase_4_partition_helpers -->|"PartitionKey"| partition_key_selection
    phase_5_complexity_classifier -->|"ValidationResult"| partition_key_selection
    phase_5_validation -->|"ValidationResult"| partition_key_selection
    phase_6_partition_helpers -->|"PartitionKey"| partition_key_selection
    phase_6_dcb_retry -->|"PartitionKey"| partition_key_selection
    partition_key_selection -->|"EntityPartitionArgs"| phase_1_partition_helpers
    partition_key_selection -->|"CustomerPartitionArgs"| phase_2_partition_helpers
    partition_key_selection -->|"RollupCharacteristics"| phase_3_partition_helpers
    partition_key_selection -->|"SagaPartitionArgs"| phase_4_partition_helpers
    partition_key_selection -->|"ProjectionConfig"| phase_5_complexity_classifier
    partition_key_selection -->|"ProjectionConfig"| phase_5_validation
    partition_key_selection -->|"DCBScopeKey"| phase_6_partition_helpers
    partition_key_selection -->|"DCBScopeKey"| phase_6_dcb_retry
```

---

## Key Type Definitions

| Type               | Fields                     | Produced By                                                                                              | Consumed By |
| ------------------ | -------------------------- | -------------------------------------------------------------------------------------------------------- | ----------- |
| `PartitionKey`     | name, value                | partition-helpers, partition-helpers, partition-helpers, partition-helpers, partition-helpers, dcb-retry |             |
| `ValidationResult` | valid, strategy, rationale | complexity-classifier, validation                                                                        |             |

---

## Design Questions

Verify these design properties against the diagrams above:

| #    | Question                             | Auto-Check                      | Diagram   |
| ---- | ------------------------------------ | ------------------------------- | --------- |
| DQ-1 | Is the execution ordering correct?   | 6 steps in monotonic order      | Sequence  |
| DQ-2 | Are all interfaces well-defined?     | 2 distinct types across 6 steps | Component |
| DQ-3 | Is error handling complete?          | 2 error paths identified        | Sequence  |
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

The WorkpoolPartitioningStrategy design review covers 6 sequential steps across 5 participants with 2 key data types and 2 error paths.
