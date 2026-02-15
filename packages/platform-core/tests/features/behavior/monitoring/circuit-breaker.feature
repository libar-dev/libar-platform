@libar-docs
Feature: Circuit Breaker

  As a platform developer
  I want a circuit breaker for fault isolation
  So that cascading failures are prevented when operations fail repeatedly

  # ============================================================================
  # Closed State
  # ============================================================================

  Rule: A closed circuit executes operations normally

    **Invariant:** While closed, every operation is invoked and its result returned.
    **Verified by:** Return value and call count assertions.

    @acceptance-criteria @happy-path
    Scenario: Operation executes normally and returns result
      Given a circuit "test-circuit" in closed state
      When I execute a succeeding operation through the circuit breaker
      Then the operation result is "success"
      And the operation was called 1 time
      And the circuit state is "closed"

    @acceptance-criteria @validation
    Scenario: Circuit remains closed after a single failure
      Given a circuit "test-circuit" in closed state
      When I execute a failing operation through the circuit breaker
      Then the operation throws "transient error"
      And the circuit state is "closed"

  # ============================================================================
  # Closed -> Open Transition
  # ============================================================================

  Rule: A closed circuit opens after reaching the failure threshold

    **Invariant:** After N consecutive failures (default 5), the circuit opens and rejects subsequent calls immediately.
    **Verified by:** State transition and immediate rejection without invoking the operation.

    @acceptance-criteria @happy-path
    Scenario: Circuit opens after default failure threshold of 5 failures
      Given a circuit "test-circuit" in closed state
      When I trigger 5 consecutive failures on circuit "test-circuit"
      Then the circuit state is "open"
      And the next operation on circuit "test-circuit" is rejected without invocation

  # ============================================================================
  # Open -> Half-open Transition
  # ============================================================================

  Rule: An open circuit transitions to half-open after the timeout elapses

    **Invariant:** Once the timeout expires, the circuit enters half-open and allows a probe request.
    **Verified by:** State check and successful probe execution after timeout.

    @acceptance-criteria @happy-path
    Scenario: Circuit transitions to half-open after timeout
      Given a circuit "test-circuit" that has been opened by 5 failures
      When I advance time by 60001 milliseconds
      Then the circuit state is "half-open"
      And a probe operation on circuit "test-circuit" returns "probe success"

  # ============================================================================
  # Half-open -> Closed Transition
  # ============================================================================

  Rule: A half-open circuit closes on a successful probe

    **Invariant:** A single success in half-open state restores the circuit to closed.
    **Verified by:** State assertion and normal subsequent operations.

    @acceptance-criteria @happy-path
    Scenario: Circuit closes on success in half-open state
      Given a circuit "test-circuit" in half-open state
      When I execute a succeeding operation returning "recovered" through circuit "test-circuit"
      Then the circuit state is "closed"
      And a normal operation on circuit "test-circuit" returns "normal"

  # ============================================================================
  # Half-open -> Open Transition
  # ============================================================================

  Rule: A half-open circuit re-opens on a failed probe

    **Invariant:** A failure in half-open state immediately re-opens the circuit.
    **Verified by:** State transition and immediate rejection of the next call.

    @acceptance-criteria @happy-path
    Scenario: Circuit re-opens on failure in half-open state
      Given a circuit "test-circuit" in half-open state
      When I execute a failing operation throwing "still broken" through circuit "test-circuit"
      Then the circuit state is "open"
      And the next operation on circuit "test-circuit" is rejected without invocation

  # ============================================================================
  # Success Threshold > 1
  # ============================================================================

  Rule: With successThreshold > 1, multiple consecutive successes are required to close

    **Invariant:** The circuit remains half-open until the configured number of consecutive successes is reached.
    **Verified by:** Intermediate state checks after each success.

    @acceptance-criteria @validation
    Scenario: Requires 3 consecutive successes in half-open to close circuit
      Given a circuit "threshold-circuit" opened with failureThreshold 2 and timeout 5000 and successThreshold 3
      When I advance time by 5001 milliseconds
      Then the circuit state for "threshold-circuit" is "half-open"
      And the circuit "threshold-circuit" remains half-open after each success until the 3rd with config failureThreshold 2 timeout 5000 successThreshold 3

  # ============================================================================
  # getCircuitState
  # ============================================================================

  Rule: getCircuitState returns the current state of a circuit

    **Invariant:** Unknown circuits default to closed; known circuits reflect their actual state.
    **Verified by:** State queries before and after operations.

    @acceptance-criteria @happy-path
    Scenario: Returns closed for unknown circuit
      When I query the state of circuit "unknown-test"
      Then the queried circuit state is "closed"

    @acceptance-criteria @validation
    Scenario: Reflects current state after a successful operation
      Given a circuit "test-circuit" in closed state
      When I execute a succeeding operation through the circuit breaker
      Then the circuit state is "closed"

  # ============================================================================
  # resetCircuit
  # ============================================================================

  Rule: resetCircuit clears circuit state back to closed

    **Invariant:** After reset, a previously open circuit returns to closed and accepts operations.
    **Verified by:** State assertion and successful operation after reset.

    @acceptance-criteria @happy-path
    Scenario: Reset clears an open circuit back to closed
      Given a circuit "reset-test" that has been opened by 5 failures
      When I reset circuit "reset-test"
      Then the circuit state for "reset-test" is "closed"
      And a normal operation on circuit "reset-test" returns "back to normal"

  # ============================================================================
  # Custom Config
  # ============================================================================

  Rule: Custom configuration overrides default thresholds and timeouts

    **Invariant:** failureThreshold and timeout are respected when explicitly provided.
    **Verified by:** Opening with fewer failures and transitioning after shorter timeout.

    @acceptance-criteria @happy-path
    Scenario: Respects custom failureThreshold
      Given a circuit "custom-circuit" in closed state
      When I trigger 2 consecutive failures on circuit "custom-circuit" with failureThreshold 2
      Then the circuit state for "custom-circuit" is "open"

    @acceptance-criteria @validation
    Scenario: Respects custom timeout
      Given a circuit "custom-circuit" opened with failureThreshold 2 and timeout 5000
      When I advance time by 4000 milliseconds
      Then the circuit state for "custom-circuit" is "open"
      When I advance time by 1001 milliseconds
      Then the circuit state for "custom-circuit" is "half-open"

  # ============================================================================
  # Success Resets Failure Count
  # ============================================================================

  Rule: A success in closed state resets the failure counter

    **Invariant:** Consecutive failure count resets to zero on any success, preventing premature circuit opening.
    **Verified by:** Failure accumulation, success reset, and re-accumulation without opening.

    @acceptance-criteria @happy-path
    Scenario: Failure count resets on success in closed state
      Given a circuit "test-circuit" in closed state
      When I trigger 4 consecutive failures on circuit "test-circuit"
      And I execute a succeeding operation through the circuit breaker
      And I trigger 4 more consecutive failures on circuit "test-circuit"
      Then the circuit state is "closed"
