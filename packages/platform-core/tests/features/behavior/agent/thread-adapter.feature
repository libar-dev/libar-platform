Feature: Thread Adapter

  createThreadAdapter() returns an adapter with analyze() and reason() methods
  that wrap generateText calls, parse JSON responses, and track LLM context
  metadata including model, tokens, timing, and threadId.

  Rule: analyze() parses JSON responses with patterns, confidence, and reasoning
    **Invariant:** A valid JSON response is parsed into structured patterns, confidence, reasoning, and llmContext
    **Verified by:** Scenario covering generateText call, JSON parsing, and llmContext fields

    @acceptance-criteria @happy-path
    Scenario: Calls generateText and parses a valid JSON response
      Given a generateText mock returning a churn-risk JSON response with 100 tokens
      When I call analyze with prompt "Detect churn risk" and 2 events
      Then generateText was called exactly 1 time
      And the analyze result has the following properties:
        | property               | value                                  |
        | patterns.length        | 1                                      |
        | patterns[0].name       | churn-risk                             |
        | patterns[0].confidence | 0.85                                   |
        | confidence             | 0.8                                    |
        | reasoning              | Customer shows churn risk indicators   |
        | llmContext.model        | anthropic/claude-sonnet-4-5-20250929   |
        | llmContext.tokens       | 100                                    |
      And the first pattern matchingEventIds are "evt_1" and "evt_2"

  Rule: analyze() handles non-JSON and malformed responses gracefully
    **Invariant:** Non-JSON or malformed responses return empty patterns, zero confidence, and raw text as reasoning
    **Verified by:** Scenarios for plain text and malformed JSON responses

    Scenario: Handles non-JSON response with defaults
      Given a generateText mock returning plain text "This is plain text, not JSON" with 30 tokens
      When I call analyze with prompt "Analyze events" and 1 event
      Then the analyze result has defaults with reasoning "This is plain text, not JSON"

    Scenario: Handles malformed JSON gracefully
      Given a generateText mock returning plain text "{ not valid json }}}" with 20 tokens
      When I call analyze with prompt "Analyze events" and 1 event
      Then the analyze result has defaults with reasoning "{ not valid json }}}"

  Rule: analyze() re-throws generateText errors
    **Invariant:** Errors from generateText propagate without being swallowed
    **Verified by:** Scenario verifying error re-throw

    Scenario: Re-throws generateText errors
      Given a generateText mock that rejects with "API rate limit exceeded"
      When I call analyze expecting an error
      Then the error message is "API rate limit exceeded"

  Rule: analyze() tracks timing in llmContext
    **Invariant:** llmContext.durationMs reflects elapsed time during the generateText call
    **Verified by:** Scenario simulating 250ms elapsed time

    Scenario: Tracks timing in llmContext
      Given a generateText mock that takes 250ms and returns 50 tokens
      When I call analyze with prompt "Analyze" and 1 event
      Then the llmContext has the following timing properties:
        | property   | value                                |
        | model      | anthropic/claude-sonnet-4-5-20250929 |
        | tokens     | 50                                   |
        | durationMs | 250                                  |

  Rule: analyze() handles threadId presence and absence in llmContext
    **Invariant:** threadId is included in llmContext only when present in the generateText result
    **Verified by:** Scenarios for present and absent threadId

    Scenario: Includes threadId in llmContext when present
      Given a generateText mock returning JSON with threadId "thread_abc123" and 50 tokens
      When I call analyze with prompt "Analyze" and 1 event
      Then the llmContext threadId is "thread_abc123"

    Scenario: Omits threadId from llmContext when not present
      Given a generateText mock returning JSON without threadId and 50 tokens
      When I call analyze with prompt "Analyze" and 1 event
      Then the llmContext does not contain threadId

  Rule: analyze() handles missing usage in generateText result
    **Invariant:** When usage is absent from generateText result, tokens defaults to 0
    **Verified by:** Scenario with no usage field

    Scenario: Handles missing usage with zero tokens
      Given a generateText mock returning JSON without usage
      When I call analyze with prompt "Analyze" and 1 event
      Then the llmContext tokens is 0

  Rule: reason() parses JSON and returns structured data
    **Invariant:** reason() parses a valid JSON response and returns it as a structured object
    **Verified by:** Scenario with a JSON reasoning response

    Scenario: Calls generateText and parses JSON response for reason
      Given a generateText mock returning a reasoning JSON response with 80 tokens
      When I call reason with a test event
      Then the reason result is a structured object with observation and implications

  Rule: reason() falls back to raw text for non-JSON responses
    **Invariant:** Non-JSON responses from generateText are returned as raw text
    **Verified by:** Scenario with plain text reasoning response

    Scenario: Returns raw text when response is not JSON
      Given a generateText mock returning plain text "This event indicates a potential issue with order fulfillment." with 40 tokens
      When I call reason with a test event
      Then the reason result is the raw text "This event indicates a potential issue with order fulfillment."

  Rule: reason() re-throws generateText errors
    **Invariant:** Errors from generateText propagate during reason() calls
    **Verified by:** Scenario verifying error re-throw from reason

    Scenario: Re-throws generateText errors from reason
      Given a generateText mock that rejects with "Network error"
      When I call reason expecting an error
      Then the error message is "Network error"

  Rule: reason() logs reasoning start and completion
    **Invariant:** reason() logs debug on start and info on completion with agent and model metadata
    **Verified by:** Scenario verifying logger calls

    Scenario: Logs reasoning start and completion
      Given a generateText mock returning JSON with 30 tokens and a mock logger
      When I call reason with a PaymentFailed event
      Then the logger debug was called with "Starting reasoning" and agentId "test-agent" and eventType "PaymentFailed"
      And the logger info was called with "Reasoning completed" and agentId "test-agent" and model "anthropic/claude-sonnet-4-5-20250929"
