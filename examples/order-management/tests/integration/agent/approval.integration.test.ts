/**
 * Agent Approval Workflow Integration Tests
 *
 * Uses real Convex backend via Docker for full system validation.
 * Tests the human-in-loop approval workflow:
 * - Pending approval creation for low-confidence decisions
 * - Approval flow with command emission
 * - Rejection flow with audit trail
 * - Expiration handling for stale approvals
 *
 * @since Phase 22.4 (AgentAsBoundedContext - Approval Workflow)
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ConvexTestingHelper } from "convex-helpers/testing";
import { api } from "../../../convex/_generated/api";
import { waitUntil, DEFAULT_TIMEOUT_MS } from "../../support/localBackendHelpers";
import { testQuery, testMutation } from "../../support/integrationHelpers";
import { CHURN_RISK_AGENT_ID } from "../../../convex/contexts/agent/_config";

// Extended timeout for integration tests (15 seconds)
const APPROVAL_TEST_TIMEOUT = DEFAULT_TIMEOUT_MS * 1.5;

// Test helper: generate unique IDs
const generateApprovalId = () => `apr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const generateDecisionId = () => `dec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const generateReviewerId = () => `reviewer_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

describe("Agent Approval Workflow Integration Tests", () => {
  let t: ConvexTestingHelper;

  beforeEach(() => {
    t = new ConvexTestingHelper({
      backendUrl: process.env.CONVEX_URL || "http://127.0.0.1:3210",
    });
  });

  afterEach(async () => {
    await t.close();
  });

  describe("Pending Approval Creation", () => {
    it("should create pending approval for low-confidence decisions", async () => {
      const approvalId = generateApprovalId();
      const decisionId = generateDecisionId();
      const now = Date.now();
      const expiresAt = now + 24 * 60 * 60 * 1000; // 24 hours

      // Create a pending approval directly (simulating agent handler behavior)
      const result = await testMutation(
        t,
        api.testingFunctions.testRecordPendingApproval,
        {
          approvalId,
          agentId: CHURN_RISK_AGENT_ID,
          decisionId,
          action: {
            type: "SuggestCustomerOutreach",
            payload: { customerId: "cust_test_123", riskLevel: "medium" },
          },
          confidence: 0.75,
          reason: "Customer cancelled 2 orders in 30 days",
          triggeringEventIds: ["evt_1", "evt_2"],
          expiresAt,
        }
      );

      expect(result.approvalId).toBe(approvalId);
      expect(result.created).toBe(true);

      // Verify the approval was created
      const approval = await testQuery(t, api.queries.agent.getApprovalById, {
        approvalId,
      });

      expect(approval).toBeDefined();
      expect(approval?.approvalId).toBe(approvalId);
      expect(approval?.agentId).toBe(CHURN_RISK_AGENT_ID);
      expect(approval?.decisionId).toBe(decisionId);
      expect(approval?.status).toBe("pending");
      expect(approval?.confidence).toBe(0.75);
      expect(approval?.action.type).toBe("SuggestCustomerOutreach");
      expect(approval?.triggeringEventIds).toEqual(["evt_1", "evt_2"]);
    });

    it("should be idempotent - duplicate approvalId should not create new record", async () => {
      const approvalId = generateApprovalId();
      const decisionId = generateDecisionId();
      const expiresAt = Date.now() + 24 * 60 * 60 * 1000;

      // Create first approval
      const result1 = await testMutation(
        t,
        api.testingFunctions.testRecordPendingApproval,
        {
          approvalId,
          agentId: CHURN_RISK_AGENT_ID,
          decisionId,
          action: { type: "SuggestCustomerOutreach", payload: {} },
          confidence: 0.75,
          reason: "Test reason",
          triggeringEventIds: [],
          expiresAt,
        }
      );

      expect(result1.created).toBe(true);

      // Try to create duplicate
      const result2 = await testMutation(
        t,
        api.testingFunctions.testRecordPendingApproval,
        {
          approvalId, // Same approvalId
          agentId: CHURN_RISK_AGENT_ID,
          decisionId: generateDecisionId(), // Different decisionId
          action: { type: "DifferentAction", payload: {} },
          confidence: 0.5,
          reason: "Different reason",
          triggeringEventIds: ["evt_new"],
          expiresAt,
        }
      );

      expect(result2.created).toBe(false); // Should not create

      // Verify only one approval exists
      const approval = await testQuery(t, api.queries.agent.getApprovalById, {
        approvalId,
      });

      expect(approval?.decisionId).toBe(decisionId); // Original decisionId
      expect(approval?.action.type).toBe("SuggestCustomerOutreach"); // Original action
    });
  });

  describe("Approval Flow", () => {
    it("should emit command when approval is approved", async () => {
      const approvalId = generateApprovalId();
      const decisionId = generateDecisionId();
      const reviewerId = generateReviewerId();
      const expiresAt = Date.now() + 24 * 60 * 60 * 1000;

      // Create pending approval
      await testMutation(t, api.testingFunctions.testRecordPendingApproval, {
        approvalId,
        agentId: CHURN_RISK_AGENT_ID,
        decisionId,
        action: {
          type: "SuggestCustomerOutreach",
          payload: { customerId: "cust_approve_test", riskLevel: "high" },
        },
        confidence: 0.85,
        reason: "Customer at risk of churning",
        triggeringEventIds: ["evt_a", "evt_b", "evt_c"],
        expiresAt,
      });

      // Verify pending status
      const pendingApproval = await testQuery(t, api.queries.agent.getApprovalById, {
        approvalId,
      });
      expect(pendingApproval?.status).toBe("pending");

      // Approve the action
      const result = await testMutation(
        t,
        api.testingFunctions.testApproveAgentAction,
        {
          approvalId,
          reviewerId,
          reviewNote: "Customer verified as high-value, outreach approved",
        }
      );

      expect(result.success).toBe(true);

      // Verify status changed to approved
      const approvedApproval = await testQuery(t, api.queries.agent.getApprovalById, {
        approvalId,
      });

      expect(approvedApproval?.status).toBe("approved");
      expect(approvedApproval?.reviewerId).toBe(reviewerId);
      expect(approvedApproval?.reviewNote).toBe("Customer verified as high-value, outreach approved");
      expect(approvedApproval?.reviewedAt).toBeDefined();

      // Verify audit event was created
      await waitUntil(
        async () => {
          const auditEvents = await testQuery(t, api.queries.agent.getAuditEvents, {
            agentId: CHURN_RISK_AGENT_ID,
            eventType: "AgentActionApproved",
            limit: 10,
          });
          return auditEvents.some((e) => e.payload.approvalId === approvalId);
        },
        { message: "AgentActionApproved audit event created", timeout: APPROVAL_TEST_TIMEOUT }
      );

      // Verify command was emitted (check agentCommands table via audit)
      const auditEvents = await testQuery(t, api.queries.agent.getAuditEvents, {
        agentId: CHURN_RISK_AGENT_ID,
        limit: 20,
      });

      const approvalAudit = auditEvents.find(
        (e) => e.eventType === "AgentActionApproved" && e.payload.approvalId === approvalId
      );
      expect(approvalAudit).toBeDefined();
      expect(approvalAudit?.payload.reviewerId).toBe(reviewerId);
    });

    it("should prevent double approval", async () => {
      const approvalId = generateApprovalId();
      const decisionId = generateDecisionId();
      const expiresAt = Date.now() + 24 * 60 * 60 * 1000;

      // Create and approve
      // Note: Must include at least one triggering event ID since approval
      // emits a command which requires event IDs for traceability
      await testMutation(t, api.testingFunctions.testRecordPendingApproval, {
        approvalId,
        agentId: CHURN_RISK_AGENT_ID,
        decisionId,
        action: { type: "TestAction", payload: {} },
        confidence: 0.8,
        reason: "Test",
        triggeringEventIds: ["evt_double_approval_test"],
        expiresAt,
      });

      await testMutation(t, api.testingFunctions.testApproveAgentAction, {
        approvalId,
        reviewerId: "reviewer_1",
      });

      // Try to approve again
      const result = await testMutation(
        t,
        api.testingFunctions.testApproveAgentAction,
        {
          approvalId,
          reviewerId: "reviewer_2",
        }
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe("INVALID_STATUS_TRANSITION");
    });
  });

  describe("Rejection Flow", () => {
    it("should record rejection with reason", async () => {
      const approvalId = generateApprovalId();
      const decisionId = generateDecisionId();
      const reviewerId = generateReviewerId();
      const expiresAt = Date.now() + 24 * 60 * 60 * 1000;

      // Create pending approval
      await testMutation(t, api.testingFunctions.testRecordPendingApproval, {
        approvalId,
        agentId: CHURN_RISK_AGENT_ID,
        decisionId,
        action: {
          type: "SuggestCustomerOutreach",
          payload: { customerId: "cust_reject_test" },
        },
        confidence: 0.6,
        reason: "Customer showing churn signals",
        triggeringEventIds: ["evt_x"],
        expiresAt,
      });

      // Reject the action
      const result = await testMutation(
        t,
        api.testingFunctions.testRejectAgentAction,
        {
          approvalId,
          reviewerId,
          reviewNote: "Customer already contacted by support team",
        }
      );

      expect(result.success).toBe(true);

      // Verify status changed to rejected
      const rejectedApproval = await testQuery(t, api.queries.agent.getApprovalById, {
        approvalId,
      });

      expect(rejectedApproval?.status).toBe("rejected");
      expect(rejectedApproval?.reviewerId).toBe(reviewerId);
      expect(rejectedApproval?.reviewNote).toBe("Customer already contacted by support team");
      expect(rejectedApproval?.reviewedAt).toBeDefined();

      // Verify audit event was created
      await waitUntil(
        async () => {
          const auditEvents = await testQuery(t, api.queries.agent.getAuditEvents, {
            agentId: CHURN_RISK_AGENT_ID,
            eventType: "AgentActionRejected",
            limit: 10,
          });
          return auditEvents.some((e) => e.payload.approvalId === approvalId);
        },
        { message: "AgentActionRejected audit event created", timeout: APPROVAL_TEST_TIMEOUT }
      );
    });

    it("should prevent rejection of already approved action", async () => {
      const approvalId = generateApprovalId();
      const decisionId = generateDecisionId();
      const expiresAt = Date.now() + 24 * 60 * 60 * 1000;

      // Create and approve
      // Note: Must include at least one triggering event ID since approval
      // emits a command which requires event IDs for traceability
      await testMutation(t, api.testingFunctions.testRecordPendingApproval, {
        approvalId,
        agentId: CHURN_RISK_AGENT_ID,
        decisionId,
        action: { type: "TestAction", payload: {} },
        confidence: 0.8,
        reason: "Test",
        triggeringEventIds: ["evt_reject_approved_test"],
        expiresAt,
      });

      await testMutation(t, api.testingFunctions.testApproveAgentAction, {
        approvalId,
        reviewerId: "reviewer_1",
      });

      // Try to reject
      const result = await testMutation(
        t,
        api.testingFunctions.testRejectAgentAction,
        {
          approvalId,
          reviewerId: "reviewer_2",
          reviewNote: "Should not work",
        }
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe("INVALID_STATUS_TRANSITION");
    });
  });

  describe("Expiration Handling", () => {
    it("should expire approvals after timeout", async () => {
      const approvalId = generateApprovalId();
      const decisionId = generateDecisionId();
      // Set expiration to past (already expired)
      const expiresAt = Date.now() - 1000; // 1 second ago

      // Create approval that's already expired
      await testMutation(t, api.testingFunctions.testRecordPendingApproval, {
        approvalId,
        agentId: CHURN_RISK_AGENT_ID,
        decisionId,
        action: {
          type: "SuggestCustomerOutreach",
          payload: { customerId: "cust_expire_test" },
        },
        confidence: 0.7,
        reason: "Customer at moderate risk",
        triggeringEventIds: ["evt_exp"],
        expiresAt,
      });

      // Verify it's still pending before expiration run
      const beforeExpire = await testQuery(t, api.queries.agent.getApprovalById, {
        approvalId,
      });
      expect(beforeExpire?.status).toBe("pending");

      // Run the expiration cron
      const expireResult = await testMutation(
        t,
        api.testingFunctions.testExpirePendingApprovals,
        {}
      );

      expect(expireResult.expiredCount).toBeGreaterThanOrEqual(1);

      // Verify status changed to expired
      const afterExpire = await testQuery(t, api.queries.agent.getApprovalById, {
        approvalId,
      });

      expect(afterExpire?.status).toBe("expired");

      // Verify audit event was created
      await waitUntil(
        async () => {
          const auditEvents = await testQuery(t, api.queries.agent.getAuditEvents, {
            agentId: CHURN_RISK_AGENT_ID,
            eventType: "AgentActionExpired",
            limit: 10,
          });
          return auditEvents.some((e) => e.payload.approvalId === approvalId);
        },
        { message: "AgentActionExpired audit event created", timeout: APPROVAL_TEST_TIMEOUT }
      );
    });

    it("should prevent approval of expired action", async () => {
      const approvalId = generateApprovalId();
      const decisionId = generateDecisionId();
      const expiresAt = Date.now() - 1000; // Already expired

      // Create expired approval
      await testMutation(t, api.testingFunctions.testRecordPendingApproval, {
        approvalId,
        agentId: CHURN_RISK_AGENT_ID,
        decisionId,
        action: { type: "TestAction", payload: {} },
        confidence: 0.8,
        reason: "Test",
        triggeringEventIds: [],
        expiresAt,
      });

      // Try to approve (should fail due to expiration)
      const result = await testMutation(
        t,
        api.testingFunctions.testApproveAgentAction,
        {
          approvalId,
          reviewerId: "reviewer_late",
        }
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe("APPROVAL_EXPIRED");
    });

    it("should not expire approvals still within timeout", async () => {
      const approvalId = generateApprovalId();
      const decisionId = generateDecisionId();
      // Set expiration to 1 hour in the future (not expired yet)
      const expiresAt = Date.now() + 60 * 60 * 1000;

      // Create approval that has NOT expired yet
      await testMutation(t, api.testingFunctions.testRecordPendingApproval, {
        approvalId,
        agentId: CHURN_RISK_AGENT_ID,
        decisionId,
        action: {
          type: "SuggestCustomerOutreach",
          payload: { customerId: "cust_not_expired" },
        },
        confidence: 0.75,
        reason: "Customer showing early churn signals",
        triggeringEventIds: ["evt_not_expired"],
        expiresAt,
      });

      // Verify it's pending before expiration run
      const beforeExpire = await testQuery(t, api.queries.agent.getApprovalById, {
        approvalId,
      });
      expect(beforeExpire?.status).toBe("pending");

      // Run the expiration cron
      await testMutation(t, api.testingFunctions.testExpirePendingApprovals, {});

      // Verify it's STILL pending (not expired because expiresAt is in future)
      const afterExpire = await testQuery(t, api.queries.agent.getApprovalById, {
        approvalId,
      });
      expect(afterExpire?.status).toBe("pending");
    });

    it("should correctly identify multiple expired approvals", async () => {
      const expiredApprovalId1 = generateApprovalId();
      const expiredApprovalId2 = generateApprovalId();
      const notExpiredApprovalId = generateApprovalId();

      // Create 2 already-expired approvals
      const expiredAt = Date.now() - 1000; // 1 second ago
      const notExpiredAt = Date.now() + 60 * 60 * 1000; // 1 hour in future

      await testMutation(t, api.testingFunctions.testRecordPendingApproval, {
        approvalId: expiredApprovalId1,
        agentId: CHURN_RISK_AGENT_ID,
        decisionId: generateDecisionId(),
        action: { type: "ExpiredAction1", payload: {} },
        confidence: 0.6,
        reason: "First expired",
        triggeringEventIds: ["evt_exp1"],
        expiresAt: expiredAt,
      });

      await testMutation(t, api.testingFunctions.testRecordPendingApproval, {
        approvalId: expiredApprovalId2,
        agentId: CHURN_RISK_AGENT_ID,
        decisionId: generateDecisionId(),
        action: { type: "ExpiredAction2", payload: {} },
        confidence: 0.55,
        reason: "Second expired",
        triggeringEventIds: ["evt_exp2"],
        expiresAt: expiredAt,
      });

      // Create 1 not-yet-expired approval
      await testMutation(t, api.testingFunctions.testRecordPendingApproval, {
        approvalId: notExpiredApprovalId,
        agentId: CHURN_RISK_AGENT_ID,
        decisionId: generateDecisionId(),
        action: { type: "NotExpiredAction", payload: {} },
        confidence: 0.9,
        reason: "Not expired yet",
        triggeringEventIds: ["evt_not_exp"],
        expiresAt: notExpiredAt,
      });

      // Verify all are pending before expiration run
      const beforeExpire1 = await testQuery(t, api.queries.agent.getApprovalById, {
        approvalId: expiredApprovalId1,
      });
      const beforeExpire2 = await testQuery(t, api.queries.agent.getApprovalById, {
        approvalId: expiredApprovalId2,
      });
      const beforeExpireNot = await testQuery(t, api.queries.agent.getApprovalById, {
        approvalId: notExpiredApprovalId,
      });

      expect(beforeExpire1?.status).toBe("pending");
      expect(beforeExpire2?.status).toBe("pending");
      expect(beforeExpireNot?.status).toBe("pending");

      // Run the expiration cron
      const expireResult = await testMutation(
        t,
        api.testingFunctions.testExpirePendingApprovals,
        {}
      );

      // Should have expired at least 2 (could be more from other tests)
      expect(expireResult.expiredCount).toBeGreaterThanOrEqual(2);

      // Verify expired approvals changed status
      const afterExpire1 = await testQuery(t, api.queries.agent.getApprovalById, {
        approvalId: expiredApprovalId1,
      });
      const afterExpire2 = await testQuery(t, api.queries.agent.getApprovalById, {
        approvalId: expiredApprovalId2,
      });
      const afterExpireNot = await testQuery(t, api.queries.agent.getApprovalById, {
        approvalId: notExpiredApprovalId,
      });

      expect(afterExpire1?.status).toBe("expired");
      expect(afterExpire2?.status).toBe("expired");
      expect(afterExpireNot?.status).toBe("pending"); // Should still be pending
    });
  });

  describe("Query Functionality", () => {
    it("should list pending approvals by agent", async () => {
      const approvalId1 = generateApprovalId();
      const approvalId2 = generateApprovalId();
      const expiresAt = Date.now() + 24 * 60 * 60 * 1000;

      // Create two pending approvals
      await testMutation(t, api.testingFunctions.testRecordPendingApproval, {
        approvalId: approvalId1,
        agentId: CHURN_RISK_AGENT_ID,
        decisionId: generateDecisionId(),
        action: { type: "Action1", payload: {} },
        confidence: 0.7,
        reason: "Reason 1",
        triggeringEventIds: [],
        expiresAt,
      });

      await testMutation(t, api.testingFunctions.testRecordPendingApproval, {
        approvalId: approvalId2,
        agentId: CHURN_RISK_AGENT_ID,
        decisionId: generateDecisionId(),
        action: { type: "Action2", payload: {} },
        confidence: 0.8,
        reason: "Reason 2",
        triggeringEventIds: [],
        expiresAt,
      });

      // Query pending approvals for the agent
      const approvals = await testQuery(t, api.queries.agent.getPendingApprovals, {
        agentId: CHURN_RISK_AGENT_ID,
        status: "pending",
      });

      expect(approvals.length).toBeGreaterThanOrEqual(2);

      const ids = approvals.map((a) => a.approvalId);
      expect(ids).toContain(approvalId1);
      expect(ids).toContain(approvalId2);
    });

    it("should filter approvals by status", async () => {
      const approvalId = generateApprovalId();
      const expiresAt = Date.now() + 24 * 60 * 60 * 1000;

      // Create and approve
      // Note: Must include at least one triggering event ID since approval
      // emits a command which requires event IDs for traceability
      await testMutation(t, api.testingFunctions.testRecordPendingApproval, {
        approvalId,
        agentId: CHURN_RISK_AGENT_ID,
        decisionId: generateDecisionId(),
        action: { type: "TestAction", payload: {} },
        confidence: 0.8,
        reason: "Test",
        triggeringEventIds: ["evt_filter_status_test"],
        expiresAt,
      });

      await testMutation(t, api.testingFunctions.testApproveAgentAction, {
        approvalId,
        reviewerId: "reviewer_filter_test",
      });

      // Query approved status
      const approvedApprovals = await testQuery(t, api.queries.agent.getPendingApprovals, {
        status: "approved",
      });

      const found = approvedApprovals.find((a) => a.approvalId === approvalId);
      expect(found).toBeDefined();
      expect(found?.status).toBe("approved");
    });
  });

  describe("Error Handling", () => {
    it("should return error for non-existent approval", async () => {
      const result = await testMutation(
        t,
        api.testingFunctions.testApproveAgentAction,
        {
          approvalId: "apr_nonexistent_123",
          reviewerId: "reviewer_test",
        }
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe("APPROVAL_NOT_FOUND");
    });
  });

  describe("Authorization", () => {
    /**
     * Tests that an unauthorized reviewer cannot approve an action.
     *
     * Uses testApproveAgentActionWithAuth which includes authorization check
     * based on authorizedAgentIds parameter.
     */
    it("should reject approval from unauthorized reviewer", async () => {
      const approvalId = generateApprovalId();
      const decisionId = generateDecisionId();
      const expiresAt = Date.now() + 24 * 60 * 60 * 1000;

      // Create pending approval for CHURN_RISK_AGENT_ID
      await testMutation(t, api.testingFunctions.testRecordPendingApproval, {
        approvalId,
        agentId: CHURN_RISK_AGENT_ID,
        decisionId,
        action: {
          type: "SuggestCustomerOutreach",
          payload: { customerId: "cust_auth_test" },
        },
        confidence: 0.75,
        reason: "Customer at moderate risk",
        triggeringEventIds: ["evt_auth_test"],
        expiresAt,
      });

      // Try to approve with a reviewer who is ONLY authorized for a different agent
      const result = await testMutation(
        t,
        api.testingFunctions.testApproveAgentActionWithAuth,
        {
          approvalId,
          reviewerId: "reviewer_unauthorized",
          authorizedAgentIds: ["different-agent-id", "another-agent-id"],
        }
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe("UNAUTHORIZED_REVIEWER");

      // Verify the approval is still pending (was not approved)
      const approval = await testQuery(t, api.queries.agent.getApprovalById, {
        approvalId,
      });
      expect(approval?.status).toBe("pending");
    });

    it("should allow approval from authorized reviewer", async () => {
      const approvalId = generateApprovalId();
      const decisionId = generateDecisionId();
      const expiresAt = Date.now() + 24 * 60 * 60 * 1000;

      // Create pending approval for CHURN_RISK_AGENT_ID
      await testMutation(t, api.testingFunctions.testRecordPendingApproval, {
        approvalId,
        agentId: CHURN_RISK_AGENT_ID,
        decisionId,
        action: {
          type: "SuggestCustomerOutreach",
          payload: { customerId: "cust_auth_allowed" },
        },
        confidence: 0.85,
        reason: "Customer at high risk",
        triggeringEventIds: ["evt_auth_allowed_test"],
        expiresAt,
      });

      // Approve with a reviewer who IS authorized for CHURN_RISK_AGENT_ID
      const result = await testMutation(
        t,
        api.testingFunctions.testApproveAgentActionWithAuth,
        {
          approvalId,
          reviewerId: "reviewer_authorized",
          authorizedAgentIds: [CHURN_RISK_AGENT_ID, "another-agent-id"],
        }
      );

      expect(result.success).toBe(true);
      expect(result.approvalId).toBe(approvalId);

      // Verify the approval was approved
      const approval = await testQuery(t, api.queries.agent.getApprovalById, {
        approvalId,
      });
      expect(approval?.status).toBe("approved");
      expect(approval?.reviewerId).toBe("reviewer_authorized");
    });

    it("should allow approval when no authorization restrictions specified", async () => {
      const approvalId = generateApprovalId();
      const decisionId = generateDecisionId();
      const expiresAt = Date.now() + 24 * 60 * 60 * 1000;

      // Create pending approval
      await testMutation(t, api.testingFunctions.testRecordPendingApproval, {
        approvalId,
        agentId: CHURN_RISK_AGENT_ID,
        decisionId,
        action: {
          type: "SuggestCustomerOutreach",
          payload: { customerId: "cust_no_auth_restriction" },
        },
        confidence: 0.9,
        reason: "Customer at very high risk",
        triggeringEventIds: ["evt_no_auth_test"],
        expiresAt,
      });

      // Approve without specifying authorizedAgentIds (no restrictions)
      const result = await testMutation(
        t,
        api.testingFunctions.testApproveAgentActionWithAuth,
        {
          approvalId,
          reviewerId: "reviewer_unrestricted",
          // No authorizedAgentIds - should be allowed
        }
      );

      expect(result.success).toBe(true);

      // Verify the approval was approved
      const approval = await testQuery(t, api.queries.agent.getApprovalById, {
        approvalId,
      });
      expect(approval?.status).toBe("approved");
    });
  });
});
