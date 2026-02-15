@unit @agent
Feature: Agent Subscription - Action Overload

  The ACTION overload of createAgentSubscription() creates an ActionSubscription
  with handlerType "action", onComplete reference, optional retry config,
  default priority, correct naming convention, event filtering,
  toHandlerArgs transformation, toWorkpoolContext shape, and partition key.

  Rule: Action subscription creation sets correct handler type and references

    **Invariant:** createAgentSubscription with actionHandler must produce an ActionSubscription with handlerType "action", the correct handler reference, and the onComplete reference.
    **Verified by:** Asserting handlerType, handler, and onComplete on the returned subscription.

    @acceptance-criteria @happy-path
    Scenario: Action subscription has correct type and references
      Given an LLM agent definition with id "llm-churn-risk" and context "orders"
      And an action handler and onComplete reference
      When I create an action subscription
      Then the subscription has all expected properties:
        | property    | expected          |
        | handlerType | action            |
        | handler     | mockActionHandler |
        | onComplete  | mockOnComplete    |

  Rule: Retry configuration is passed through to action subscriptions

    **Invariant:** When retry config is provided, it must appear on the ActionSubscription; when omitted, the retry field must not exist.
    **Verified by:** Asserting retry field presence and value for object config, boolean config, and no config.

    @acceptance-criteria @validation
    Scenario: Object retry config is passed through
      Given an LLM agent definition with id "llm-churn-risk" and context "orders"
      And an action handler and onComplete reference
      When I create an action subscription with retry config maxAttempts 3, initialBackoffMs 1000, base 2
      Then the subscription retry config equals maxAttempts 3, initialBackoffMs 1000, base 2

    Scenario: Boolean retry config is passed through
      Given an LLM agent definition with id "llm-churn-risk" and context "orders"
      And an action handler and onComplete reference
      When I create an action subscription with retry set to true
      Then the subscription retry is true

    Scenario: Retry field is absent when not specified
      Given an LLM agent definition with id "llm-churn-risk" and context "orders"
      And an action handler and onComplete reference
      When I create an action subscription
      Then the subscription does not have a retry field

  Rule: toWorkpoolContext produces correct shape

    **Invariant:** toWorkpoolContext must return an object with agentId, subscriptionId, eventId, eventType, globalPosition, correlationId, causationId (set to eventId), streamId, streamType, and boundedContext.
    **Verified by:** Asserting each field of the returned context object.

    Scenario: toWorkpoolContext returns all required fields
      Given an LLM agent definition with id "llm-churn-risk" and context "orders"
      And an action handler and onComplete reference
      And a mock event "OrderCancelled" with streamId "order_123" at position 42
      And a correlation chain with correlationId "corr_abc"
      When I create an action subscription
      And I call toWorkpoolContext with the event and correlation chain
      Then the workpool context has all expected fields:
        | field           | expected                      |
        | agentId         | llm-churn-risk                |
        | subscriptionId  | sub_llm-churn-risk            |
        | eventId         | evt_42                        |
        | eventType       | OrderCancelled                |
        | globalPosition  | 42                            |
        | correlationId   | corr_abc                      |
        | causationId     | evt_42                        |
        | streamId        | order_123                     |
        | streamType      | Order                         |
        | boundedContext  | orders                        |

    Scenario: causationId equals the event eventId
      Given an LLM agent definition with id "llm-churn-risk" and context "orders"
      And an action handler and onComplete reference
      And a mock event "OrderRefunded" with streamId "order_789" at position 99
      And a correlation chain with correlationId "corr_xyz"
      When I create an action subscription
      And I call toWorkpoolContext with the event and correlation chain
      Then the workpool context causationId equals the event eventId "evt_99"

  Rule: Default priority is 250

    **Invariant:** When no priority is specified, the subscription must use DEFAULT_AGENT_SUBSCRIPTION_PRIORITY (250). Custom priority must override.
    **Verified by:** Asserting priority value for default and custom cases.

    Scenario: Subscription uses default priority of 250
      Given an LLM agent definition with id "llm-churn-risk" and context "orders"
      And an action handler and onComplete reference
      When I create an action subscription
      Then the subscription priority is 250

    Scenario: Subscription uses custom priority
      Given an LLM agent definition with id "llm-churn-risk" and context "orders"
      And an action handler and onComplete reference
      When I create an action subscription with priority 300
      Then the subscription priority is 300

  Rule: Subscription name follows agent naming convention

    **Invariant:** Name must be "agent:{context}:{id}" when context is provided, or "agent:{id}" when omitted.
    **Verified by:** Asserting the subscription name string for both cases.

    Scenario: Name includes context when provided
      Given an LLM agent definition with id "llm-churn-risk" and context "orders"
      And an action handler and onComplete reference
      When I create an action subscription
      Then the subscription name is "agent:orders:llm-churn-risk"

    Scenario: Name omits context when not provided
      Given a simple agent definition with id "simple-llm-agent"
      And an action handler and onComplete reference
      When I create an action subscription
      Then the subscription name is "agent:simple-llm-agent"

  Rule: Event filtering uses configured event types

    **Invariant:** The subscription filter must contain exactly the event types from the agent definition subscriptions array.
    **Verified by:** Asserting filter eventTypes content and length.

    Scenario: Filter contains all configured event types
      Given an LLM agent definition with id "llm-churn-risk" and context "orders"
      And an action handler and onComplete reference
      When I create an action subscription
      Then the subscription filter contains event types:
        | eventType      |
        | OrderCancelled |
        | OrderRefunded  |
      And the subscription filter has 2 event types

  Rule: toHandlerArgs transforms event to AgentEventHandlerArgs

    **Invariant:** toHandlerArgs must extract eventId, eventType, globalPosition, correlationId, streamType, streamId, boundedContext, and agentId from the event and correlation chain.
    **Verified by:** Asserting each field of the returned handler args object.

    Scenario: toHandlerArgs produces correct AgentEventHandlerArgs
      Given an LLM agent definition with id "llm-churn-risk" and context "orders"
      And an action handler and onComplete reference
      And a mock event "OrderCancelled" with streamId "order_123" at position 42
      And a correlation chain with correlationId "corr_abc"
      When I create an action subscription
      And I call toHandlerArgs with the event and correlation chain
      Then the handler args have all expected fields:
        | field           | expected         |
        | eventId         | evt_42           |
        | eventType       | OrderCancelled   |
        | globalPosition  | 42               |
        | correlationId   | corr_abc         |
        | streamType      | Order            |
        | streamId        | order_123        |
        | boundedContext  | orders           |
        | agentId         | llm-churn-risk   |

  Rule: Partition key defaults to streamId

    **Invariant:** getPartitionKey must return a partition key with name "streamId" and value equal to the event streamId.
    **Verified by:** Asserting partition key name and value.

    Scenario: getPartitionKey returns streamId-based partition
      Given an LLM agent definition with id "llm-churn-risk" and context "orders"
      And an action handler and onComplete reference
      And a mock event "OrderCancelled" with streamId "order_456" at position 1
      When I create an action subscription
      And I call getPartitionKey with the event
      Then the partition key name is "streamId"
      And the partition key value is "order_456"
