# 📋 Integration Patterns21a

**Purpose:** Detailed documentation for the Integration Patterns21a pattern

---

## Overview

| Property | Value   |
| -------- | ------- |
| Status   | planned |
| Category | DDD     |
| Phase    | 21      |

## Description

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

## Dependencies

- Depends on: EcstFatEvents

## Acceptance Criteria

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

## Business Rules

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

---

[← Back to Pattern Registry](../PATTERNS.md)
