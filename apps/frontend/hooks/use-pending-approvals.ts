import { useSuspenseQuery } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { makeFunctionReference } from "convex/server";
import type { FunctionReference } from "convex/server";

/**
 * Approval status type.
 */
export type ApprovalStatus = "pending" | "approved" | "rejected" | "expired";

/**
 * Pending approval data from the pendingApprovals table.
 */
export interface PendingApproval {
  _id: string;
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

// Using makeFunctionReference to bypass FilterApi recursive type resolution (TS2589 prevention)
const getPendingApprovalsQuery = makeFunctionReference<"query">(
  "queries/agent:getPendingApprovals"
) as FunctionReference<
  "query",
  "public",
  { agentId?: string; status?: ApprovalStatus; limit?: number },
  PendingApproval[]
>;

/**
 * Hook to fetch pending approvals.
 *
 * Uses TanStack Query + Convex for SSR support with real-time updates.
 * Data is prefetched on the server, then hydrated with live subscriptions.
 *
 * @param options - Filter options
 * @param options.agentId - Optional agent ID filter
 * @param options.status - Optional status filter
 * @param options.limit - Maximum number of approvals to fetch (default 100)
 * @returns Object containing approvals array (always defined with Suspense)
 *
 * @example
 * ```tsx
 * function ApprovalList() {
 *   const { approvals } = usePendingApprovals({ status: "pending" });
 *
 *   return (
 *     <ul>
 *       {approvals.map(approval => (
 *         <li key={approval.approvalId}>
 *           {approval.action.type} - {approval.confidence.toFixed(2)}
 *         </li>
 *       ))}
 *     </ul>
 *   );
 * }
 * ```
 */
export function usePendingApprovals(options?: {
  agentId?: string;
  status?: ApprovalStatus;
  limit?: number;
}): {
  approvals: PendingApproval[];
  isLoading: false; // With Suspense, data is always loaded
} {
  const { data } = useSuspenseQuery(
    convexQuery(getPendingApprovalsQuery, {
      agentId: options?.agentId,
      status: options?.status,
      limit: options?.limit,
    })
  );

  return {
    approvals: (data ?? []) as PendingApproval[],
    isLoading: false, // Suspense handles loading state
  };
}
