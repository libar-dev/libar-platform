"use client";

import { makeFunctionReference } from "convex/server";
import type { FunctionReference } from "convex/server";
import { useMutationWithFeedback, type MutationWithFeedback } from "./use-mutation-with-feedback";

/**
 * Result type for approval/rejection mutations.
 */
export interface ApprovalActionResult {
  success: boolean;
  approvalId?: string;
  error?: string;
}

// Using makeFunctionReference to bypass FilterApi recursive type resolution (TS2589 prevention)
const approveAgentActionMutation = makeFunctionReference<"mutation">(
  "agent:approveAgentAction"
) as FunctionReference<
  "mutation",
  "public",
  { approvalId: string; reviewerId: string; reviewNote?: string },
  ApprovalActionResult
>;

const rejectAgentActionMutation = makeFunctionReference<"mutation">(
  "agent:rejectAgentAction"
) as FunctionReference<
  "mutation",
  "public",
  { approvalId: string; reviewerId: string; reviewNote?: string },
  ApprovalActionResult
>;

/**
 * Return type for useApprovalActions hook.
 */
export interface ApprovalActions {
  /** Mutation state and handler for approving actions */
  approve: MutationWithFeedback<typeof approveAgentActionMutation>;
  /** Mutation state and handler for rejecting actions */
  reject: MutationWithFeedback<typeof rejectAgentActionMutation>;
}

/**
 * Hook for agent approval workflow actions.
 *
 * Provides approve and reject mutations with loading/error state tracking.
 * Note: Unlike CommandOrchestrator mutations, approval actions return
 * `{ success: boolean; error?: string }` - the caller should check `success`
 * on the result to determine if the action succeeded.
 *
 * @returns Object with approve and reject mutation handlers
 *
 * @example
 * ```tsx
 * function ApprovalButtons({ approvalId, userId }: Props) {
 *   const { approve, reject } = useApprovalActions();
 *
 *   const handleApprove = async () => {
 *     const result = await approve.execute({
 *       approvalId,
 *       reviewerId: userId,
 *       reviewNote: "Verified - customer is high value",
 *     });
 *     if (result?.success) {
 *       toast.success("Action approved");
 *     }
 *   };
 *
 *   const handleReject = async () => {
 *     const result = await reject.execute({
 *       approvalId,
 *       reviewerId: userId,
 *       reviewNote: "Customer already contacted",
 *     });
 *     if (result?.success) {
 *       toast.info("Action rejected");
 *     }
 *   };
 *
 *   return (
 *     <div>
 *       <button
 *         onClick={handleApprove}
 *         disabled={approve.state === "pending" || reject.state === "pending"}
 *       >
 *         {approve.state === "pending" ? "Approving..." : "Approve"}
 *       </button>
 *       <button
 *         onClick={handleReject}
 *         disabled={approve.state === "pending" || reject.state === "pending"}
 *       >
 *         {reject.state === "pending" ? "Rejecting..." : "Reject"}
 *       </button>
 *       {approve.error && <p className="error">{approve.error}</p>}
 *       {reject.error && <p className="error">{reject.error}</p>}
 *     </div>
 *   );
 * }
 * ```
 */
export function useApprovalActions(): ApprovalActions {
  // Note: We don't use a custom isOrchestratorError predicate here because
  // approval actions return { success: boolean } instead of { status: "..." }.
  // The caller should check result?.success to determine if the action succeeded.
  const approve = useMutationWithFeedback(approveAgentActionMutation);
  const reject = useMutationWithFeedback(rejectAgentActionMutation);

  return { approve, reject };
}
