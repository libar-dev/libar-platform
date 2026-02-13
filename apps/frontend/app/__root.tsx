import { Outlet, createRootRouteWithContext, HeadContent, Scripts } from "@tanstack/react-router";
import type { QueryClient } from "@tanstack/react-query";
import appCss from "./globals.css?url";

// =============================================================================
// Root Layout with Router Context
// =============================================================================
// ConvexProvider is configured in router.tsx via the Wrap function.
// The queryClient context enables data prefetching in route loaders.
// ssr: 'data-only' — loaders run on server, components render on client only.
//
// NOTE: Only queryClient is exposed in the router context. ConvexReactClient
// and ConvexQueryClient are intentionally kept out — their deep generic types
// (FunctionReference, FunctionArgs, etc.) cause TypeScript to OOM when
// propagated through TanStack Router's 18-parameter Route type × every route.
// They're provided to components via React providers in router.tsx's Wrap.
// =============================================================================

interface RouterContext {
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterContext>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1",
      },
      { title: "Order Management - Frontend" },
      {
        name: "description",
        content: "Frontend for Convex Event Sourcing Order Management",
      },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
    ],
  }),
  component: RootLayout,
  notFoundComponent: NotFound,
  errorComponent: RootErrorFallback,
});

function RootLayout() {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body className="antialiased">
        <Outlet />
        <Scripts />
      </body>
    </html>
  );
}

function RootErrorFallback({ error, reset }: { error: Error; reset?: () => void }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4">
      <h1 className="text-2xl font-bold text-red-600">Something went wrong</h1>
      <p className="mt-2 text-muted-foreground">
        {error.message || "An unexpected error occurred."}
      </p>
      {reset && (
        <button
          onClick={reset}
          className="mt-4 rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90"
        >
          Try Again
        </button>
      )}
      <a href="/" className="mt-2 text-sm text-primary hover:underline">
        Go to Dashboard
      </a>
    </div>
  );
}

function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4">
      <h1 className="text-4xl font-bold">404</h1>
      <p className="mt-2 text-lg text-muted-foreground">Page not found</p>
      <a href="/" className="mt-4 text-primary hover:underline">
        Go to Dashboard
      </a>
    </div>
  );
}
