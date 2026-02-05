/**
 * Human-in-Loop Approval Workflow for Agent BC
 *
 * Manages the approval workflow for agent actions that require
 * human review. Enables:
 * - Approval determination based on confidence and action type
 * - Pending approval tracking with expiration
 * - Approval/rejection/expiration status transitions
 *
 * @module agent/approval
 */

import { z } from "zod";
import type { HumanInLoopConfig } from "./types.js";

// ============================================================================
// Error Codes
// ============================================================================

/**
 * Error codes for approval operations.
 */
export const APPROVAL_ERROR_CODES = {
  /** Approval not found */
  APPROVAL_NOT_FOUND: "APPROVAL_NOT_FOUND",
  /** Invalid approval status transition */
  INVALID_STATUS_TRANSITION: "INVALID_STATUS_TRANSITION",
  /** Approval has already been processed */
  ALREADY_PROCESSED: "ALREADY_PROCESSED",
  /** Approval has expired */
  APPROVAL_EXPIRED: "APPROVAL_EXPIRED",
  /** Invalid timeout format */
  INVALID_TIMEOUT_FORMAT: "INVALID_TIMEOUT_FORMAT",
} as const;

export type ApprovalErrorCode = (typeof APPROVAL_ERROR_CODES)[keyof typeof APPROVAL_ERROR_CODES];

// ============================================================================
// Status Types
// ============================================================================

/**
 * Approval status values.
 */
export const APPROVAL_STATUSES = ["pending", "approved", "rejected", "expired"] as const;

/**
 * Status of an approval request.
 *
 * - `pending`: Awaiting human review
 * - `approved`: Human approved the action
 * - `rejected`: Human rejected the action
 * - `expired`: Approval window expired without decision
 */
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

// O(1) lookup Set for type guard performance
const APPROVAL_STATUS_SET = new Set<string>(APPROVAL_STATUSES);

/**
 * Type guard to check if a value is a valid ApprovalStatus.
 *
 * @param value - Value to check
 * @returns True if value is a valid ApprovalStatus
 */
export function isApprovalStatus(value: unknown): value is ApprovalStatus {
  return typeof value === "string" && APPROVAL_STATUS_SET.has(value);
}

// ============================================================================
// Zod Schemas
// ============================================================================

/**
 * Schema for approval status.
 */
export const ApprovalStatusSchema = z.enum(["pending", "approved", "rejected", "expired"]);

/**
 * Schema for action in a pending approval.
 */
export const ApprovalActionSchema = z.object({
  /** Action/command type */
  type: z.string().min(1),
  /** Action payload */
  payload: z.unknown(),
});

/**
 * Schema for pending approval.
 */
export const PendingApprovalSchema = z.object({
  /** Unique approval request ID */
  approvalId: z.string().min(1),

  /** Agent BC identifier */
  agentId: z.string().min(1),

  /** Decision ID for correlation */
  decisionId: z.string().min(1),

  /** Action awaiting approval */
  action: ApprovalActionSchema,

  /** Confidence score that triggered the review (0-1) */
  confidence: z.number().min(0).max(1),

  /** Reason for the action */
  reason: z.string(),

  /** Current approval status */
  status: ApprovalStatusSchema,

  /** When the approval was requested */
  requestedAt: z.number(),

  /** When the approval expires */
  expiresAt: z.number(),

  /** ID of the reviewer (if reviewed) */
  reviewerId: z.string().optional(),

  /** When the review occurred (if reviewed) */
  reviewedAt: z.number().optional(),

  /** Note from reviewer (if approved) */
  reviewNote: z.string().optional(),

  /** Rejection reason (if rejected) */
  rejectionReason: z.string().optional(),
});

// ============================================================================
// TypeScript Types
// ============================================================================

/**
 * Action in a pending approval.
 */
export interface ApprovalAction {
  /** Action/command type */
  readonly type: string;
  /** Action payload */
  readonly payload: unknown;
}

/**
 * Pending approval request for an agent action.
 *
 * Represents an action that requires human review before execution.
 */
export interface PendingApproval {
  /** Unique approval request ID */
  readonly approvalId: string;

  /** Agent BC identifier */
  readonly agentId: string;

  /** Decision ID for correlation */
  readonly decisionId: string;

  /** Action awaiting approval */
  readonly action: ApprovalAction;

  /** Confidence score that triggered the review (0-1) */
  readonly confidence: number;

  /** Reason for the action */
  readonly reason: string;

  /** Current approval status */
  readonly status: ApprovalStatus;

  /** When the approval was requested */
  readonly requestedAt: number;

  /** When the approval expires */
  readonly expiresAt: number;

  /** ID of the reviewer (if reviewed) */
  readonly reviewerId?: string;

  /** When the review occurred (if reviewed) */
  readonly reviewedAt?: number;

  /** Note from reviewer (if approved) */
  readonly reviewNote?: string;

  /** Rejection reason (if rejected) */
  readonly rejectionReason?: string;
}

// ============================================================================
// Timeout Parsing
// ============================================================================

/**
 * Duration unit multipliers in milliseconds for approval timeout.
 */
const TIMEOUT_UNITS: Record<string, number> = {
  m: 60 * 1000, // minutes
  h: 60 * 60 * 1000, // hours
  d: 24 * 60 * 60 * 1000, // days
};

/**
 * Default approval timeout in milliseconds (24 hours).
 */
export const DEFAULT_APPROVAL_TIMEOUT_MS = 24 * 60 * 60 * 1000;

/**
 * Parse an approval timeout string to milliseconds.
 *
 * Supports formats:
 * - `Nd` - N days (e.g., "7d", "30d")
 * - `Nh` - N hours (e.g., "24h", "12h")
 * - `Nm` - N minutes (e.g., "30m", "60m")
 *
 * @param timeout - Timeout string to parse
 * @returns Milliseconds, or null if format is invalid
 *
 * @example
 * ```typescript
 * parseApprovalTimeout("24h"); // 86400000 (24 hours in ms)
 * parseApprovalTimeout("7d");  // 604800000 (7 days in ms)
 * parseApprovalTimeout("30m"); // 1800000 (30 minutes in ms)
 * parseApprovalTimeout("invalid"); // null
 * ```
 */
export function parseApprovalTimeout(timeout: string): number | null {
  const match = timeout.trim().match(/^(\d+)([dhm])$/i);
  if (!match) {
    return null;
  }

  const valueStr = match[1];
  const unitStr = match[2];
  if (valueStr === undefined || unitStr === undefined) {
    return null;
  }

  const value = parseInt(valueStr, 10);
  const unit = unitStr.toLowerCase();
  const multiplier = TIMEOUT_UNITS[unit];

  if (value <= 0 || !multiplier) {
    return null;
  }

  return value * multiplier;
}

/**
 * Check if a timeout string is valid.
 *
 * @param timeout - Timeout string to validate
 * @returns true if valid, false otherwise
 */
export function isValidApprovalTimeout(timeout: string): boolean {
  return parseApprovalTimeout(timeout) !== null;
}

/**
 * Calculate the expiration timestamp for an approval.
 *
 * @param config - Human-in-loop configuration
 * @param requestedAt - When the approval was requested
 * @returns Expiration timestamp
 */
export function calculateExpirationTime(config: HumanInLoopConfig, requestedAt: number): number {
  const timeout = config.approvalTimeout ?? "24h";
  const timeoutMs = parseApprovalTimeout(timeout) ?? DEFAULT_APPROVAL_TIMEOUT_MS;
  return requestedAt + timeoutMs;
}

// ============================================================================
// Approval Determination
// ============================================================================

/**
 * Determine if an action requires human approval.
 *
 * Approval is required if:
 * 1. Action type is in the `requiresApproval` list, OR
 * 2. Confidence is below the `confidenceThreshold` AND action is not in `autoApprove`
 *
 * @param config - Human-in-loop configuration
 * @param actionType - Type of action to check
 * @param confidence - Confidence score for the action (0-1)
 * @returns true if approval is required
 *
 * @example
 * ```typescript
 * const config: HumanInLoopConfig = {
 *   confidenceThreshold: 0.9,
 *   requiresApproval: ["DeleteCustomer"],
 *   autoApprove: ["LogEvent"],
 * };
 *
 * shouldRequireApproval(config, "DeleteCustomer", 0.99); // true (always requires)
 * shouldRequireApproval(config, "UpdateCustomer", 0.85); // true (below threshold)
 * shouldRequireApproval(config, "UpdateCustomer", 0.95); // false (above threshold)
 * shouldRequireApproval(config, "LogEvent", 0.5);        // false (auto-approve)
 * ```
 */
export function shouldRequireApproval(
  config: HumanInLoopConfig,
  actionType: string,
  confidence: number
): boolean {
  // Check if action always requires approval
  if (config.requiresApproval?.includes(actionType)) {
    return true;
  }

  // Check if action is auto-approved
  if (config.autoApprove?.includes(actionType)) {
    return false;
  }

  // Use confidence threshold
  const threshold = config.confidenceThreshold ?? 0.9;
  return confidence < threshold;
}

// ============================================================================
// Approval ID Generation
// ============================================================================

/**
 * Generate a unique approval ID.
 *
 * Uses timestamp + random suffix for uniqueness.
 * Format: `apr_{timestamp}_{random}`
 *
 * @returns Unique approval ID
 */
export function generateApprovalId(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `apr_${timestamp}_${random}`;
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a new pending approval request.
 *
 * @param agentId - Agent BC identifier
 * @param decisionId - Decision ID for correlation
 * @param action - Action awaiting approval
 * @param confidence - Confidence score (0-1)
 * @param reason - Reason for the action
 * @param config - Human-in-loop configuration
 * @returns New pending approval with calculated expiration
 *
 * @example
 * ```typescript
 * const approval = createPendingApproval(
 *   "churn-risk-agent",
 *   "dec_123_abc",
 *   { type: "SuggestOutreach", payload: { customerId: "cust-1" } },
 *   0.75,
 *   "Customer cancelled 3 orders in 30 days",
 *   { approvalTimeout: "24h" }
 * );
 * ```
 */
export function createPendingApproval(
  agentId: string,
  decisionId: string,
  action: ApprovalAction,
  confidence: number,
  reason: string,
  config: HumanInLoopConfig
): PendingApproval {
  const now = Date.now();
  return {
    approvalId: generateApprovalId(),
    agentId,
    decisionId,
    action,
    confidence,
    reason,
    status: "pending",
    requestedAt: now,
    expiresAt: calculateExpirationTime(config, now),
  };
}

// ============================================================================
// Status Transition Functions
// ============================================================================

/**
 * Approve a pending action.
 *
 * Transitions from "pending" to "approved" status.
 *
 * @param approval - Approval to update
 * @param reviewerId - ID of the human reviewer
 * @param reviewNote - Optional note from reviewer
 * @returns Updated approval with "approved" status
 * @throws Error if approval is not in pending status
 *
 * @example
 * ```typescript
 * const approved = approveAction(pendingApproval, "user-123", "Verified customer at risk");
 * console.log(approved.status); // "approved"
 * ```
 */
export function approveAction(
  approval: PendingApproval,
  reviewerId: string,
  reviewNote?: string
): PendingApproval {
  if (approval.status !== "pending") {
    throw new Error(
      `Cannot approve: current status is "${approval.status}", expected "pending"`
    );
  }

  const now = Date.now();
  const base: PendingApproval = {
    ...approval,
    status: "approved",
    reviewerId,
    reviewedAt: now,
  };

  if (reviewNote !== undefined) {
    return { ...base, reviewNote };
  }

  return base;
}

/**
 * Reject a pending action.
 *
 * Transitions from "pending" to "rejected" status.
 *
 * @param approval - Approval to update
 * @param reviewerId - ID of the human reviewer
 * @param rejectionReason - Reason for rejection
 * @returns Updated approval with "rejected" status
 * @throws Error if approval is not in pending status
 *
 * @example
 * ```typescript
 * const rejected = rejectAction(pendingApproval, "user-123", "Customer already contacted");
 * console.log(rejected.status); // "rejected"
 * ```
 */
export function rejectAction(
  approval: PendingApproval,
  reviewerId: string,
  rejectionReason: string
): PendingApproval {
  if (approval.status !== "pending") {
    throw new Error(
      `Cannot reject: current status is "${approval.status}", expected "pending"`
    );
  }

  return {
    ...approval,
    status: "rejected",
    reviewerId,
    reviewedAt: Date.now(),
    rejectionReason,
  };
}

/**
 * Mark an approval as expired.
 *
 * Transitions from "pending" to "expired" status.
 *
 * @param approval - Approval to update
 * @returns Updated approval with "expired" status
 * @throws Error if approval is not in pending status
 *
 * @example
 * ```typescript
 * const expired = expireAction(pendingApproval);
 * console.log(expired.status); // "expired"
 * ```
 */
export function expireAction(approval: PendingApproval): PendingApproval {
  if (approval.status !== "pending") {
    throw new Error(
      `Cannot expire: current status is "${approval.status}", expected "pending"`
    );
  }

  return {
    ...approval,
    status: "expired",
  };
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Check if an approval is pending.
 *
 * @param approval - Approval to check
 * @returns true if status is "pending"
 */
export function isApprovalPending(approval: PendingApproval): boolean {
  return approval.status === "pending";
}

/**
 * Check if an approval has been approved.
 *
 * @param approval - Approval to check
 * @returns true if status is "approved"
 */
export function isApprovalApproved(approval: PendingApproval): boolean {
  return approval.status === "approved";
}

/**
 * Check if an approval has been rejected.
 *
 * @param approval - Approval to check
 * @returns true if status is "rejected"
 */
export function isApprovalRejected(approval: PendingApproval): boolean {
  return approval.status === "rejected";
}

/**
 * Check if an approval has expired.
 *
 * Checks both the status field and the expiration timestamp.
 *
 * @param approval - Approval to check
 * @param now - Current timestamp (defaults to Date.now())
 * @returns true if expired (either by status or timestamp)
 *
 * @example
 * ```typescript
 * // Check if approval should be expired
 * if (isApprovalExpired(approval)) {
 *   const expired = expireAction(approval);
 *   // ... persist expired approval
 * }
 * ```
 */
export function isApprovalExpired(approval: PendingApproval, now: number = Date.now()): boolean {
  // Already marked as expired
  if (approval.status === "expired") {
    return true;
  }

  // Still pending but past expiration time
  if (approval.status === "pending" && now >= approval.expiresAt) {
    return true;
  }

  return false;
}

/**
 * Check if an approval is still actionable (pending and not expired).
 *
 * @param approval - Approval to check
 * @param now - Current timestamp (defaults to Date.now())
 * @returns true if approval can still be approved/rejected
 */
export function isApprovalActionable(approval: PendingApproval, now: number = Date.now()): boolean {
  return approval.status === "pending" && now < approval.expiresAt;
}

// ============================================================================
// Validation
// ============================================================================

/**
 * Validate a pending approval object.
 *
 * @param approval - Object to validate
 * @returns true if valid, false otherwise
 */
export function validatePendingApproval(approval: unknown): approval is PendingApproval {
  const result = PendingApprovalSchema.safeParse(approval);
  return result.success;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get the remaining time before an approval expires.
 *
 * @param approval - Approval to check
 * @param now - Current timestamp (defaults to Date.now())
 * @returns Remaining time in milliseconds (0 if expired)
 */
export function getRemainingApprovalTime(
  approval: PendingApproval,
  now: number = Date.now()
): number {
  if (approval.status !== "pending") {
    return 0;
  }

  const remaining = approval.expiresAt - now;
  return remaining > 0 ? remaining : 0;
}

/**
 * Format remaining approval time as human-readable string.
 *
 * @param approval - Approval to check
 * @param now - Current timestamp (defaults to Date.now())
 * @returns Human-readable remaining time (e.g., "23h 45m")
 */
export function formatRemainingApprovalTime(
  approval: PendingApproval,
  now: number = Date.now()
): string {
  const remainingMs = getRemainingApprovalTime(approval, now);

  if (remainingMs === 0) {
    return "expired";
  }

  const hours = Math.floor(remainingMs / (60 * 60 * 1000));
  const minutes = Math.floor((remainingMs % (60 * 60 * 1000)) / (60 * 1000));

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  return `${minutes}m`;
}

// ============================================================================
// Type Inference Helpers
// ============================================================================

/**
 * Type inferred from ApprovalStatusSchema.
 */
export type ApprovalStatusSchemaType = z.infer<typeof ApprovalStatusSchema>;

/**
 * Type inferred from PendingApprovalSchema.
 */
export type PendingApprovalSchemaType = z.infer<typeof PendingApprovalSchema>;

/**
 * Type inferred from ApprovalActionSchema.
 */
export type ApprovalActionSchemaType = z.infer<typeof ApprovalActionSchema>;
