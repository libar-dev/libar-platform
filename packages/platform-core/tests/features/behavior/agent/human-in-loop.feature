@libar-docs
@libar-docs-status:roadmap
@libar-docs-implements:AgentAsBoundedContext
@libar-docs-phase:22
@libar-docs-product-area:Platform
@agent
Feature: Human-in-Loop Configuration

  As a platform developer
  I want configurable human-in-loop controls
  So that agent actions can be reviewed when appropriate

  This feature validates confidence thresholds,
  approval requirements, and timeout handling.

  Background: Agent Module
    Given the agent module is imported from platform-core
    And the human-in-loop configuration is available

  # ============================================================================
  # Confidence Thresholds
  # ============================================================================

  Rule: Confidence threshold determines execution mode

    High confidence auto-executes, low confidence requires review.

    @acceptance-criteria @happy-path
    Scenario Outline: Execution mode based on confidence
      Given confidence threshold is 0.8
      And agent detects pattern with confidence <confidence>
      When determining execution mode
      Then mode should be "<mode>"

      Examples:
        | confidence | mode |
        | 0.95 | auto-execute |
        | 0.80 | auto-execute |
        | 0.79 | flag-for-review |
        | 0.50 | flag-for-review |

    @acceptance-criteria @happy-path
    Scenario: Custom threshold per agent
      Given agent "high-risk-detector" with threshold 0.95
      And agent "low-risk-notifier" with threshold 0.5
      When both detect patterns with confidence 0.75
      Then high-risk-detector flags for review
      And low-risk-notifier auto-executes

  # ============================================================================
  # Approval Requirements
  # ============================================================================

  Rule: Some actions always require approval

    Critical actions bypass confidence threshold.

    @acceptance-criteria @happy-path
    Scenario: RequiresApproval action with high confidence
      Given action "AccountSuspension" in requiresApproval list
      And agent confidence is 0.99
      When determining execution mode
      Then mode should be "flag-for-review"

    @acceptance-criteria @happy-path
    Scenario: AutoApprove action with low confidence
      Given action "LowRiskNotification" in autoApprove list
      And agent confidence is 0.5
      When determining execution mode
      Then mode should be "auto-execute"

    @acceptance-criteria @happy-path
    Scenario: Configure multiple approval requirements
      Given requiresApproval list:
        | actionType |
        | AccountSuspension |
        | HighValueRefund |
        | DataDeletion |
      When any of these actions are proposed
      Then all require human approval

  # ============================================================================
  # Approval Workflow
  # ============================================================================

  Rule: Flagged actions create review tasks

    Human reviewers see pending actions.

    @acceptance-criteria @happy-path
    Scenario: Create review task
      Given an action flagged for review
      When action is submitted
      Then AgentActionPending event is recorded
      And review task is created
      And task includes action details and reasoning

    @acceptance-criteria @happy-path
    Scenario: Approve pending action
      Given a pending action with id "action_123"
      When reviewer approves the action
      Then AgentActionApproved event is recorded
      And original command is executed

    @acceptance-criteria @happy-path
    Scenario: Reject pending action
      Given a pending action with id "action_123"
      When reviewer rejects with reason "False positive"
      Then AgentActionRejected event is recorded
      And command is NOT executed
      And rejection reason is recorded

  # ============================================================================
  # Timeout Handling
  # ============================================================================

  Rule: Pending actions expire after timeout

    Unreviewed actions don't linger indefinitely.

    @acceptance-criteria @happy-path
    Scenario: Action expires after timeout
      Given approval timeout is 24 hours
      And an action flagged for review
      When 24 hours pass without review
      Then AgentActionExpired event is recorded
      And action status becomes "expired"

    @acceptance-criteria @happy-path
    Scenario: Custom timeout per action type
      Given AccountSuspension timeout is 1 hour
      And LowRiskNotification timeout is 7 days
      When both are flagged for review
      Then each uses its configured timeout

    @acceptance-criteria @edge-case
    Scenario: Approve action near timeout
      Given an action 23 hours old
      And timeout is 24 hours
      When reviewer approves at 23h 59m
      Then approval succeeds
      And command is executed
