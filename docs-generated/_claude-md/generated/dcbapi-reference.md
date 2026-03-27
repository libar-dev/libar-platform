# DCBAPIReference

**Purpose:** Compact reference for Claude context
**Detail Level:** summary

---

## Overview

### Core Types

- `DCBScopeKey` - type
- `ParsedScopeKey` - interface
- `ScopeKeyValidationError` - interface
- `DCBScope` - interface
- `ScopeVersionCheckResult` - type
- `ScopeCommitResult` - type
- `ScopeOperations` - interface
- `DCBEntityState` - interface
- `DCBAggregatedState` - interface
- `DCBStateUpdates` - type
- `DCBDecider` - type
- `DCBEntityConfig` - interface
- `ExecuteWithDCBConfig` - interface
- `DCBExecutionResult` - type
- `DCBSuccessResult` - interface
- `DCBRejectedResult` - interface
- `DCBFailedResult` - interface
- `DCBConflictResult` - interface
- `DCBDeferredResult` - interface
- `DCBRetryResult` - type

### Scope Key Utilities

- `SCOPE_KEY_PREFIX` - const
- `createScopeKey` - function
- `tryCreateScopeKey` - function
- `parseScopeKey` - function
- `validateScopeKey` - function
- `isValidScopeKey` - function
- `assertValidScopeKey` - function
- `isScopeTenant` - function
- `extractTenantId` - function
- `extractScopeType` - function
- `extractScopeId` - function

### executeWithDCB Flow

```typescript
import { executeWithDCB, createScopeKey } from "@libar-dev/platform-core/dcb";

const result = await executeWithDCB(ctx, {
  scopeKey: createScopeKey("tenant_1", "reservation", "res_123"),
  expectedVersion: 0,
  boundedContext: "inventory",
  streamType: "Reservation",
  schemaVersion: 1,
  entities: {
    streamIds: ["product-1", "product-2"],
    loadEntity: async (ctx, streamId) => {
      const product = await inventoryRepo.tryLoad(ctx, streamId);
      return product ? { cms: product, _id: product._id } : null;
    },
  },
  decider: reserveMultipleDecider,
  command: { orderId: "order_456", items },
  applyUpdate: async (ctx, _id, cms, update, version, timestamp) => {
    await ctx.db.patch(_id, { ...update, version, updatedAt: timestamp });
  },
  commandId: "cmd_789",
  correlationId: "corr_abc",
});

switch (result.status) {
  case "success":
    // Append result.events to Event Store
    break;
  case "rejected":
    // Business rule violation - result.code, result.reason
    break;
  case "conflict":
    // OCC conflict - retry with fresh state
    break;
}
```

```mermaid
flowchart TD
        A[1. Validate Scope Key] --> B[2. Load All Entities]
        B --> C[3. Build Aggregated State]
        C --> D[4. Execute Pure Decider]
        D --> E{Result Status?}
        E -->|rejected| F[Return Rejection<br/>No events, no state changes]
        E -->|failed| G[Return Failure<br/>With failure event]
        E -->|success| H[5. Check Scope Version OCC]
        H --> I{Version Match?}
        I -->|no| J[Return Conflict<br/>currentVersion in result]
        I -->|yes| K[6. Apply State Updates]
        K --> L[7. Return Success<br/>data + scopeVersion + events]

        style A fill:#e1f5fe
        style D fill:#fff3e0
        style E fill:#fce4ec
        style I fill:#fce4ec
        style L fill:#e8f5e9
```
