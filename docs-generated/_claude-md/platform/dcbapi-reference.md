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
