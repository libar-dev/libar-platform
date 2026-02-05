"use client";

import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { convexQuery } from "@convex-dev/react-query";
import { makeFunctionReference } from "convex/server";
import type { FunctionReference } from "convex/server";
import { AppLayout } from "@/components/templates/app-layout";
import { ApprovalDetail } from "@/components/organisms/approval-detail";
import { Button } from "@/components/ui/button";
import { useApprovalDetail } from "@/hooks/use-approval-detail";
import type { PendingApproval } from "@/hooks/use-pending-approvals";
import { ArrowLeft } from "lucide-react";

// Query reference for SSR preloading
const getApprovalByIdQuery = makeFunctionReference<"query">(
  "queries/agent:getApprovalById"
) as FunctionReference<"query", "public", { approvalId: string }, PendingApproval | null>;

export const Route = createFileRoute("/admin/agents/approvals/$approvalId")({
  loader: async ({ context, params }) => {
    // Guard against undefined params during SSR edge cases
    if (!params.approvalId) {
      return;
    }
    await context.queryClient.ensureQueryData(
      convexQuery(getApprovalByIdQuery, { approvalId: params.approvalId })
    );
  },
  component: ApprovalDetailPage,
  errorComponent: ApprovalErrorFallback,
});

/**
 * Error fallback component for the approval detail page.
 */
function ApprovalErrorFallback({ error, reset }: { error: Error; reset?: () => void }) {
  return (
    <AppLayout activeNav="agents">
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Link to="/admin/agents">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Agents
            </Button>
          </Link>
        </div>

        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-12 text-center">
          <h2 className="text-lg font-semibold text-destructive">Failed to Load Approval</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {error.message || "An unexpected error occurred while loading the approval."}
          </p>
          {reset && (
            <Button variant="outline" className="mt-4" onClick={reset}>
              Try Again
            </Button>
          )}
        </div>
      </div>
    </AppLayout>
  );
}

/**
 * Get the current reviewer ID.
 *
 * TODO(auth): Replace with actual auth integration when implemented.
 *
 * Implementation options:
 * 1. Convex Auth: Use `useConvexAuth()` from `convex/react` with Clerk/Auth0
 *    ```typescript
 *    import { useConvexAuth } from "convex/react";
 *    const { isAuthenticated } = useConvexAuth();
 *    // Then fetch user from your users table
 *    ```
 *
 * 2. Custom auth hook: Create `hooks/use-current-user.ts`
 *    ```typescript
 *    export function useCurrentUser() {
 *      const user = useSuspenseQuery(convexQuery(api.users.me, {}));
 *      return { userId: user._id, displayName: user.name };
 *    }
 *    ```
 *
 * 3. Session-based: Use server-side session from route loader
 *
 * For now, we use a placeholder that identifies the review action
 * but does NOT provide actual authentication/authorization.
 */
function useReviewerId(): string {
  // SECURITY: This is a placeholder. In production, this MUST be replaced
  // with actual authenticated user ID from your auth provider.
  return "reviewer-placeholder";
}

/**
 * Approval detail page - review and take action on a specific approval.
 */
function ApprovalDetailPage() {
  const { approvalId } = Route.useParams();
  const navigate = useNavigate();
  const { approval, isLoading } = useApprovalDetail(approvalId);
  const userId = useReviewerId();

  const handleActionComplete = () => {
    navigate({ to: "/admin/agents" });
  };

  if (isLoading) {
    return (
      <AppLayout activeNav="agents">
        <div className="space-y-6">
          <div className="flex items-center gap-4">
            <Link to="/admin/agents">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Agents
              </Button>
            </Link>
          </div>
          <div className="flex items-center justify-center p-12">
            <div className="text-muted-foreground">Loading approval...</div>
          </div>
        </div>
      </AppLayout>
    );
  }

  if (!approval) {
    return (
      <AppLayout activeNav="agents">
        <div className="space-y-6">
          <div className="flex items-center gap-4">
            <Link to="/admin/agents">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Agents
              </Button>
            </Link>
          </div>

          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-12 text-center">
            <h2 className="text-lg font-semibold">Approval Not Found</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              The approval with ID "{approvalId}" could not be found.
            </p>
            <Link to="/admin/agents" className="mt-4">
              <Button variant="outline">Return to Agent Dashboard</Button>
            </Link>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout activeNav="agents">
      <div className="space-y-6">
        {/* Back navigation */}
        <div className="flex items-center gap-4">
          <Link to="/admin/agents">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Agents
            </Button>
          </Link>
        </div>

        {/* Page Header */}
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Review Approval</h1>
          <p className="text-muted-foreground">
            Review the agent decision and approve or reject the action.
          </p>
        </div>

        {/* Approval Detail */}
        <ApprovalDetail
          approval={approval}
          userId={userId}
          onActionComplete={handleActionComplete}
        />
      </div>
    </AppLayout>
  );
}
