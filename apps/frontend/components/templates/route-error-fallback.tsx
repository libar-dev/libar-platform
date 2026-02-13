import { Link } from "@tanstack/react-router";
import { AppLayout } from "@/components/templates/app-layout";
import type { NavItem } from "@/components/templates/app-layout/app-layout";
import { Button } from "@/components/ui/button";

interface RouteErrorFallbackProps {
  title: string;
  activeNav: NavItem;
  error: Error;
  reset?: () => void;
  backLink?: { to: string; label: string };
}

/**
 * Shared error fallback for route-level error boundaries.
 *
 * Wraps the error card in AppLayout so the user retains site navigation.
 * The root error fallback (__root.tsx) intentionally does NOT use this
 * because it cannot depend on AppLayout.
 *
 * @example
 * // Simple usage (no back link)
 * errorComponent: ({ error, reset }) => (
 *   <RouteErrorFallback title="Failed to Load Orders" activeNav="orders" error={error} reset={reset} />
 * )
 *
 * @example
 * // With back link
 * errorComponent: ({ error, reset }) => (
 *   <RouteErrorFallback
 *     title="Failed to Load Order"
 *     activeNav="orders"
 *     error={error}
 *     reset={reset}
 *     backLink={{ to: "/orders", label: "\u2190 Back to Orders" }}
 *   />
 * )
 */
export function RouteErrorFallback({
  title,
  activeNav,
  error,
  reset,
  backLink,
}: RouteErrorFallbackProps) {
  return (
    <AppLayout activeNav={activeNav}>
      <div className={backLink ? "space-y-6" : undefined}>
        {backLink && (
          <Link to={backLink.to} className="text-sm text-muted-foreground hover:underline">
            {backLink.label}
          </Link>
        )}
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-12 text-center">
          <h2 className="text-lg font-semibold text-destructive">{title}</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {error.message || "An unexpected error occurred."}
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
