@unit @agent
Feature: Agent Subscription - Mutation Overload

  The createAgentSubscription() factory creates valid EventSubscription objects
  with correct naming, priority, event filtering, handler args transformation,
  partition key extraction, batch creation, and agentId memoization.
  The defaultAgentTransform function handles all PublishedEvent fields and edge cases.

  Rule: createAgentSubscription produces correct subscription properties

    **Invariant:** createAgentSubscription must produce a subscription with correct name (including or excluding context), default or custom priority, correct event filter, and attached handler reference.
    **Verified by:** Asserting name, priority, filter, and handler on the returned subscription.

    @acceptance-criteria @happy-path
    Scenario: Subscription with context has correct name
      Given a churn risk agent definition with id "churn-risk-agent" and context "orders"
      And a mock mutation handler
      When I create a mutation subscription
      Then the subscription name is "agent:orders:churn-risk-agent"

    Scenario: Subscription without context has correct name
      Given a simple agent definition with id "simple-agent" subscribing to "EventA"
      And a mock mutation handler
      When I create a mutation subscription
      Then the subscription name is "agent:simple-agent"

    Scenario: Subscription uses default priority of 250
      Given a churn risk agent definition with id "churn-risk-agent" and context "orders"
      And a mock mutation handler
      When I create a mutation subscription
      Then the subscription priority is 250

    Scenario: Subscription uses custom priority
      Given a churn risk agent definition with id "churn-risk-agent" and context "orders"
      And a mock mutation handler
      When I create a mutation subscription with priority 300
      Then the subscription priority is 300

    Scenario: Subscription filter contains correct event types
      Given a churn risk agent definition with id "churn-risk-agent" and context "orders"
      And a mock mutation handler
      When I create a mutation subscription
      Then the subscription filter contains event types:
        | eventType      |
        | OrderCancelled |
        | OrderRefunded  |
      And the subscription filter has 2 event types

    Scenario: Subscription attaches the handler reference
      Given a churn risk agent definition with id "churn-risk-agent" and context "orders"
      And a mock mutation handler
      When I create a mutation subscription
      Then the subscription handler is the mock handler

  Rule: toHandlerArgs transforms event to AgentEventHandlerArgs

    **Invariant:** toHandlerArgs must extract eventId, eventType, globalPosition, correlationId, streamType, streamId, boundedContext, agentId, and payload from the event and correlation chain.
    **Verified by:** Asserting each field of the returned handler args.

    Scenario: toHandlerArgs produces correct AgentEventHandlerArgs
      Given a churn risk agent definition with id "churn-risk-agent" and context "orders"
      And a mock mutation handler
      And a mock event "OrderCancelled" with streamId "order_123" at position 42
      And a correlation chain with correlationId "corr_abc"
      When I create a mutation subscription
      And I call toHandlerArgs with the event and correlation chain
      Then the handler args have all expected fields:
        | field           | expected          |
        | eventId         | evt_42            |
        | eventType       | OrderCancelled    |
        | globalPosition  | 42                |
        | correlationId   | corr_abc          |
        | streamType      | Order             |
        | streamId        | order_123         |
        | boundedContext  | orders            |
        | agentId         | churn-risk-agent  |

    Scenario: toHandlerArgs includes payload in handler args
      Given a churn risk agent definition with id "churn-risk-agent" and context "orders"
      And a mock mutation handler
      And a mock event "OrderCancelled" with streamId "order_123" at position 1
      And the event payload is set to orderId "order_123" amount 150 reason "Changed mind"
      And a correlation chain with correlationId "corr_xyz"
      When I create a mutation subscription
      And I call toHandlerArgs with the event and correlation chain
      Then the handler args payload equals orderId "order_123" amount 150 reason "Changed mind"

    Scenario: defaultAgentTransform wraps non-object payload in _raw
      Given a mock event "OrderCancelled" with streamId "order_123" at position 1
      And the event payload is set to string "string-payload"
      And a correlation chain with correlationId "corr_xyz"
      When I call defaultAgentTransform with agentId "test-agent"
      Then the handler args payload equals _raw "string-payload"

    Scenario: Custom toHandlerArgs transformer is used
      Given a churn risk agent definition with id "churn-risk-agent" and context "orders"
      And a mock mutation handler
      And a mock event "OrderCancelled" with streamId "order_123" at position 1
      And a correlation chain with correlationId "corr_xyz"
      When I create a mutation subscription with a custom toHandlerArgs transformer
      And I call toHandlerArgs with the event and correlation chain
      Then the custom handler args have expected values:
        | field  | expected                            |
        | id     | evt_1                               |
        | type   | OrderCancelled                      |
        | custom | processed-by-churn-risk-agent       |

  Rule: getPartitionKey extracts correct partition key

    **Invariant:** getPartitionKey must return a partition key with name "streamId" and value equal to event streamId by default, or use custom extractor when provided.
    **Verified by:** Asserting partition key name and value for default and custom cases.

    Scenario: Partitions by streamId by default
      Given a churn risk agent definition with id "churn-risk-agent" and context "orders"
      And a mock mutation handler
      And a mock event "OrderCancelled" with streamId "order_456" at position 1
      When I create a mutation subscription
      And I call getPartitionKey with the event
      Then the partition key name is "streamId"
      And the partition key value is "order_456"

    Scenario: Custom partition key extractor is used
      Given a churn risk agent definition with id "churn-risk-agent" and context "orders"
      And a mock mutation handler
      And a mock event "OrderCancelled" with streamId "order_789" at position 1
      When I create a mutation subscription with a custom partition key extractor
      And I call getPartitionKey with the event
      Then the partition key name is "agent"
      And the partition key value is "churn-risk-agent:orders"

  Rule: createAgentSubscriptions creates batch subscriptions

    **Invariant:** createAgentSubscriptions must create one subscription per agent, throw if handler is missing, and apply common options to all.
    **Verified by:** Asserting subscription count, names, error on missing handler, and shared priority.

    Scenario: Creates subscriptions for multiple agents
      Given a churn risk agent definition with id "churn-risk-agent" and context "orders"
      And a fraud agent definition with id "fraud-agent" subscribing to "PaymentFailed" in context "payments"
      And a handler map with entries for "churn-risk-agent" and "fraud-agent"
      When I create batch subscriptions
      Then the batch has 2 subscriptions
      And the batch subscription names are:
        | name                         |
        | agent:orders:churn-risk-agent |
        | agent:payments:fraud-agent    |

    @validation
    Scenario: Throws if handler is missing for an agent
      Given a churn risk agent definition with id "churn-risk-agent" and context "orders"
      And a simple agent definition with id "simple-agent" subscribing to "EventA"
      And a handler map with entry only for "churn-risk-agent"
      When I create batch subscriptions for both agents
      Then it throws with message containing "Missing handler for agent"

    Scenario: Applies common options to all subscriptions
      Given a churn risk agent definition with id "churn-risk-agent" and context "orders"
      And a simple agent definition with id "simple-agent" subscribing to "EventA"
      And a handler map with entries for "churn-risk-agent" and "simple-agent"
      When I create batch subscriptions with priority 300
      Then all subscriptions have priority 300

  Rule: AgentId is memoized across calls

    **Invariant:** The agentId must be consistent and reused across multiple calls to toHandlerArgs and getPartitionKey for the same subscription.
    **Verified by:** Asserting agentId equality across multiple calls.

    Scenario: Same agentId for multiple toHandlerArgs calls
      Given a churn risk agent definition with id "churn-risk-agent" and context "orders"
      And a mock mutation handler
      And a mock event "OrderCancelled" with streamId "order_123" at position 1
      And a correlation chain with correlationId "corr_abc"
      When I create a mutation subscription
      And I call toHandlerArgs twice with the event and correlation chain
      Then both handler args have agentId "churn-risk-agent"

    Scenario: Same agentId for toHandlerArgs and getPartitionKey
      Given a churn risk agent definition with id "churn-risk-agent" and context "orders"
      And a mock mutation handler with custom transform and partition key capturing agentId
      And a mock event "OrderCancelled" with streamId "order_123" at position 1
      And a correlation chain with correlationId "corr_abc"
      When I call toHandlerArgs and getPartitionKey
      Then both captured agentIds are "churn-risk-agent"

  Rule: Event filtering only matches subscribed event types

    **Invariant:** The subscription filter must contain only the event types from the agent definition and must not contain unsubscribed types.
    **Verified by:** Asserting presence of subscribed types and absence of unsubscribed types.

    Scenario: Filter matches subscribed types and rejects unsubscribed types
      Given a churn risk agent definition with id "churn-risk-agent" and context "orders"
      And a mock mutation handler
      When I create a mutation subscription
      Then the subscription filter contains event types:
        | eventType      |
        | OrderCancelled |
        | OrderRefunded  |
      And the subscription filter does not contain event types:
        | eventType       |
        | OrderCreated    |
        | PaymentReceived |

    Scenario: Event types array starts with correct length
      Given a churn risk agent definition with id "churn-risk-agent" and context "orders"
      And a mock mutation handler
      When I create a mutation subscription
      Then the subscription filter has 2 event types

  Rule: defaultAgentTransform handles all PublishedEvent fields

    **Invariant:** defaultAgentTransform must correctly map all PublishedEvent fields including eventId, eventType, globalPosition, correlationId, streamType, streamId, payload, timestamp, category, boundedContext, and agentId.
    **Verified by:** Asserting each field of the returned args for a fully populated event.

    Scenario: Transforms all PublishedEvent fields correctly
      Given a fully populated published event
      And a fully populated correlation chain with correlationId "corr_test_abc"
      When I call defaultAgentTransform with agentId "test-agent-id"
      Then the transform result has all expected fields:
        | field           | expected          |
        | eventId         | evt_test_123      |
        | eventType       | TestEvent         |
        | globalPosition  | 999               |
        | correlationId   | corr_test_abc     |
        | streamType      | TestStream        |
        | streamId        | test_stream_456   |
        | timestamp       | 1700000000000     |
        | category        | domain            |
        | boundedContext  | testing           |
        | agentId         | test-agent-id     |
      And the transform result payload equals key "value" with nested prop 123

    Scenario: Handles null payload
      Given a mock event "TestEvent" with streamId "stream_1" at position 1
      And the event payload is set to null
      And a correlation chain with correlationId "corr_1"
      When I call defaultAgentTransform with agentId "agent"
      Then the handler args payload equals _raw null

    Scenario: Handles array payload
      Given a mock event "TestEvent" with streamId "stream_1" at position 1
      And the event payload is set to array 1 2 3
      And a correlation chain with correlationId "corr_1"
      When I call defaultAgentTransform with agentId "agent"
      Then the handler args payload equals _raw array 1 2 3
