# Fat Events Architecture (ECST)

> **Event-Carried State Transfer for Service Independence**

---

## Overview

Fat Events implement the **Event-Carried State Transfer (ECST)** pattern where events carry full context needed by downstream consumers, eliminating query dependencies between bounded contexts.

### Problem: Thin Events Require Back-Queries

```typescript
// Thin event - consumer must query source BC
const event = {
  type: "OrderSubmitted",
  payload: { orderId: "ord_123" },
};

// Consumer: "I need customer name... let me query Orders BC"
const order = await ordersBC.getOrder(event.payload.orderId);
```

**Issues with thin events:**

- Creates coupling between BCs
- Requires synchronous communication
- Fails if source BC is unavailable
- Higher latency for consumers

### Solution: Fat Events with Embedded Context

```typescript
// Fat event - consumer has all context
const event = createFatEvent("OrderSubmitted", {
  orderId: "ord_123",
  customer: embedEntity(customer, ["id", "name", "email"]),
  items: embedCollection(orderItems),
  totalAmount: 150.0,
});

// Consumer: "I have everything I need!"
```

---

## API Reference

### createFatEvent()

Creates a fat event with embedded context.

```typescript
function createFatEvent<T>(
  eventType: string,
  payload: T,
  options?: FatEventOptions<T>
): FatEvent<T>;

interface FatEventOptions<T> {
  schema?: FatEventSchema<T>;
  correlationId?: string;
}
```

**Behavior:**

- Auto-generates timestamp
- Defaults schemaVersion to "1.0.0" if no schema provided
- Validates payload against schema if provided
- Throws "Schema validation failed" on validation failure

**Example:**

```typescript
import { createFatEvent } from "@libar-dev/platform-core";

const event = createFatEvent("OrderSubmitted", {
  orderId: "ord_123",
  totalAmount: 150.0,
});

// With schema validation
const schema: FatEventSchema<OrderPayload> = {
  version: "2.0.0",
  validate: (p): p is OrderPayload => "orderId" in p,
};

const validatedEvent = createFatEvent("OrderSubmitted", payload, { schema });
```

### embedEntity()

Embeds selected fields from an entity.

```typescript
function embedEntity<T extends object>(
  entity: T,
  fields?: (keyof T)[],
  options?: EmbedOptions
): Partial<T>;

interface EmbedOptions {
  shred?: string[]; // Fields to mark for crypto-shredding
}
```

**Behavior:**

- If fields array provided, includes only those fields
- If no fields array, includes all fields
- Throws "Field 'xxx' not found" for non-existent fields
- Marks fields for crypto-shredding if specified

**Example:**

```typescript
const customer = {
  id: "c1",
  name: "Alice",
  email: "alice@example.com",
  internalNotes: "VIP",
};

// Embed selected fields
embedEntity(customer, ["id", "name", "email"]);
// Result: { id: "c1", name: "Alice", email: "alice@example.com" }

// With privacy markers
embedEntity(customer, ["id", "name", "email"], { shred: ["email"] });
// Result: { id: "c1", name: "Alice", email: { value: "alice@example.com", __shred: true } }
```

### embedCollection()

Embeds a collection of entities.

```typescript
function embedCollection<T extends object>(
  items: T[],
  fields?: (keyof T)[],
  options?: EmbedOptions
): Partial<T>[];
```

**Example:**

```typescript
const items = [
  { productId: "p1", name: "Widget", quantity: 2, internalSku: "SKU001" },
  { productId: "p2", name: "Gadget", quantity: 1, internalSku: "SKU002" },
];

embedCollection(items, ["productId", "name", "quantity"]);
// Result: [
//   { productId: "p1", name: "Widget", quantity: 2 },
//   { productId: "p2", name: "Gadget", quantity: 1 },
// ]
```

---

## Schema Versioning

Fat events use semver strings for schema versioning (e.g., "1.0.0", "2.0.0").

### migrateEvent()

Migrates a fat event to a target schema version.

```typescript
function migrateEvent<T>(event: FatEvent, targetSchema: FatEventSchema<T>): FatEvent<T>;
```

**Behavior:**

- Returns unchanged if versions match
- Applies schema.migrate() if version differs
- Throws "No migration path from x.x.x" if no migration available

**Example:**

```typescript
// V1 event
const eventV1 = {
  type: "OrderSubmitted",
  payload: { orderId: "ord_123", amount: 100 },
  metadata: { timestamp: Date.now(), schemaVersion: "1.0.0" },
};

// V2 schema with migration
const schemaV2: FatEventSchema<V2Payload> = {
  version: "2.0.0",
  validate: (p): p is V2Payload => "currency" in p,
  migrate: (p, from) => {
    if (from === "1.0.0") {
      return { ...p, currency: "USD" };
    }
    throw new Error(`No migration path from ${from}`);
  },
};

const eventV2 = migrateEvent(eventV1, schemaV2);
// eventV2.metadata.schemaVersion = "2.0.0"
// eventV2.payload.currency = "USD"
```

---

## Crypto-Shredding (GDPR Compliance)

Fat events support marking PII fields for GDPR-compliant deletion.

### findShreddableFields()

Finds all fields marked for shredding.

```typescript
function findShreddableFields(event: FatEvent): string[];
// Returns JSON paths like ["payload.customer.email"]
```

### shredEvent()

Redacts all marked PII fields and returns an audit trail.

```typescript
function shredEvent(event: FatEvent, correlationId?: string): ShredResult;
// Returns { event, audit } with RedactedValue objects

// ShredResult type:
interface ShredResult {
  event: FatEvent<unknown>;
  audit: {
    shreddedAt: number;
    fieldsShredded: string[];
    eventType: string;
    correlationId?: string; // Links to erasure request
  };
}

// RedactedValue type:
interface RedactedValue {
  __redacted: true;
  originalType: "string" | "number" | "boolean" | "object" | "array" | "null";
  redactedAt: number;
}
```

**Example:**

```typescript
// Create event with PII markers
const customer = embedEntity(
  { id: "c1", name: "Alice", email: "alice@example.com" },
  ["id", "name", "email"],
  { shred: ["email"] }
);

const event = createFatEvent("OrderSubmitted", {
  orderId: "ord_123",
  customer,
});

// Find shreddable fields
findShreddableFields(event);
// Result: ["payload.customer.email"]

// Shred PII when processing deletion request
const { event: shredded, audit } = shredEvent(event, "erasure-req-123");
// shredded.payload.customer.email === { __redacted: true, originalType: "string", redactedAt: 1705571234567 }
// audit.fieldsShredded === ["payload.customer.email"]
// audit.correlationId === "erasure-req-123"

// Check if a value was redacted
import { isRedactedValue } from "@libar-dev/platform-core";
if (isRedactedValue(shredded.payload.customer.email)) {
  console.log("Email was redacted");
}
```

---

## When to Use Fat vs Thin Events

| Use Fat Events When          | Use Thin Events When      |
| ---------------------------- | ------------------------- |
| Cross-context integration    | Same-context projections  |
| Service independence needed  | High-frequency events     |
| Consumers can't query back   | Minimal payload preferred |
| Published Language contracts | Internal domain events    |

### Decision Tree

```
Cross-BC communication needed?
├── Yes → Fat Event
└── No
    └── High-frequency (>100/sec)?
        ├── Yes → Thin Event
        └── No
            └── Published Language contract?
                ├── Yes → Fat Event
                └── No → Either (prefer thin for efficiency)
```

---

## Event Category Mapping

| Category      | Suggested Type | Rationale                    |
| ------------- | -------------- | ---------------------------- |
| `integration` | Fat            | Cross-BC, Published Language |
| `logic`       | Thin           | Internal, projection trigger |
| `view`        | Either         | Depends on consumer location |
| `reporting`   | Fat            | Analytics may be external    |

---

## Best Practices

1. **Selective Embedding**: Only include fields consumers actually need
2. **Mark PII Early**: Apply crypto-shredding markers at embedding time
3. **Version Schemas**: Use semver for contract evolution
4. **Validate Early**: Use schema validation in createFatEvent()
5. **Immutable Events**: Never modify events after creation

---

## Related Documentation

- [COMPONENT_ISOLATION.md](./COMPONENT_ISOLATION.md) - BC isolation patterns
- [reactive-projections.md](./reactive-projections.md) - Event consumption
- [dcb-architecture.md](./dcb-architecture.md) - Cross-entity operations
