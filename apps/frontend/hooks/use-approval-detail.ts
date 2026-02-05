import { useQuery } from "convex/react";
import { makeFunctionReference } from "convex/server";
import type { FunctionReference } from "convex/server";
import type { PendingApproval } from "./use-pending-approvals";

// Using makeFunctionReference to bypass FilterApi recursive type resolution (TS2589 prevention)
const getApprovalByIdQuery = makeFunctionReference<"query">(
  "queries/agent:getApprovalById"
) as FunctionReference<"query", "public", { approvalId: string }, PendingApproval | null>;

/**
 * Hook to fetch a specific approval by ID.
 *
 * Uses Convex's native useQuery with "skip" pattern for conditional fetching.
 *
 * @param approvalId - The approval ID to look up (undefined to skip the query)
 * @returns Object containing approval data (may be null if not found) and loading state
 *
 * @example
 * ```tsx
 * function ApprovalDetail({ approvalId }: { approvalId: string }) {
 *   const { approval, isLoading } = useApprovalDetail(approvalId);
 *
 *   if (isLoading) return <Skeleton />;
 *   if (!approval) {
 *     return <div>Approval not found</div>;
 *   }
 *
 *   return (
 *     <div>
 *       <h2>{approval.action.type}</h2>
 *       <p>Confidence: {(approval.confidence * 100).toFixed(0)}%</p>
 *       <p>Reason: {approval.reason}</p>
 *     </div>
 *   );
 * }
 * ```
 */
export function useApprovalDetail(approvalId: string | undefined): {
  approval: PendingApproval | null;
  isLoading: boolean;
} {
  // Use Convex "skip" pattern when approvalId is undefined to avoid calling query with empty args
  const data = useQuery(getApprovalByIdQuery, approvalId ? { approvalId } : "skip");

  return {
    approval: (data ?? null) as PendingApproval | null,
    isLoading: data === undefined,
  };
}
