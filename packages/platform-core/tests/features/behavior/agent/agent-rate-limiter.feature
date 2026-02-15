@unit @agent
Feature: Agent Rate Limiter

  withRateLimit() guards agent operations behind a rate limit check.
  If allowed, the operation executes and returns the result.
  If denied, the operation is skipped and retryAfterMs is returned.

  Rule: Allowed operations execute and return their result

    **Invariant:** When the rate limit check passes, the wrapped operation must execute exactly once and its return value must be surfaced.
    **Verified by:** Mock operation call count and result assertion.

    @acceptance-criteria @happy-path
    Scenario: Operation executes and result is returned when allowed
      Given a rate limiter config for agent "test-agent" that allows requests
      And an operation that returns analysis "success" with score 0.95
      When I call withRateLimit
      Then the result indicates allowed is true
      And the result value has analysis "success" and score 0.95
      And the operation was called 1 time

  Rule: Denied operations are skipped with retry information

    **Invariant:** When the rate limit check denies, the operation must never execute and the caller receives retryAfterMs.
    **Verified by:** Mock operation not called and retryAfterMs value check.

    @acceptance-criteria @validation
    Scenario: Operation is not executed when denied
      Given a rate limiter config for agent "test-agent" that denies with retryAfterMs 5000
      And a mock operation
      When I call withRateLimit
      Then the result indicates allowed is false
      And the result retryAfterMs is 5000
      And the operation was not called

  Rule: Rate limit key is agent-scoped

    **Invariant:** The rate limit key passed to checkRateLimit must follow the format "agent:{agentId}".
    **Verified by:** Asserting the exact key string passed to checkRateLimit.

    Scenario: checkRateLimit receives agent-scoped key
      Given a rate limiter config for agent "churn-risk-agent" that allows requests
      When I call withRateLimit with a simple operation
      Then checkRateLimit was called with key "agent:churn-risk-agent"

  Rule: Errors propagate correctly

    **Invariant:** Errors from the operation or from checkRateLimit itself must propagate to the caller without being swallowed.
    **Verified by:** Asserting thrown error messages for both operation and callback failures.

    Scenario: Operation errors propagate to caller
      Given a rate limiter config for agent "test-agent" that allows requests
      And an operation that throws "LLM API crashed"
      When I call withRateLimit expecting an error
      Then the error message is "LLM API crashed"

    Scenario: checkRateLimit callback errors propagate without calling operation
      Given a rate limiter config for agent "test-agent" where checkRateLimit throws "Rate limiter store unavailable"
      And a mock operation
      When I call withRateLimit expecting an error
      Then the error message is "Rate limiter store unavailable"
      And the operation was not called

  Rule: Logging reflects rate limit outcomes

    **Invariant:** A warning is logged when rate-limited; a debug message is logged when the check passes.
    **Verified by:** Logger mock assertions for warn and debug calls.

    Scenario: Warning is logged when rate limited
      Given a rate limiter config with logger for agent "test-agent" that denies with retryAfterMs 3000
      When I call withRateLimit with a simple operation
      Then the logger warned "Rate limited" with agentId "test-agent" and retryAfterMs 3000

    Scenario: Debug is logged when rate limit check passes
      Given a rate limiter config with logger for agent "test-agent" that allows requests
      When I call withRateLimit with a simple operation
      Then the logger logged debug "Rate limit passed, executing operation" with agentId "test-agent"
