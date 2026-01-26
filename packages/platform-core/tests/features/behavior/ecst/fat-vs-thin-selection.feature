@libar-docs
@libar-docs-status:completed
@libar-docs-unlock-reason:Initial-implementation-complete
@libar-docs-implements:EcstFatEvents
@libar-docs-phase:20
@libar-docs-product-area:PlatformCore
@ecst
Feature: Fat vs Thin Event Selection

  As a platform developer
  I want guidelines for when to use fat vs thin events
  So that I make appropriate trade-offs between payload size and independence

  This feature documents the decision criteria for choosing between
  fat events (ECST) and thin events for different use cases.

  Selection Guidelines:
  - Fat: Cross-context integration, Service independence needed, Consumers cannot query back, Published Language contracts
  - Thin: Same-context projections, High-frequency events, Minimal payload preferred, Internal domain events

  Background: Event Categories
    Given the event category taxonomy is available
    And sample use cases for different event types

  # ============================================================================
  # Cross-Context Integration
  # ============================================================================

  Rule: Cross-context integration should use fat events

    For events crossing bounded context boundaries, include full context.

    @acceptance-criteria @happy-path
    Scenario Outline: Event type for integration scenarios
      Given an event for "<scenario>"
      When determining appropriate event type
      Then "<event_type>" should be used
      And reason is "<reason>"

      Examples:
        | scenario | event_type | reason |
        | Orders BC to Inventory BC | fat | Cross-BC, no back-query possible |
        | Orders BC to Shipping BC | fat | Cross-BC, needs customer address |
        | Orders BC to own projection | thin | Same context, can query |
        | Audit log projection | thin | Same context, reference only |

  # ============================================================================
  # High-Frequency Events
  # ============================================================================

  Rule: High-frequency internal events should prefer thin events

    Payload size matters for frequently emitted events.

    @acceptance-criteria @happy-path
    Scenario: InventoryUpdated as thin event
      Given an "InventoryUpdated" event occurring 1000 times/second
      When evaluating event type
      Then thin event is recommended
      And reason is "High frequency, same-context consumers can query"

    @acceptance-criteria @happy-path
    Scenario: OrderSubmitted as fat event
      Given an "OrderSubmitted" event occurring 10 times/second
      And multiple downstream consumers in different contexts
      When evaluating event type
      Then fat event is recommended
      And reason is "Cross-context consumers, low frequency"

  # ============================================================================
  # Published Language
  # ============================================================================

  Rule: Published Language contracts require fat events

    Integration contracts must be self-contained.

    @acceptance-criteria @happy-path
    Scenario: Published Language event is fat
      Given an event defined in Published Language schema
      When checking event requirements
      Then event must be fat
      And must include all fields defined in the contract
      And schemaVersion must match Published Language version

  # ============================================================================
  # Event Category Validation
  # ============================================================================

  Rule: Event category can indicate fat/thin preference

    The event taxonomy can suggest appropriate event types.

    @acceptance-criteria @happy-path
    Scenario Outline: Category suggests event type
      Given an event with category "<category>"
      When checking suggested event type
      Then suggested type is "<suggested_type>"

      Examples:
        | category | suggested_type |
        | integration | fat |
        | logic | thin |
        | view | thin or fat |
        | reporting | fat |
