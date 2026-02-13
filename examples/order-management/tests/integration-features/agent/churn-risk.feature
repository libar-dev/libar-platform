@integration @churn-risk
Feature: Churn Risk Agent — Full Pipeline

  Tests the complete churn-risk agent flow:
  EventBus subscription -> pattern detection -> audit -> command emission -> outreach record.
  Runs against a real Convex backend via Docker.

  Background:
    Given the backend is running and clean

  Scenario: Three cancellations trigger churn risk pattern detection
    Given a product "ChurnTestWidget" exists with no stock
    And customer "churn_cust" has created and submitted 3 orders for "ChurnTestWidget"
    And all 3 orders are cancelled by saga compensation
    When the churn-risk agent processes the cancellation events
    Then a PatternDetected audit event is recorded for the churn-risk agent

  Scenario: Two cancellations do not trigger churn risk
    Given a product "SafeWidget" exists with no stock
    And customer "safe_cust" has created and submitted 2 orders for "SafeWidget"
    And all 2 orders are cancelled by saga compensation
    When the churn-risk agent checkpoint has advanced past the cancellation events
    Then no PatternDetected audit event is recorded for customer "safe_cust"

  Scenario: Detected pattern emits SuggestCustomerOutreach command
    Given a product "CommandTestWidget" exists with no stock
    And customer "cmd_cust" has created and submitted 3 orders for "CommandTestWidget"
    And all 3 orders are cancelled by saga compensation
    When the churn-risk agent detects the pattern and emits a command
    Then a SuggestCustomerOutreach outreach task is recorded for the customer
