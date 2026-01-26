@libar-docs
@libar-docs-implements:EventStoreDurability
@acceptance-criteria
Feature: Outbox Handler Pattern

  Creates durable onComplete handlers for capturing action results as domain events.
  The outbox pattern ensures that external API results (success or failure) are
  reliably captured as events using idempotent append.

  # ============================================================================
  # Outbox Handler Factory
  # ============================================================================

  @happy-path
  Scenario: createOutboxHandler returns a callable function
    When creating an outbox handler with standard configuration
    Then the result should be a function

  @happy-path
  Scenario: Outbox handler extracts idempotency key from context
    Given an outbox handler configured to use orderId for idempotency key
    When processing a success result with orderId "ord-123"
    Then the idempotency key should be "payment:ord-123"

  @happy-path
  Scenario: Outbox handler builds PaymentCompleted event from success result
    Given an outbox handler for payment events
    When processing success result with chargeId "ch-456" and orderId "ord-123"
    Then the event type should be "PaymentCompleted"
    And the event data should contain chargeId "ch-456"

  @happy-path
  Scenario: Outbox handler builds PaymentFailed event from failure result
    Given an outbox handler for payment events
    When processing failure result with error "Card declined" and orderId "ord-123"
    Then the event type should be "PaymentFailed"
    And the event data should contain error "Card declined"

  # ============================================================================
  # Outbox Handler Integration
  # ============================================================================

  @happy-path
  Scenario: Outbox handler calls idempotentAppendEvent internally
    Given an outbox handler with mock event store
    When processing a result with orderId "ord-123"
    Then idempotentAppendEvent should be invoked
    And the event should include bounded context "orders"

  @validation
  Scenario: Outbox handler completes without error for duplicates
    Given an outbox handler where idempotent append returns duplicate
    When processing a result with existing idempotency key
    Then the handler should complete successfully
