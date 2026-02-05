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
import { v7 as uuidv7 } from "uuid";
import type { HumanInLoopConfig } from "./types.js";
import { parseDuration } from "./patterns.js";

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
  /** Reviewer is not authorized to approve/reject this approval */
  UNAUTHORIZED_REVIEWER: "UNAUTHORIZED_REVIEWER",
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
 * Default approval timeout in milliseconds (24 hours).
 */
export const DEFAULT_APPROVAL_TIMEOUT_MS = 24 * 60 * 60 * 1000;

/**
 * Parse an approval timeout string to milliseconds.
 *
 * Delegates to the shared `parseDuration` function from patterns.js.
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
  // Delegate to shared duration parser
  return parseDuration(timeout);
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

  // Use confidence threshold (inclusive - requires approval if AT or below threshold)
  const threshold = config.confidenceThreshold ?? 0.9;
  return confidence <= threshold;
}

// ============================================================================
// Approval ID Generation
// ============================================================================

/**
 * Generate a unique approval ID.
 *
 * Uses timestamp + cryptographically secure random suffix for uniqueness.
 * Format: `apr_{timestamp}_{random}`
 *
 * @returns Unique approval ID
 */
export function generateApprovalId(): string {
  const timestamp = Date.now();
  const random = uuidv7().slice(0, 8);
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

// ============================================================================
// Authorization Types
// ============================================================================

/**
 * Authorization context for approval operations.
 *
 * Provides identity and role information for the reviewer.
 * Used by handler-level code to validate authorization before
 * calling approveAction/rejectAction.
 *
 * @example
 * ```typescript
 * // In your mutation handler:
 * const authContext: ApprovalAuthContext = {
 *   userId: ctx.auth.userId,
 *   roles: ["reviewer", "admin"],
 *   agentIds: ["churn-risk-agent"], // Optional: restrict to specific agents
 * };
 *
 * if (!isAuthorizedReviewer(approval, authContext)) {
 *   throw new Error("Unauthorized to review this approval");
 * }
 *
 * const result = approveAction(approval, authContext.userId, "Approved");
 * ```
 */
export interface ApprovalAuthContext {
  /** User ID of the reviewer */
  readonly userId: string;

  /** Roles assigned to the user (e.g., "reviewer", "admin") */
  readonly roles?: readonly string[];

  /** Optional: specific agent IDs this user can review */
  readonly agentIds?: readonly string[];
}

/**
 * Zod schema for ApprovalAuthContext.
 */
export const ApprovalAuthContextSchema = z.object({
  userId: z.string().min(1),
  roles: z.array(z.string()).optional(),
  agentIds: z.array(z.string()).optional(),
});

// ============================================================================
// Authorization Helpers
// ============================================================================

/**
 * Check if a user is authorized to review an approval.
 *
 * Authorization logic:
 * 1. If authContext.agentIds is specified, the approval's agentId must be in the list
 * 2. If authContext.roles is specified, user must have at least one role
 * 3. If neither is specified, authorization passes (caller must implement their own checks)
 *
 * Note: This is a helper function for use at the handler level.
 * The approveAction/rejectAction functions are pure state transformers
 * and do not perform authorization checks themselves.
 *
 * @param approval - The approval to check authorization for
 * @param authContext - The authorization context of the reviewer
 * @returns true if authorized, false otherwise
 *
 * @example
 * ```typescript
 * // Before calling approveAction:
 * if (!isAuthorizedReviewer(approval, authContext)) {
 *   return { success: false, code: APPROVAL_ERROR_CODES.UNAUTHORIZED_REVIEWER };
 * }
 * ```
 */
export function isAuthorizedReviewer(
  approval: PendingApproval,
  authContext: ApprovalAuthContext
): boolean {
  // If agentIds are restricted, check the approval's agent
  if (authContext.agentIds && authContext.agentIds.length > 0) {
    if (!authContext.agentIds.includes(approval.agentId)) {
      return false;
    }
  }

  // If roles are specified, user must have at least one
  if (authContext.roles && authContext.roles.length > 0) {
    // At least one role means they're a valid reviewer
    return true;
  }

  // If no restrictions specified, defer to caller
  // (they should implement their own checks or this is an open approval)
  return true;
}

/**
 * Result of an approval operation.
 *
 * Use this type with the safe variants of approve/reject
 * to handle errors without exceptions.
 */
export type ApprovalOperationResult =
  | { readonly success: true; readonly approval: PendingApproval }
  | { readonly success: false; readonly code: ApprovalErrorCode; readonly message: string };

/**
 * Safely approve an action with authorization check.
 *
 * Unlike approveAction, this returns a result object instead of throwing.
 * Includes authorization validation.
 *
 * @param approval - Approval to update
 * @param authContext - Authorization context of the reviewer
 * @param reviewNote - Optional note from reviewer
 * @returns Result with updated approval or error
 *
 * @example
 * ```typescript
 * const result = safeApproveAction(approval, authContext, "Looks good");
 * if (result.success) {
 *   await db.patch(approval._id, result.approval);
 * } else {
 *   console.error(result.message);
 * }
 * ```
 */
export function safeApproveAction(
  approval: PendingApproval,
  authContext: ApprovalAuthContext,
  reviewNote?: string
): ApprovalOperationResult {
  // Check authorization
  if (!isAuthorizedReviewer(approval, authContext)) {
    return {
      success: false,
      code: APPROVAL_ERROR_CODES.UNAUTHORIZED_REVIEWER,
      message: `User ${authContext.userId} is not authorized to review approvals for agent ${approval.agentId}`,
    };
  }

  // Check status
  if (approval.status !== "pending") {
    return {
      success: false,
      code: APPROVAL_ERROR_CODES.INVALID_STATUS_TRANSITION,
      message: `Cannot approve: current status is "${approval.status}", expected "pending"`,
    };
  }

  // Check expiration
  if (Date.now() >= approval.expiresAt) {
    return {
      success: false,
      code: APPROVAL_ERROR_CODES.APPROVAL_EXPIRED,
      message: "Cannot approve: approval has expired",
    };
  }

  // Perform approval
  const updated = approveAction(approval, authContext.userId, reviewNote);
  return { success: true, approval: updated };
}

/**
 * Safely reject an action with authorization check.
 *
 * Unlike rejectAction, this returns a result object instead of throwing.
 * Includes authorization validation.
 *
 * @param approval - Approval to update
 * @param authContext - Authorization context of the reviewer
 * @param rejectionReason - Reason for rejection
 * @returns Result with updated approval or error
 *
 * @example
 * ```typescript
 * const result = safeRejectAction(approval, authContext, "Customer already contacted");
 * if (result.success) {
 *   await db.patch(approval._id, result.approval);
 * } else {
 *   console.error(result.message);
 * }
 * ```
 */
export function safeRejectAction(
  approval: PendingApproval,
  authContext: ApprovalAuthContext,
  rejectionReason: string
): ApprovalOperationResult {
  // Check authorization
  if (!isAuthorizedReviewer(approval, authContext)) {
    return {
      success: false,
      code: APPROVAL_ERROR_CODES.UNAUTHORIZED_REVIEWER,
      message: `User ${authContext.userId} is not authorized to review approvals for agent ${approval.agentId}`,
    };
  }

  // Check status
  if (approval.status !== "pending") {
    return {
      success: false,
      code: APPROVAL_ERROR_CODES.INVALID_STATUS_TRANSITION,
      message: `Cannot reject: current status is "${approval.status}", expected "pending"`,
    };
  }

  // Check expiration
  if (Date.now() >= approval.expiresAt) {
    return {
      success: false,
      code: APPROVAL_ERROR_CODES.APPROVAL_EXPIRED,
      message: "Cannot reject: approval has expired",
    };
  }

  // Perform rejection
  const updated = rejectAction(approval, authContext.userId, rejectionReason);
  return { success: true, approval: updated };
}
