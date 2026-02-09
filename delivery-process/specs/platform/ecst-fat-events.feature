@libar-docs
@libar-docs-event-sourcing
@libar-docs-release:v0.2.0
@libar-docs-pattern:EcstFatEvents
@libar-docs-status:completed
@libar-docs-unlock-reason:Initial-implementation-complete
@libar-docs-phase:20
@libar-docs-effort:1w
@libar-docs-product-area:Platform
@libar-docs-depends-on:DeciderPattern
@libar-docs-executable-specs:platform-core/tests/features/behavior/ecst
Feature: ECST / Fat Events - Event-Carried State Transfer

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

  Background: Deliverables
    Given the following deliverables:
      | Deliverable | Status | Location | Tests | Test Type |
      | Event category type (fat/thin) | complete | @libar-dev/platform-core/src/events/category.ts | Yes | unit |
      | FatEvent interface | complete | @libar-dev/platform-core/src/ecst/types.ts | Yes | unit |
      | createFatEvent() builder | complete | @libar-dev/platform-core/src/ecst/builder.ts | Yes | unit |
      | embedEntity() helper | complete | @libar-dev/platform-core/src/ecst/embed.ts | Yes | unit |
      | embedCollection() helper | complete | @libar-dev/platform-core/src/ecst/embed.ts | Yes | unit |
      | Schema versioning support | complete | @libar-dev/platform-core/src/ecst/versioning.ts | Yes | unit |
      | Crypto-shredding markers | complete | @libar-dev/platform-core/src/ecst/privacy.ts | Yes | unit |
      | Fat events documentation | complete | docs/architecture/FAT-EVENTS.md | No | - |

  Rule: Fat events enable service independence
    Consumers don't need to query source BC for context.

    **Current State (thin event - requires back-query):**
    """typescript
    // Thin event - consumer must query source BC
    const event = {
      type: 'OrderSubmitted',
      payload: { orderId: 'ord_123' }
    };
    // Consumer: "I need customer name... let me query Orders BC"
    const order = await ordersBC.getOrder(event.payload.orderId);
    """

    **Target State (fat event - self-contained):**
    """typescript
    // Fat event - consumer has all context
    const event = createFatEvent('OrderSubmitted', {
      orderId: 'ord_123',
      customer: embedEntity(customer, ['id', 'name', 'email']),
      items: embedCollection(orderItems),
      totalAmount: 150.00
    });
    // Consumer: "I have everything I need!"
    """

    @acceptance-criteria
    Scenario: Consumer processes event without back-query
      Given an "OrderSubmitted" fat event with customer details embedded
      When the inventory service receives the event
      Then it should not query the orders BC
      And it should use embedded customer name for the reservation

  Rule: Builder utilities handle schema versioning
    Fat events include schema version for upcasting support.

    @acceptance-criteria
    Scenario: Fat event includes schema version
      Given an "OrderSubmitted" fat event
      When created with createFatEvent()
      Then schemaVersion field should be included
      And version should match current schema definition

  Rule: Crypto-shredding markers identify PII fields
    GDPR compliance requires marking personal data for deletion.

    @acceptance-criteria
    Scenario: PII fields are marked for shredding
      Given a fat event with customerEmail field
      When embedEntity is called with crypto-shredding option
      Then the field should be marked as shreddable
      And deletion process can identify PII fields

  Rule: Use fat events for cross-context integration
    Same-context projections can use thin events for efficiency.

    @acceptance-criteria
    Scenario Outline: Event type selection by use case
      Given an event for "<use_case>"
      When determining event type
      Then it should be "<event_type>"

      Examples:
        | use_case | event_type |
        | Cross-context integration | fat |
        | Same-context projection | thin |
        | Published Language contract | fat |
        | High-frequency internal event | thin |
