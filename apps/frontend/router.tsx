import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";
import { ConvexQueryClient } from "@convex-dev/react-query";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import { routeTree } from "./routeTree.gen";

// =============================================================================
// Convex + TanStack Query + TanStack Start Integration
// =============================================================================
// Uses setupRouterSsrQueryIntegration (from @tanstack/react-router-ssr-query)
// to handle SSR dehydration/hydration of query data. ConvexQueryClient bridges
// Convex reactive subscriptions with TanStack Query for real-time updates.
//
// ConvexReactClient is a module-level singleton (manages one WebSocket).
// QueryClient + ConvexQueryClient are created per getRouter() call for SSR
// request isolation (prevents data leakage between requests).
// =============================================================================

const CONVEX_URL = import.meta.env.VITE_CONVEX_URL;

if (!CONVEX_URL) {
  throw new Error("VITE_CONVEX_URL is not defined. Check .env.local file.");
}

// Singleton — one WebSocket connection shared across the app lifetime
const convexClient = new ConvexReactClient(CONVEX_URL, {
  unsavedChangesWarning: false,
});

export function getRouter() {
  // Per-request instances for SSR isolation
  const convexQueryClient = new ConvexQueryClient(convexClient);

  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        queryKeyHashFn: convexQueryClient.hashFn(),
        queryFn: convexQueryClient.queryFn(),
      },
    },
  });

  convexQueryClient.connect(queryClient);

  const router = createRouter({
    routeTree,
    defaultPreload: "intent",
    scrollRestoration: true,
    context: { queryClient },
    Wrap: ({ children }) => (
      <QueryClientProvider client={queryClient}>
        <ConvexProvider client={convexClient}>{children}</ConvexProvider>
      </QueryClientProvider>
    ),
  });

  setupRouterSsrQueryIntegration({
    router,
    queryClient,
    wrapQueryClient: false, // We provide our own Wrap with both providers
  });

  return router;
}

// Register the router for type safety
declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
