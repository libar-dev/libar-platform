@libar-docs
@libar-docs-status:completed
@libar-docs-implements:AgentAsBoundedContext
@libar-docs-phase:22
@libar-docs-product-area:Platform
@agent
Feature: Agent Audit Trail

  As a platform developer
  I want all agent decisions audited as events
  So that agent behavior is fully traceable

  This feature validates audit event recording for
  pattern detection, decisions, and outcomes.

  Background: Agent Module
    Given the agent module is imported from platform-core
    And the audit trail utilities are available

  # ============================================================================
  # Decision Audit
  # ============================================================================

  Rule: All agent decisions create audit events

    Every decision is recorded in the event store.

    @acceptance-criteria @happy-path
    Scenario: Record PatternDetected event
      Given agent detects ChurnRisk pattern
      When agent decides to emit SuggestCustomerOutreach
      Then PatternDetected event is recorded
      And event includes:
        | field | description |
        | decisionId | Unique decision identifier |
        | patternDetected | ChurnRisk |
        | confidence | Detection confidence |
        | reasoning | Why pattern was detected |
        | action | Suggested command |

    @acceptance-criteria @happy-path
    Scenario: Audit includes triggering events
      Given pattern triggered by events E1, E2, E3
      When PatternDetected is recorded
      Then event.triggeringEvents equals ["E1", "E2", "E3"]

    @acceptance-criteria @happy-path
    Scenario: Audit includes execution mode
      Given agent decision with confidence 0.85
      And threshold is 0.8
      When PatternDetected is recorded
      Then event.executionMode equals "auto-execute"

  # ============================================================================
  # LLM Audit
  # ============================================================================

  Rule: LLM interactions are audited

    Track LLM usage for cost and debugging.

    @acceptance-criteria @happy-path
    Scenario: Audit includes LLM metadata
      Given agent used LLM for pattern analysis
      When PatternDetected is recorded
      Then event.llmContext includes:
        | field | description |
        | model | LLM model used |
        | tokens | Token count |
        | duration | Response time |
        | promptHash | Hash of prompt |

    @acceptance-criteria @happy-path
    Scenario: Audit LLM failures
      Given LLM call failed with timeout
      When AgentLLMError event is recorded
      Then event includes error details
      And event includes fallback action taken

  # ============================================================================
  # Action Outcome Audit
  # ============================================================================

  Rule: Action outcomes are recorded

    Track what happened after decision.

    @acceptance-criteria @happy-path
    Scenario: Record auto-executed action
      Given an auto-execute decision
      When command is executed
      Then AgentActionExecuted event is recorded
      And event links to original PatternDetected

    @acceptance-criteria @happy-path
    Scenario: Record approved action
      Given an action approved by reviewer
      When command is executed
      Then ApprovalGranted event is recorded
      And event includes reviewerId and approvalTime

    @acceptance-criteria @happy-path
    Scenario: Record rejected action
      Given an action rejected by reviewer
      When rejection is processed
      Then ApprovalRejected event is recorded
      And event includes reviewerId and rejectionReason

    @acceptance-criteria @happy-path
    Scenario: Record expired action
      Given an action that timed out
      When expiration is processed
      Then ApprovalExpired event is recorded
      And event includes expirationTime

  # ============================================================================
  # Audit Queries
  # ============================================================================

  Rule: Audit trail supports queries

    Query agent history for analysis.

    @acceptance-criteria @happy-path
    Scenario: Query all decisions for an agent
      Given agent "churn-detector" made 100 decisions
      When I query PatternDetected for agent "churn-detector"
      Then I receive 100 decision records

    @acceptance-criteria @happy-path
    Scenario: Query decisions by pattern type
      Given decisions for patterns: ChurnRisk (50), FraudRisk (30)
      When I query decisions where patternDetected = "ChurnRisk"
      Then I receive 50 records

    @acceptance-criteria @happy-path
    Scenario: Query decisions by time range
      Given decisions from January and February
      When I query decisions for January only
      Then I receive only January decisions

    @acceptance-criteria @happy-path
    Scenario: Query decision with full trace
      Given a decision that led to executed command
      When I query with expandTrace: true
      Then result includes related events:
        | eventType |
        | PatternDetected |
        | AgentActionExecuted |
        | Command execution result |
