@libar-docs
@libar-docs-status:completed
@libar-docs-implements:AgentAsBoundedContext
@libar-docs-phase:22
@libar-docs-product-area:Platform
@agent
Feature: Agent Event Subscription

  As a platform developer
  I want agents to subscribe to event streams via EventBus
  So that agents can react to business events in real-time

  This feature validates the EventBus subscription mechanism
  for agent bounded contexts.

  Background: Agent Module
    Given the agent module is imported from platform-core
    And the EventBus is available

  # ============================================================================
  # Basic Subscription
  # ============================================================================

  Rule: Agents subscribe to specific event types

    EventBus delivers matching events to agent handlers.

    @acceptance-criteria @happy-path
    Scenario: Subscribe to single event type
      Given an agent BC with subscription to "OrderSubmitted"
      When an OrderSubmitted event is published
      Then the agent receives the event
      And event has full fat-event payload

    @acceptance-criteria @happy-path
    Scenario: Subscribe to multiple event types
      Given an agent BC with subscriptions:
        | eventType |
        | OrderSubmitted |
        | OrderCancelled |
        | PaymentFailed |
      When each event type is published
      Then the agent receives all three events

    @acceptance-criteria @edge-case
    Scenario: Agent does not receive unsubscribed events
      Given an agent BC subscribed to "OrderSubmitted" only
      When an OrderCancelled event is published
      Then the agent does not receive the event

  # ============================================================================
  # Event Filtering
  # ============================================================================

  Rule: Subscriptions support filters

    Agents can filter events before processing.

    @acceptance-criteria @happy-path
    Scenario: Filter by payload field
      Given an agent subscribed with filter: amount > 100
      When OrderSubmitted with amount 50 is published
      And OrderSubmitted with amount 150 is published
      Then the agent receives only the amount=150 event

    @acceptance-criteria @happy-path
    Scenario: Filter by customer segment
      Given an agent subscribed with filter: customer.segment = 'premium'
      When event for premium customer is published
      And event for standard customer is published
      Then the agent receives only the premium customer event

  # ============================================================================
  # Event Ordering
  # ============================================================================

  Rule: Events are delivered in order

    Event ordering is preserved for consistent analysis.

    @acceptance-criteria @happy-path
    Scenario: Events delivered in publication order
      Given an agent subscribed to OrderSubmitted
      When events E1, E2, E3 are published in sequence
      Then the agent receives events in order: E1, E2, E3

    @acceptance-criteria @happy-path
    Scenario: Events from same stream maintain order
      Given events for customer "cust_123" with sequence 1, 2, 3
      When agent processes events
      Then events are processed in sequence order

    @acceptance-criteria @edge-case
    Scenario: Agent resumes from last processed position after restart
      Given an agent subscribed to OrderSubmitted
      And agent has processed events up to position 100
      When server restarts
      And agent subscription resumes
      Then processing continues from position 101
      And no events are reprocessed
      And no events are lost

  # ============================================================================
  # Checkpoint Management
  # ============================================================================

  Rule: Agent checkpoint tracks processing progress

    Checkpoint enables durability for Workpool-based agents.

    @acceptance-criteria @edge-case
    Scenario: Checkpoint updated after successful analysis
      Given an agent subscribed to OrderSubmitted
      And agent has processed events up to position 100
      When an event at position 101 is successfully analyzed
      Then the checkpoint should be updated to position 101
      And eventsProcessed counter should increment by 1
      And lastEventId should be updated

    @acceptance-criteria @edge-case
    Scenario: Failed analysis records to dead letter without advancing checkpoint
      Given an agent subscribed to OrderSubmitted
      And agent has processed events up to position 100
      When analysis of event at position 101 fails
      Then the checkpoint should remain at position 100
      And a dead letter should be recorded with the error
      And eventsProcessed counter should not increment

    @acceptance-criteria @validation
    Scenario: Checkpoint persists agent subscription state
      Given an agent with id "churn-detector"
      And subscription is active
      When checkpoint is queried
      Then it returns:
        | field | type |
        | agentId | "churn-detector" |
        | status | "active" |
        | lastProcessedPosition | number |
        | eventsProcessed | number |

  # ============================================================================
  # Subscription Lifecycle
  # ============================================================================

  Rule: Subscriptions can be paused and resumed

    Agent can temporarily stop receiving events.

    @acceptance-criteria @happy-path
    Scenario: Pause subscription
      Given an active agent subscription
      When I call subscription.pause()
      And events are published
      Then the agent does not receive events during pause

    @acceptance-criteria @happy-path
    Scenario: Resume subscription
      Given a paused agent subscription
      When I call subscription.resume()
      And events are published
      Then the agent receives new events

    @acceptance-criteria @validation
    Scenario: Unsubscribe stops all event delivery
      Given an active agent subscription
      When I call subscription.unsubscribe()
      Then subsequent events are not delivered to agent
