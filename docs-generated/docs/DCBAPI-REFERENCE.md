# DCBAPIReference

**Purpose:** Full documentation generated from decision document
**Detail Level:** detailed

---

This feature file demonstrates code-first documentation generation.
  The API reference is extracted directly from annotated TypeScript source files,
  proving that documentation can be a projection of code.

  **Key Insight:** DCB enables cross-entity invariant validation within a single
  bounded context with scope-based OCC.

---

## Context

### Why DCB Exists

**Problem:** Traditional approaches to multi-entity coordination have significant
    drawbacks:
    - **Saga coordination** provides only eventual consistency
    - **Sequential commands** create race condition windows
    - **Aggregate enlargement** violates single responsibility

    **Solution:** DCB provides atomic validation across multiple entities with
    scope-based optimistic concurrency control (OCC), all within a single
    bounded context.

## Decision

### Scope-Based OCC

DCB uses a scope key to coordinate multiple entities atomically.

    **Scope Key Format:** `tenant:${tenantId}:${scopeType}:${scopeId}`

    The tenant prefix is mandatory to ensure multi-tenant isolation at the scope level.

## Implementation Details

### Core Types

```typescript
/**
 * Branded type for DCB scope keys.
 *
 * Format: `tenant:${tenantId}:${scopeType}:${scopeId}`
 *
 * The brand ensures type safety - you can't accidentally pass a regular
 * string where a validated scope key is expected.
 *
 * @example
 * ```typescript
 * const scopeKey = createScopeKey("t1", "reservation", "res_123");
 * // Type: DCBScopeKey (branded string)
 * ```
 */
type DCBScopeKey = string & { readonly __brand: "DCBScopeKey" };
```

```typescript
/**
 * Parsed components of a scope key.
 */
interface ParsedScopeKey {
  /** Tenant ID for isolation */
  tenantId: string;
  /** Type of scope (e.g., "reservation", "order") */
  scopeType: string;
  /** Unique ID within the scope type */
  scopeId: string;
  /** Original scope key */
  raw: DCBScopeKey;
}
```

```typescript
/**
 * Validation error for scope keys.
 */
interface ScopeKeyValidationError {
  code: "INVALID_SCOPE_KEY_FORMAT" | "TENANT_ID_REQUIRED" | "SCOPE_KEY_EMPTY";
  message: string;
}
```

```typescript
/**
 * DCB scope metadata as stored in dcbScopes table.
 */
interface DCBScope {
  /** Unique scope key */
  scopeKey: DCBScopeKey;
  /** Current version for OCC */
  currentVersion: number;
  /** Tenant ID for isolation */
  tenantId: string;
  /** Type of scope */
  scopeType: string;
  /** Unique ID within scope type */
  scopeId: string;
  /** Creation timestamp */
  createdAt: number;
  /** Last update timestamp */
  lastUpdatedAt: number;
  /** Stream IDs participating in this scope (for virtual streams) */
  streamIds?: string[];
}
```

```typescript
/**
 * Entity state within a DCB scope.
 *
 * Represents one entity (CMS document) participating in a scope operation.
 */
interface DCBEntityState<TCms, TId = unknown> {
  /** Stream ID of this entity */
  streamId: string;
  /** Current CMS state */
  cms: TCms;
  /** Document ID for updates */
  _id: TId;
}
```

```typescript
/**
 * Aggregated state for DCB decider.
 *
 * Contains all entity states within the scope, enabling cross-entity
 * invariant validation in the pure decider function.
 */
interface DCBAggregatedState<TCms> {
  /** Scope key for this operation */
  scopeKey: DCBScopeKey;
  /** Current scope version (for OCC) */
  scopeVersion: number;
  /** Map of streamId → entity state */
  entities: Map<string, DCBEntityState<TCms>>;
}
```

```typescript
/**
 * State updates returned by DCB decider.
 *
 * Maps streamId to the update for that entity. Only entities with updates
 * in this map will be modified.
 */
type DCBStateUpdates<TUpdate> = Map<string, TUpdate>;
```

```typescript
/**
 * Result from executeWithDCB.
 */
type DCBExecutionResult<TData extends object> =
  | DCBSuccessResult<TData>
  | DCBRejectedResult
  | DCBFailedResult
  | DCBConflictResult;
```

```typescript
/**
 * Successful DCB execution result.
 */
interface DCBSuccessResult<TData extends object> {
  status: "success";
  /** Data returned from decider */
  data: TData;
  /** New scope version after commit */
  scopeVersion: number;
  /** Events to append to Event Store */
  events: EventData[];
}
```

```typescript
/**
 * Rejected DCB execution (business rule violation, no events emitted).
 */
interface DCBRejectedResult {
  status: "rejected";
  /** Error code */
  code: string;
  /** Human-readable reason */
  reason: string;
  /** Optional context */
  context?: UnknownRecord;
}
```

```typescript
/**
 * Failed DCB execution (business failure with event).
 */
interface DCBFailedResult {
  status: "failed";
  /** Failure reason */
  reason: string;
  /** Events to append (failure events) */
  events: EventData[];
  /** Optional context */
  context?: UnknownRecord;
}
```

```typescript
/**
 * OCC conflict detected during DCB execution.
 */
interface DCBConflictResult {
  status: "conflict";
  /** Current scope version (different from expected) */
  currentVersion: number;
}
```

## Consequences

### When to Use DCB vs Alternatives

| Criterion | DCB | Saga | Regular Decider |
    | --- | --- | --- | --- |
    | Scope | Single BC | Cross-BC | Single entity |
    | Consistency | Atomic | Eventual | Atomic |
    | Use Case | Multi-product reservation | Order fulfillment | Simple updates |

## Source Mapping - Content Extraction Configuration

The following table defines which content is extracted from which source files:

    | Section | Source File | Extraction Method |
    | --- | --- | --- |
    | Core Types | packages/platform-core/src/dcb/types.ts | @extract-shapes tag |
