import { useSuspenseQuery } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
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
 * Uses TanStack Query + Convex for SSR support with real-time updates.
 *
 * @param approvalId - The approval ID to look up
 * @returns Object containing approval data (may be null if not found)
 *
 * @example
 * ```tsx
 * function ApprovalDetail({ approvalId }: { approvalId: string }) {
 *   const { approval } = useApprovalDetail(approvalId);
 *
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
export function useApprovalDetail(approvalId: string): {
  approval: PendingApproval | null;
  isLoading: false; // With Suspense, data is always loaded
} {
  const { data } = useSuspenseQuery(convexQuery(getApprovalByIdQuery, { approvalId }));

  return {
    approval: data as PendingApproval | null,
    isLoading: false, // Suspense handles loading state
  };
}
