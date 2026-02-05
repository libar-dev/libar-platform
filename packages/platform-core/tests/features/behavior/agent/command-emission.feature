@libar-docs
@libar-docs-status:active
@libar-docs-implements:AgentAsBoundedContext
@libar-docs-phase:22
@libar-docs-product-area:Platform
@agent
Feature: Agent Command Emission

  As a platform developer
  I want agents to emit commands with explainability
  So that agent actions are traceable and auditable

  This feature validates command emission from agents
  including required metadata and explainability.

  Background: Agent Module
    Given the agent module is imported from platform-core
    And the command emission utilities are available

  # ============================================================================
  # Basic Command Emission
  # ============================================================================

  Rule: Agents emit commands to Command Bus

    Commands follow standard Command Bus patterns.

    @acceptance-criteria @happy-path
    Scenario: Emit recommendation command
      Given a detected ChurnRisk pattern
      When agent emits SuggestCustomerOutreach command
      Then command is delivered to Command Bus
      And command has standard metadata

    @acceptance-criteria @happy-path
    Scenario: Command includes correlation ID
      Given pattern detected from correlated events
      When agent emits command
      Then command.correlationId traces back to triggering events

    @acceptance-criteria @happy-path
    Scenario: Command includes agent BC identifier
      Given agent BC "churn-detector"
      When agent emits command
      Then command.source equals "agent:churn-detector"

  # ============================================================================
  # Explainability
  # ============================================================================

  Rule: Commands include explainability metadata

    All agent commands must be explainable.

    @acceptance-criteria @happy-path
    Scenario: Command includes reason
      Given agent decision with reasoning
      When agent emits command
      Then command.metadata.reason describes why action was taken

    @acceptance-criteria @happy-path
    Scenario: Command includes confidence
      Given pattern detected with 85% confidence
      When agent emits command
      Then command.metadata.confidence equals 0.85

    @acceptance-criteria @happy-path
    Scenario: Command includes triggering events
      Given pattern triggered by events E1, E2, E3
      When agent emits command
      Then command.metadata.eventIds equals ["E1", "E2", "E3"]

    @acceptance-criteria @happy-path
    Scenario: Command includes LLM context
      Given LLM was used for pattern analysis
      When agent emits command
      Then command.metadata.llmContext includes model, tokens, duration

  # ============================================================================
  # Validation
  # ============================================================================

  Rule: Commands must meet minimum metadata requirements

    Missing explainability is rejected.

    @acceptance-criteria @validation
    Scenario: Reject command without reason
      Given agent attempting to emit command
      When reason is not provided
      Then an error is thrown with code "REASON_REQUIRED"

    @acceptance-criteria @validation
    Scenario: Reject command without confidence
      Given agent attempting to emit command
      When confidence is not provided
      Then an error is thrown with code "CONFIDENCE_REQUIRED"

    @acceptance-criteria @validation
    Scenario: Reject confidence outside valid range
      Given agent attempting to emit command with confidence 1.5
      When emitCommand is called
      Then an error is thrown with code "INVALID_CONFIDENCE"
      And error message mentions "must be between 0 and 1"

  # ============================================================================
  # Resilience
  # ============================================================================

  Rule: Command emission handles LLM failures gracefully

    LLM rate limits and timeouts should not block event processing.

    @acceptance-criteria @edge-case
    Scenario: LLM rate limit is handled with exponential backoff
      Given an agent attempting LLM analysis
      And LLM API returns 429 rate limit error
      When agent retries the analysis
      Then retry uses exponential backoff
      And event processing queue is not blocked
      And retry attempts are logged for observability

    @acceptance-criteria @edge-case
    Scenario: LLM timeout falls back to rule-based emission
      Given an agent with LLM analysis configured
      And LLM request times out after 30 seconds
      When command emission is attempted
      Then fallback to rule-based decision is used
      And command includes fallback indicator in metadata

  # ============================================================================
  # Command Types
  # ============================================================================

  Rule: Different command types for different actions

    Agents can emit various command types.

    @acceptance-criteria @happy-path
    Scenario: Emit notification command
      Given low-risk pattern detected
      When agent emits NotifyTeam command
      Then command is processed as notification

    @acceptance-criteria @happy-path
    Scenario: Emit action command
      Given high-confidence pattern detected
      When agent emits AutomatedResponse command
      Then command triggers actual business action

    @acceptance-criteria @happy-path
    Scenario: Emit escalation command
      Given critical pattern detected
      When agent emits EscalateToHuman command
      Then command creates review task for human
