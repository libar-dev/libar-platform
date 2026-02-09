# ✅ Ecst Fat Events

**Purpose:** Detailed requirements for the Ecst Fat Events feature

---

## Overview

| Property     | Value     |
| ------------ | --------- |
| Status       | completed |
| Product Area | Platform  |
| Phase        | 20        |

## Description

**Problem:** Thin events require consumers to query back to the source BC,
creating coupling and requiring synchronous communication.

**Solution:** Event-Carried State Transfer (ECST) - events carry full context
for downstream consumers, eliminating back-queries:

- **Thin Event:** `{ type: 'OrderCreated', orderId: 'ord_123' }`
- **Fat Event:** `{ type: 'OrderCreated', orderId, customerId, customerName, items, totalAmount }`

**Why It Matters for Convex-Native ES:**
| Benefit | How |
| Service Independence | Consumers don't need to query source BC |
| Decoupled Evolution | Source can change without breaking consumers |
| Offline Processing | Event contains everything needed |
| Published Language | Fat events define the integration contract |

**Key Concepts:**
| Concept | Description | Example |
| embedEntity | Snapshot entity fields into event | embedEntity(customer, ['id', 'name']) |
| embedCollection | Snapshot collection into event | embedCollection(orderItems) |
| schemaVersion | Track structure for upcasting | schemaVersion: 2 |
| cryptoShred | Mark PII for GDPR deletion | { field: 'email', shred: true } |

## Acceptance Criteria

**Consumer processes event without back-query**

- Given an "OrderSubmitted" fat event with customer details embedded
- When the inventory service receives the event
- Then it should not query the orders BC
- And it should use embedded customer name for the reservation

**Fat event includes schema version**

- Given an "OrderSubmitted" fat event
- When created with createFatEvent()
- Then schemaVersion field should be included
- And version should match current schema definition

**PII fields are marked for shredding**

- Given a fat event with customerEmail field
- When embedEntity is called with crypto-shredding option
- Then the field should be marked as shreddable
- And deletion process can identify PII fields

**Event type selection by use case**

- Given an event for "<use_case>"
- When determining event type
- Then it should be "<event_type>"

## Business Rules

**Fat events enable service independence**

Consumers don't need to query source BC for context.

    **Current State (thin event - requires back-query):**

```typescript
// Thin event - consumer must query source BC
const event = {
  type: "OrderSubmitted",
  payload: { orderId: "ord_123" },
};
// Consumer: "I need customer name... let me query Orders BC"
const order = await ordersBC.getOrder(event.payload.orderId);
```

**Target State (fat event - self-contained):**

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

_Verified by: Consumer processes event without back-query_

**Builder utilities handle schema versioning**

Fat events include schema version for upcasting support.

_Verified by: Fat event includes schema version_

**Crypto-shredding markers identify PII fields**

GDPR compliance requires marking personal data for deletion.

_Verified by: PII fields are marked for shredding_

**Use fat events for cross-context integration**

Same-context projections can use thin events for efficiency.

_Verified by: Event type selection by use case_

## Deliverables

- Event category type (fat/thin) (complete)
- FatEvent interface (complete)
- createFatEvent() builder (complete)
- embedEntity() helper (complete)
- embedCollection() helper (complete)
- Schema versioning support (complete)
- Crypto-shredding markers (complete)
- Fat events documentation (complete)

---

[← Back to Product Requirements](../PRODUCT-REQUIREMENTS.md)
