# IntegrationPatterns21b - Remaining Work

**Purpose:** Detailed remaining work for IntegrationPatterns21b

---

## Summary

**Progress:** [░░░░░░░░░░░░░░░░░░░░] 0/2 (0%)

**Remaining:** 2 patterns (0 active, 2 planned)

---

## ✅ Ready to Start

These patterns can be started immediately:

| Pattern                    | Effort | Business Value |
| -------------------------- | ------ | -------------- |
| 📋 Integration Patterns21a | 1w     | -              |

---

## ⚠️ Blocked

These patterns are waiting on dependencies:

| Pattern                 | Blocked By             | Effort |
| ----------------------- | ---------------------- | ------ |
| Integration Patterns21b | IntegrationPatterns21a | 1w     |

---

## All Remaining Patterns

### 📋 Integration Patterns21a

| Property     | Value         |
| ------------ | ------------- |
| Status       | planned       |
| Effort       | 1w            |
| Dependencies | EcstFatEvents |

**Problem:** Cross-context communication is ad-hoc. Domain events are used directly
for integration without explicit contracts, leading to tight coupling.

**Solution:** Foundational patterns for cross-context communication:

- **Context Map** — Document relationships between BCs (including Partnership, Shared Kernel, Open Host Service)
- **Published Language** — Stable schema for integration events with event tagging and compatibility modes
- **Anti-Corruption Layer (ACL)** — Translate external models to internal with validation

**Why It Matters for Convex-Native ES:**
| Benefit | How |
| Clear contracts | Published Language defines integration API |
| Protected domain | ACL prevents external model leakage |
| Documented topology | Context Map shows BC relationships |
| DCB integration | Event tags enable consistency queries (Phase 16) |
| Evolution safety | Compatibility modes control schema evolution |

**Key Concepts:**
| Concept | Description | Example |
| Context Map | Documents BC relationships | ProducerContext→ConsumerContext: Upstream/Downstream |
| Published Language | Stable versioned schema for integration | EntityCreatedV1 schema |
| Event Tagging | Tags for routing and DCB scoping | tags: { principalId: "456" } |
| Compatibility Mode | Schema evolution contract | backward / forward / full / none |
| ACL | Translates external models to domain | ExternalSystem {ext_ref} → Domain {referenceId} |

**Relationship to Phase 21b:** This spec provides foundational registry infrastructure.
Phase 21b (IntegrationPatterns21b) builds on this with schema versioning and contract testing.

#### Acceptance Criteria

**Context Map shows BC topology**

- Given the platform Context Map
- When viewing relationships
- Then ProducerContext → ConsumerContext should be "upstream-downstream"
- And ExternalSystem → IntegrationContext should be "anti-corruption-layer"

**Register Partnership relationship**

- Given BC "ProducerContext" and BC "ConsumerContext" collaborate on shared model
- When I register the relationship as "partnership"
- Then Context Map shows bidirectional partnership
- And both BCs are listed as collaborators

**Register Shared Kernel relationship**

- Given BC "SharedKernel" provides shared types to "ProducerContext" and "ConsumerContext"
- When I register the relationships as "shared-kernel"
- Then Context Map shows SharedKernel as shared kernel provider
- And dependents include ProducerContext and ConsumerContext

**Register Open Host Service relationship**

- Given BC "ProducerContext" exposes public API for external consumers
- When I register the relationship as "open-host-service"
- Then Context Map shows ProducerContext as OHS provider
- And external consumers are listed

**Duplicate relationship is rejected**

- Given relationship "ProducerContext → ConsumerContext" already exists
- When I attempt to register "ProducerContext → ConsumerContext" again
- Then an error is thrown with code "DUPLICATE_RELATIONSHIP"

**Self-referential relationship is rejected**

- Given the platform Context Map
- When I attempt to register "ProducerContext → ProducerContext"
- Then an error is thrown with code "SELF_REFERENCE"

**Integration event uses Published Language**

- Given an EntityCreated domain event
- When converting for integration
- Then toPublishedLanguage() should be called
- And result should have schemaVersion field
- And schema should be from publishedLanguage registry

**Event tagging for routing and DCB**

- Given a registered schema for "EntityCreated" v1.0.0
- And a domain event with principalId "principal_456"
- When I call toPublishedLanguage with tags { principalId: "principal_456" }
- Then result.metadata.tags contains principalId
- And tags can be used for DCB consistency queries

**Schema compatibility mode is enforced**

- Given "EntityCreated" v1.0.0 with compatibility "backward"
- When I register "EntityCreated" v2.0.0 with compatibility "full"
- Then v2.0.0 must support both forward and backward compatibility
- And consumers on v1.0.0 can still process v2.0.0 events

**Register schema with compatibility mode**

- Given a new integration event type "ResourceAllocated"
- When I call registerIntegrationSchema with version "1.0.0" and compatibility "backward"
- Then the schema is available in the registry
- And compatibility mode is stored with the schema

**Unregistered event type fails conversion**

- Given no schema registered for "UnknownEvent"
- When I call toPublishedLanguage('UnknownEvent', payload)
- Then an error is thrown with code "SCHEMA_NOT_FOUND"

**Invalid payload fails schema validation**

- Given a registered schema requiring "entityId" field
- When I call toPublishedLanguage('EntityCreated', {})
- Then an error is thrown with code "SCHEMA_VALIDATION_FAILED"
- And error details mention missing "entityId"

**ACL translates external system response**

- Given an external system response with { ext_ref, amount, unit }
- When ACL processes the response
- Then domain model should have { referenceId, value: { amount, unit } }
- And external model details should not leak to domain

**ACL handles bidirectional translation**

- Given a domain ExternalRequest model
- When I call externalACL.toExternal(domainModel)
- Then result has external format { ext_ref, amount, unit }
- And calling fromExternal() returns equivalent domain model

**ACL validates external input**

- Given an external response missing required field "ext_ref"
- When ACL processes the response
- Then an error is thrown with code "INVALID_EXTERNAL_RESPONSE"
- And the error identifies the missing field

**ACL rejects unmapped values**

- Given an external response with status: "unknown_external_status"
- When ACL processes the response
- Then an error is thrown with code "UNMAPPED_VALUE"
- And error.field equals "status"

#### Business Rules

**Context Map documents BC relationships**

**Invariant:** All BC relationships must be explicitly documented with relationship type,
upstream/downstream direction, and no duplicate or self-referential entries.

    **Rationale:** Implicit relationships lead to accidental coupling and unclear ownership.
    Explicit documentation enables architecture governance and dependency analysis.

    **Context Map Relationship Types:**
    | Relationship | Upstream | Downstream | Description |
    | upstream-downstream | ProducerContext | ConsumerContext | Producer publishes, Consumer consumes |
    | customer-supplier | ProducerContext | DownstreamContext | Downstream needs drive Producer API |
    | conformist | EventStore | All BCs | All BCs conform to event schema |
    | anti-corruption-layer | ExternalSystem | IntegrationContext | IntegrationContext translates external responses |
    | partnership | ProducerContext | ConsumerContext | Bidirectional collaboration on shared model |
    | shared-kernel | SharedKernel | ProducerContext, ConsumerContext | Shared code/types between BCs |
    | open-host-service | ProducerContext | External | Producer exposes public integration API |

    **Verified by:** Context Map shows BC topology, Register Partnership relationship,
    Register Shared Kernel relationship, Register Open Host Service relationship,
    Duplicate relationship is rejected, Self-referential relationship is rejected

_Verified by: Context Map shows BC topology, Register Partnership relationship, Register Shared Kernel relationship, Register Open Host Service relationship, Duplicate relationship is rejected, Self-referential relationship is rejected_

**Published Language defines stable contracts**

**Invariant:** Integration events must use registered schemas with explicit versioning
and compatibility modes. Unregistered event types and invalid payloads are rejected.

    **Rationale:** Ad-hoc event formats create tight coupling and break consumers on change.
    Versioned schemas with compatibility contracts enable safe evolution.

    **Published Language Registry API:**

```typescript
// Register integration event schema with compatibility mode
registerIntegrationSchema({
  eventType: "EntityCreated",
  version: "2.0.0",
  schema: EntityCreatedV2Schema,
  compatibility: "backward", // backward | forward | full | none
  backwardCompatible: ["1.0.0"],
  migrate: (payload, fromVersion) => {
    if (fromVersion === "1.0.0") {
      return { ...payload, unit: "USD" };
    }
    return payload;
  },
});
```

**toPublishedLanguage() API with Event Tagging:**

```typescript
// Convert domain event to integration event with tags for routing/DCB
const integrationEvent = toPublishedLanguage(
  "EntityCreated",
  {
    entityId: entity.id,
    principalId: entity.principalId,
    entries: entity.entries.map(toIntegrationEntry),
    createdAt: entity.createdAt,
  },
  {
    tags: {
      principalId: entity.principalId, // For DCB consistency queries
      region: entity.region, // For routing
    },
  }
);
// Returns: { type, payload, metadata: { schemaVersion, timestamp, tags } }
```

**Verified by:** Integration event uses Published Language, Event tagging for routing and DCB,
Schema compatibility mode is enforced, Register schema with compatibility mode,
Unregistered event type fails conversion, Invalid payload fails schema validation

_Verified by: Integration event uses Published Language, Event tagging for routing and DCB, Schema compatibility mode is enforced, Register schema with compatibility mode, Unregistered event type fails conversion, Invalid payload fails schema validation_

**ACL translates external models**

**Invariant:** External system data must pass through ACL translation with schema
validation before entering the domain. Unmapped values and invalid inputs are rejected.

    **Rationale:** Direct use of external models leaks foreign concepts into the domain,
    creating coupling and making the domain vocabulary impure. ACL enforces boundaries.

    **ACL Pattern:**

```typescript
// External system response (foreign model)
const externalResponse = {
  ext_ref: "ext_abc123",
  amount: 15000, // cents
  unit: "USD",
  status: "completed",
};

// ACL translates to domain model with validation
const externalACL = createACL<ExternalResponse, DomainConfirmation>({
  toInternal: (external) => ({
    referenceId: external.ext_ref,
    value: { amount: external.amount / 100, unit: external.unit },
    status: mapExternalStatus(external.status),
  }),
  toExternal: (internal) => ({
    ext_ref: internal.referenceId,
    amount: internal.value.amount * 100,
    unit: internal.value.unit,
    status: reverseMapStatus(internal.status),
  }),
  externalSchema: ExternalResponseSchema, // Zod validation
});

const domainConfirmation = externalACL.fromExternal(externalResponse);
// Domain remains clean of external concepts
await commands.confirmExternal(domainConfirmation);
```

**Verified by:** ACL translates external system response, ACL handles bidirectional translation,
ACL validates external input, ACL rejects unmapped values

_Verified by: ACL translates external system response, ACL handles bidirectional translation, ACL validates external input, ACL rejects unmapped values_

### 📋 Integration Patterns21b

| Property     | Value                  |
| ------------ | ---------------------- |
| Status       | planned                |
| Effort       | 1w                     |
| Dependencies | IntegrationPatterns21a |

**Problem:** Schema evolution breaks consumers. No tooling validates producer-consumer
compatibility, leading to runtime failures and integration bugs.

**Solution:** Schema evolution and contract testing patterns:

- **Upcasters/Downcasters** — Migrate events between schema versions
- **Contract Testing** — Validate producer-consumer compatibility
- **Violation Detection** — Detect and report contract violations (ties to Phase 18)

**Why It Matters for Convex-Native ES:**
| Benefit | How |
| Evolution safety | Upcasters migrate historical events automatically |
| Consumer protection | Downcasters support old consumers with new events |
| Early detection | Contract tests catch mismatches before production |
| Observability | Violation detection integrates with Phase 18 metrics |

**Key Concepts:**
| Concept | Description | Example |
| Upcaster | Migrates old schema to new | V1→V2 adds default unit |
| Downcaster | Transforms new schema for old consumers | V2→V1 strips new fields |
| Contract Test | Validates schema compatibility | Producer emits valid V1 |
| Contract Sample | Generated test data from schema | createContractSample('EntityCreatedV1') |
| Violation Detection | Detects mismatches at runtime | Schema mismatch metrics |

**Relationship to Phase 21a:** Depends on IntegrationPatterns21a for Published Language registry.

**Relationship to Phase 18:** Contract violation detection uses Phase 18 metrics infrastructure.
Interface is stubbed until Phase 18 provides implementation.

#### Acceptance Criteria

**V1 consumer receives V2 event**

- Given a consumer expecting EntityCreatedV1
- And producer emits EntityCreatedV2
- When event is delivered
- Then downcaster should transform to V1 format
- And consumer should process successfully

**Upcast historical events**

- Given historical events stored as V1
- When loading events for V2 consumer
- Then all events are upcasted to V2
- And default values are applied for missing fields

**Chain upcasters for multi-version migration**

- Given versions V1, V2, V3 with upcasters V1→V2 and V2→V3
- When I upcast a V1 event to V3
- Then both upcasters are applied in sequence
- And final result is valid V3

**Upcast adds computed field**

- Given V1 has { entries } array
- And V2 adds computed { entryCount }
- When upcasting V1 to V2
- Then entryCount equals entries.length

**Incompatible schema change is rejected**

- Given a V3 schema with breaking changes
- And no migration path from V2
- When attempting to register V3
- Then registration fails with code "NO_MIGRATION_PATH"

**Breaking change without migration**

- Given V2 removes required V1 field "entityId"
- When attempting to register V2 as backwardCompatible with V1
- Then an error is thrown with code "BREAKING_CHANGE"
- And error suggests registering migration function

**Contract test validates schema compatibility**

- Given EntityCreatedV1 contract
- When running contract tests
- Then producer should emit valid V1 events
- And consumer should accept valid V1 events

**Contract sample generation**

- Given a registered schema "EntityCreatedV1"
- When I call createContractSample('EntityCreatedV1')
- Then a valid sample event is generated
- And it passes schema validation

**Generate multiple unique samples**

- Given a registered schema "EntityCreatedV1"
- When I call createContractSamples('EntityCreatedV1', 10)
- Then I receive 10 unique sample events
- And all pass schema validation

**Producer contract test utility**

- Given a producer function that creates EntityCreated events
- When I run createProducerContractTest('EntityCreatedV1', producer)
- Then test passes when producer emits valid V1 events

**Consumer contract test utility**

- Given a consumer handler for EntityCreated
- When I run createConsumerContractTest('EntityCreatedV1', consumer)
- Then test passes when consumer processes sample events

**Compatible producer and consumer verified**

- Given producer emitting EntityCreatedV1
- And consumer expecting EntityCreatedV1
- When I run verifyContractCompatibility(producer, consumer, 'EntityCreatedV1')
- Then verification passes

**Compatible with downcaster**

- Given producer emitting EntityCreatedV2
- And consumer expecting EntityCreatedV1
- And downcaster V2 → V1 is registered
- When I run verifyContractCompatibility(producer, consumer)
- Then verification passes

**Detect producer-consumer mismatch**

- Given producer emitting EntityCreatedV2
- And consumer expecting EntityCreatedV1
- And no downcaster registered
- When running contract tests
- Then test fails with "SCHEMA_MISMATCH"
- And suggested fix mentions "register downcaster"

**Contract violation is recorded**

- Given a schema mismatch detected at runtime
- When violation detection processes the mismatch
- Then a ContractViolation is created
- And it includes eventType, versions, and timestamp
- And it is passed to ContractMetrics.recordViolation()

**Contract violations are queryable**

- Given multiple contract violations have been recorded
- When I call contractMetrics.getViolations(since: oneHourAgo)
- Then I receive violations from the last hour
- And they are sorted by timestamp descending

#### Business Rules

**Schema versioning enables evolution**

Old consumers continue working when schemas evolve through upcasting and downcasting.

    **Version Migration (Upcasting):**

```typescript
// V1 schema (original)
const EntityCreatedV1 = { entityId, principalId, entries };

// V2 schema (added unit)
const EntityCreatedV2 = { entityId, principalId, entries, unit };

// Upcaster: V1 → V2 (add default)
const upcastV1toV2 = (v1) => ({
  ...v1,
  unit: "USD", // Default for legacy events
});

// Downcaster: V2 → V1 (for old consumers)
const downcastV2toV1 = (v2) => {
  const { unit, ...rest } = v2;
  return rest; // Strip new field
};
```

**Chain Migration:**

```typescript
// For V1 → V3, chain through V2
const migrationPath = getMigrationPath("EntityCreated", "1.0.0", "3.0.0");
// Returns: ['1.0.0', '2.0.0', '3.0.0']

const v3Event = upcast("EntityCreated", v1Event, "1.0.0", "3.0.0");
// Automatically chains V1→V2→V3 upcasters
```

_Verified by: V1 consumer receives V2 event, Upcast historical events, Chain upcasters for multi-version migration, Upcast adds computed field, Incompatible schema change is rejected, Breaking change without migration_

**Contract tests validate integration**

Producer and consumer contracts are tested independently.
Violation detection integrates with Phase 18 metrics.

    **Contract Testing Pattern:**

```typescript
// Producer contract test
describe("ProducerContext BC - Producer Contract", () => {
  it("emits valid EntityCreatedV1 events", async () => {
    const event = await produceEntityCreatedEvent();
    const result = EntityCreatedV1.safeParse(event.payload);
    expect(result.success).toBe(true);
  });
});

// Consumer contract test
describe("DownstreamContext BC - Consumer Contract", () => {
  it("accepts valid EntityCreatedV1 events", async () => {
    const event = createContractSample("EntityCreatedV1");
    const result = await downstreamHandler.handle(event);
    expect(result.status).toBe("processed");
  });
});
```

**Violation Detection (Phase 18 integration):**

```typescript
// ContractMetrics interface (stubbed until Phase 18)
interface ContractMetrics {
  recordViolation(violation: ContractViolation): void;
  getViolations(since?: number): ContractViolation[];
}

interface ContractViolation {
  eventType: string;
  producerVersion: string;
  consumerExpectedVersion: string;
  timestamp: number;
  details: string;
}
```

_Verified by: Contract test validates schema compatibility, Contract sample generation, Generate multiple unique samples, Producer contract test utility, Consumer contract test utility, Compatible producer and consumer verified, Compatible with downcaster, Detect producer-consumer mismatch, Contract violation is recorded, Contract violations are queryable_

---

[← Back to Remaining Work](../REMAINING-WORK.md)
