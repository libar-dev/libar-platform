/**
 * Shared utilities for agent approval UI components.
 *
 * Provides consistent formatting and styling for:
 * - Approval status badges
 * - Confidence level display
 * - Expiration time formatting
 *
 * @module lib/approval-utils
 */

/**
 * Approval status type.
 */
export type ApprovalStatus = "pending" | "approved" | "rejected" | "expired";

/**
 * Badge variant type matching shadcn/ui Badge component.
 */
export type BadgeVariant = "default" | "secondary" | "destructive" | "outline";

/**
 * Status configuration for consistent badge styling across components.
 */
export const statusConfig: Record<ApprovalStatus, { label: string; variant: BadgeVariant }> = {
  pending: { label: "Pending Review", variant: "default" },
  approved: { label: "Approved", variant: "outline" },
  rejected: { label: "Rejected", variant: "destructive" },
  expired: { label: "Expired", variant: "secondary" },
};

/**
 * Get badge variant based on confidence level.
 *
 * - >= 0.9: High confidence (outline - green-ish)
 * - >= 0.7: Medium confidence (default - blue)
 * - < 0.7: Low confidence (destructive - red)
 *
 * @param confidence - Confidence score between 0 and 1
 * @returns Badge variant for styling
 */
export function getConfidenceVariant(confidence: number): BadgeVariant {
  if (confidence >= 0.9) return "outline";
  if (confidence >= 0.7) return "default";
  return "destructive";
}

/**
 * Get human-readable confidence label.
 *
 * Used to convey confidence level through text (not just color)
 * for accessibility compliance (WCAG 1.4.1).
 *
 * @param confidence - Confidence score between 0 and 1
 * @returns "High", "Medium", or "Low"
 */
export function getConfidenceLabel(confidence: number): string {
  if (confidence >= 0.9) return "High";
  if (confidence >= 0.7) return "Medium";
  return "Low";
}

/**
 * Format confidence as percentage string.
 *
 * @param confidence - Confidence score between 0 and 1
 * @returns Formatted percentage (e.g., "75%")
 */
export function formatConfidence(confidence: number): string {
  return `${(confidence * 100).toFixed(0)}%`;
}

/**
 * Format expiration time as human-readable remaining time.
 *
 * @param expiresAt - Expiration timestamp in milliseconds
 * @param compact - If true, use short format (e.g., "2d left"), otherwise long format
 * @returns Formatted time remaining string
 *
 * @example
 * ```ts
 * formatExpirationTime(Date.now() + 86400000) // "1 days remaining"
 * formatExpirationTime(Date.now() + 86400000, true) // "1d left"
 * formatExpirationTime(Date.now() - 1000) // "Expired"
 * ```
 */
export function formatExpirationTime(expiresAt: number, compact = false): string {
  const remaining = expiresAt - Date.now();

  if (remaining <= 0) return "Expired";

  const hours = Math.floor(remaining / (1000 * 60 * 60));
  const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));

  if (hours > 24) {
    const days = Math.floor(hours / 24);
    return compact ? `${days}d left` : `${days} days remaining`;
  }
  if (hours > 0) {
    return compact ? `${hours}h ${minutes}m left` : `${hours} hours, ${minutes} minutes remaining`;
  }
  return compact ? `${minutes}m left` : `${minutes} minutes remaining`;
}

/**
 * Truncate an ID string for display.
 *
 * @param id - Full ID string
 * @param length - Maximum visible characters before truncation
 * @returns Truncated ID with ellipsis if needed
 */
export function truncateId(id: string, length = 8): string {
  if (id.length <= length + 3) return id;
  return `${id.slice(0, length)}...`;
}
