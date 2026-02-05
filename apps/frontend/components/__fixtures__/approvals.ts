/**
 * Mock approval data fixtures for Ladle stories.
 * Matches the pendingApprovals table schema and AgentCheckpoint types.
 */

import type { ApprovalStatus } from "@/lib/approval-utils";

/**
 * Mock ID type for Convex documents.
 * In production, this would come from Convex generated types.
 */
type MockId<TableName extends string> = string & { __tableName: TableName };

// Re-export ApprovalStatus for consumers that import from this file
export type { ApprovalStatus };

/**
 * Agent status type for checkpoint tracking.
 */
export type AgentStatus = "active" | "paused" | "stopped";

/**
 * Pending approval type (matches schema.ts)
 */
export interface PendingApprovalFixture {
  _id: MockId<"pendingApprovals">;
  _creationTime: number;
  approvalId: string;
  agentId: string;
  decisionId: string;
  action: {
    type: string;
    payload: unknown;
  };
  confidence: number;
  reason: string;
  status: ApprovalStatus;
  triggeringEventIds: string[];
  expiresAt: number;
  createdAt: number;
  reviewerId?: string;
  reviewedAt?: number;
  reviewNote?: string;
}

/**
 * Agent checkpoint type (matches schema.ts)
 */
export interface AgentCheckpointFixture {
  _id: MockId<"agentCheckpoints">;
  _creationTime: number;
  agentId: string;
  subscriptionId: string;
  lastProcessedPosition: number;
  lastEventId: string;
  status: AgentStatus;
  eventsProcessed: number;
  updatedAt: number;
}

const now = Date.now();
const hourMs = 3600000;
const dayMs = 86400000;

/**
 * Individual mock approvals with different states and scenarios.
 */
export const mockApprovals = {
  pending: {
    _id: "approval_001" as MockId<"pendingApprovals">,
    _creationTime: now - hourMs * 2,
    approvalId: "apr-001-abc123",
    agentId: "churn-risk-agent",
    decisionId: "dec-001-xyz789",
    action: {
      type: "SuggestCustomerOutreach",
      payload: {
        customerId: "cust-001",
        channel: "email",
        template: "retention_offer",
      },
    },
    confidence: 0.75,
    reason: "Customer cancelled 3 orders in 30 days, indicating potential churn risk",
    status: "pending" as const,
    triggeringEventIds: ["evt-001", "evt-002", "evt-003"],
    expiresAt: now + dayMs,
    createdAt: now - hourMs * 2,
  },
  pendingHighConfidence: {
    _id: "approval_002" as MockId<"pendingApprovals">,
    _creationTime: now - hourMs,
    approvalId: "apr-002-def456",
    agentId: "churn-risk-agent",
    decisionId: "dec-002-abc123",
    action: {
      type: "SuggestCustomerOutreach",
      payload: {
        customerId: "cust-002",
        channel: "phone",
        priority: "high",
      },
    },
    confidence: 0.95,
    reason: "5 cancellations in 2 weeks with high-value orders, strong churn signal",
    status: "pending" as const,
    triggeringEventIds: ["evt-004", "evt-005", "evt-006", "evt-007", "evt-008"],
    expiresAt: now + dayMs * 2,
    createdAt: now - hourMs,
  },
  pendingLowConfidence: {
    _id: "approval_003" as MockId<"pendingApprovals">,
    _creationTime: now - hourMs * 3,
    approvalId: "apr-003-ghi789",
    agentId: "fraud-detection-agent",
    decisionId: "dec-003-def456",
    action: {
      type: "FlagForReview",
      payload: {
        orderId: "ord-suspicious-001",
        reason: "unusual_pattern",
      },
    },
    confidence: 0.55,
    reason: "Unusual order pattern detected but confidence is low due to limited data",
    status: "pending" as const,
    triggeringEventIds: ["evt-009"],
    expiresAt: now + hourMs * 12,
    createdAt: now - hourMs * 3,
  },
  pendingExpiringSoon: {
    _id: "approval_004" as MockId<"pendingApprovals">,
    _creationTime: now - hourMs * 23,
    approvalId: "apr-004-jkl012",
    agentId: "churn-risk-agent",
    decisionId: "dec-004-ghi789",
    action: {
      type: "SuggestCustomerOutreach",
      payload: {
        customerId: "cust-003",
        urgency: "immediate",
      },
    },
    confidence: 0.82,
    reason: "Multiple cancellations detected, customer may leave soon",
    status: "pending" as const,
    triggeringEventIds: ["evt-010", "evt-011", "evt-012"],
    expiresAt: now + hourMs * 0.5, // 30 minutes left
    createdAt: now - hourMs * 23,
  },
  approved: {
    _id: "approval_005" as MockId<"pendingApprovals">,
    _creationTime: now - dayMs,
    approvalId: "apr-005-mno345",
    agentId: "churn-risk-agent",
    decisionId: "dec-005-jkl012",
    action: {
      type: "SuggestCustomerOutreach",
      payload: {
        customerId: "cust-004",
        channel: "email",
        template: "loyalty_reward",
      },
    },
    confidence: 0.88,
    reason: "Repeated cancellations suggest dissatisfaction with service",
    status: "approved" as const,
    triggeringEventIds: ["evt-013", "evt-014", "evt-015"],
    expiresAt: now - hourMs * 12, // Was set to expire
    createdAt: now - dayMs,
    reviewerId: "admin-user-001",
    reviewedAt: now - hourMs * 18,
    reviewNote: "Approved - customer is a high-value account, worth the outreach",
  },
  rejected: {
    _id: "approval_006" as MockId<"pendingApprovals">,
    _creationTime: now - dayMs * 2,
    approvalId: "apr-006-pqr678",
    agentId: "fraud-detection-agent",
    decisionId: "dec-006-mno345",
    action: {
      type: "SuspendAccount",
      payload: {
        customerId: "cust-005",
        duration: "7d",
      },
    },
    confidence: 0.72,
    reason: "Suspicious payment pattern detected",
    status: "rejected" as const,
    triggeringEventIds: ["evt-016", "evt-017"],
    expiresAt: now - dayMs, // Already expired
    createdAt: now - dayMs * 2,
    reviewerId: "admin-user-002",
    reviewedAt: now - dayMs - hourMs * 6,
    reviewNote: "Rejected - false positive, customer has verified identity",
  },
  expired: {
    _id: "approval_007" as MockId<"pendingApprovals">,
    _creationTime: now - dayMs * 3,
    approvalId: "apr-007-stu901",
    agentId: "churn-risk-agent",
    decisionId: "dec-007-pqr678",
    action: {
      type: "SuggestCustomerOutreach",
      payload: {
        customerId: "cust-006",
        channel: "sms",
      },
    },
    confidence: 0.79,
    reason: "Customer showing signs of disengagement",
    status: "expired" as const,
    triggeringEventIds: ["evt-018", "evt-019", "evt-020"],
    expiresAt: now - dayMs * 2,
    createdAt: now - dayMs * 3,
  },
  withLongReason: {
    _id: "approval_008" as MockId<"pendingApprovals">,
    _creationTime: now - hourMs * 4,
    approvalId: "apr-008-vwx234",
    agentId: "analytics-agent",
    decisionId: "dec-008-stu901",
    action: {
      type: "GenerateReport",
      payload: {
        reportType: "churn_analysis",
        period: "quarterly",
      },
    },
    confidence: 0.85,
    reason:
      "Based on comprehensive analysis of customer behavior patterns over the past 90 days, including order frequency decline of 45%, average order value reduction of 30%, increased support ticket frequency, and negative sentiment in recent feedback surveys. The machine learning model has identified this customer segment as high-risk for churn within the next 30 days with statistical significance (p < 0.05). Recommended action is proactive outreach with personalized retention offer based on historical purchase preferences.",
    status: "pending" as const,
    triggeringEventIds: ["evt-021"],
    expiresAt: now + dayMs * 3,
    createdAt: now - hourMs * 4,
  },
  withManyEvents: {
    _id: "approval_009" as MockId<"pendingApprovals">,
    _creationTime: now - hourMs * 5,
    approvalId: "apr-009-yza567",
    agentId: "pattern-detection-agent",
    decisionId: "dec-009-vwx234",
    action: {
      type: "TriggerWorkflow",
      payload: {
        workflowId: "escalation-process",
        priority: "medium",
      },
    },
    confidence: 0.91,
    reason: "Multiple related events detected across different domains",
    status: "pending" as const,
    triggeringEventIds: [
      "evt-022",
      "evt-023",
      "evt-024",
      "evt-025",
      "evt-026",
      "evt-027",
      "evt-028",
      "evt-029",
      "evt-030",
      "evt-031",
      "evt-032",
      "evt-033",
    ],
    expiresAt: now + dayMs * 2,
    createdAt: now - hourMs * 5,
  },
  withLongActionType: {
    _id: "approval_010" as MockId<"pendingApprovals">,
    _creationTime: now - hourMs * 6,
    approvalId: "apr-010-bcd890",
    agentId: "enterprise-compliance-agent",
    decisionId: "dec-010-yza567",
    action: {
      type: "InitiateCustomerRetentionOutreachWorkflowWithEscalation",
      payload: {
        customerId: "cust-enterprise-007",
        escalationLevel: 2,
      },
    },
    confidence: 0.77,
    reason: "Enterprise customer showing early warning signs",
    status: "pending" as const,
    triggeringEventIds: ["evt-034", "evt-035"],
    expiresAt: now + dayMs,
    createdAt: now - hourMs * 6,
  },
} as const satisfies Record<string, PendingApprovalFixture>;

/**
 * Array of all mock approvals for list views.
 */
export const approvalList: PendingApprovalFixture[] = Object.values(mockApprovals);

/**
 * Approvals filtered by status for testing filter views.
 */
export const approvalsByStatus = {
  pending: approvalList.filter((a) => a.status === "pending"),
  approved: approvalList.filter((a) => a.status === "approved"),
  rejected: approvalList.filter((a) => a.status === "rejected"),
  expired: approvalList.filter((a) => a.status === "expired"),
} as const;

/**
 * Individual mock agent checkpoints with different statuses.
 */
export const mockAgentCheckpoints = {
  activeChurnRisk: {
    _id: "checkpoint_001" as MockId<"agentCheckpoints">,
    _creationTime: now - dayMs * 7,
    agentId: "churn-risk-agent",
    subscriptionId: "sub-churn-risk-001",
    lastProcessedPosition: 1247,
    lastEventId: "evt-latest-001",
    status: "active" as const,
    eventsProcessed: 1247,
    updatedAt: now - hourMs * 0.5,
  },
  activeFraudDetection: {
    _id: "checkpoint_002" as MockId<"agentCheckpoints">,
    _creationTime: now - dayMs * 14,
    agentId: "fraud-detection-agent",
    subscriptionId: "sub-fraud-001",
    lastProcessedPosition: 3891,
    lastEventId: "evt-latest-002",
    status: "active" as const,
    eventsProcessed: 3891,
    updatedAt: now - hourMs * 2,
  },
  pausedAnalytics: {
    _id: "checkpoint_003" as MockId<"agentCheckpoints">,
    _creationTime: now - dayMs * 30,
    agentId: "analytics-agent",
    subscriptionId: "sub-analytics-001",
    lastProcessedPosition: 892,
    lastEventId: "evt-latest-003",
    status: "paused" as const,
    eventsProcessed: 892,
    updatedAt: now - dayMs * 2,
  },
  stoppedLegacy: {
    _id: "checkpoint_004" as MockId<"agentCheckpoints">,
    _creationTime: now - dayMs * 60,
    agentId: "legacy-notification-agent",
    subscriptionId: "sub-legacy-001",
    lastProcessedPosition: 156,
    lastEventId: "evt-latest-004",
    status: "stopped" as const,
    eventsProcessed: 156,
    updatedAt: now - dayMs * 30,
  },
} as const satisfies Record<string, AgentCheckpointFixture>;

/**
 * Array of all mock checkpoints for list views.
 */
export const checkpointList: AgentCheckpointFixture[] = Object.values(mockAgentCheckpoints);

/**
 * Checkpoints filtered by status for testing filter views.
 */
export const checkpointsByStatus = {
  active: checkpointList.filter((c) => c.status === "active"),
  paused: checkpointList.filter((c) => c.status === "paused"),
  stopped: checkpointList.filter((c) => c.status === "stopped"),
} as const;

/**
 * Agent status display configuration for UI.
 */
export const agentStatusConfig: Record<
  AgentStatus,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  active: { label: "Active", variant: "outline" },
  paused: { label: "Paused", variant: "secondary" },
  stopped: { label: "Stopped", variant: "destructive" },
} as const;
