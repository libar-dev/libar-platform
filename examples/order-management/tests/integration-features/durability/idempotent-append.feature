@integration @durability @idempotent-append
Feature: Idempotent Event Append (App Integration)
  As a developer using the order-management app
  I want event appends with idempotency keys to be deduplicated
  So that retried operations don't create duplicate events

  The idempotent append pattern ensures each logical event is stored
  exactly once, regardless of how many times the append is retried.
  This is critical for:
  - Command result events (payment confirmation, order submission)
  - Saga step events (compensation handling)
  - Scheduled job events (expiration processing)

  Background:
    Given the backend is running and clean

  Rule: First append with unique idempotency key creates event

    @happy-path
    Scenario: Append event with unique idempotency key succeeds
      Given a unique idempotency key for stream "Order"
      When I append an event with the idempotency key
      Then the append result status should be "appended"
      And the event should be queryable by idempotency key
      And the event should exist in the stream

    @happy-path
    Scenario: Different idempotency keys create separate events
      Given a unique idempotency key "key-A" for stream "Order"
      And a unique idempotency key "key-B" for stream "Order"
      When I append an event with idempotency key "key-A"
      And I append an event with idempotency key "key-B"
      Then both events should exist in the stream
      And they should have different event IDs

  Rule: Duplicate append with same idempotency key returns existing event

    @duplicate
    Scenario: Second append with same idempotency key returns duplicate
      Given an event was already appended with idempotency key "dup-key-001"
      When I append another event with idempotency key "dup-key-001"
      Then the append result status should be "duplicate"
      And the result should contain the original event ID
      And only one event should exist with that idempotency key

    @duplicate
    Scenario: Duplicate append preserves original event data
      Given an event with payload "original data" was appended with key "preserve-key"
      When I append an event with different payload "new data" using key "preserve-key"
      Then the append result status should be "duplicate"
      And the event in the store should have payload "original data"

  Rule: Idempotency works across different stream types

    @cross-stream
    Scenario: Same idempotency key on different streams creates separate events
      Given a unique base key "cross-stream-key"
      When I append to stream "Order:ord-001" with key "cross-stream-key:Order:ord-001"
      And I append to stream "Inventory:inv-001" with key "cross-stream-key:Inventory:inv-001"
      Then both appends should succeed with status "appended"
      And both streams should have their respective events
