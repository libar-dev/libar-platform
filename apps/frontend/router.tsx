import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routerWithQueryClient } from "@tanstack/react-router-with-query";
import { ConvexQueryClient } from "@convex-dev/react-query";
import { ConvexProvider } from "convex/react";
import { routeTree } from "./routeTree.gen";

// =============================================================================
// Convex + TanStack Query SSR Integration
// =============================================================================
// ConvexQueryClient bridges Convex with TanStack Query, enabling:
// - SSR data prefetching via route loaders
// - Consistent database snapshots across queries
// - Seamless hydration from server to client
// - Real-time subscriptions that resume after page loads
// =============================================================================

const CONVEX_URL = import.meta.env.VITE_CONVEX_URL;

if (!CONVEX_URL) {
  throw new Error("VITE_CONVEX_URL is not defined. Check .env.local file.");
}

// ConvexQueryClient wraps Convex with TanStack Query compatibility
const convexQueryClient = new ConvexQueryClient(CONVEX_URL);

// QueryClient configured with Convex-specific hash and query functions
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Use Convex's hash function for query key deduplication
      queryKeyHashFn: convexQueryClient.hashFn(),
      // Use Convex's query function for data fetching
      queryFn: convexQueryClient.queryFn(),
    },
  },
});

// Connect the ConvexQueryClient to the QueryClient
convexQueryClient.connect(queryClient);

export function getRouter() {
  // routerWithQueryClient wraps the router with TanStack Query context
  // This enables SSR data fetching in route loaders
  const router = routerWithQueryClient(
    createRouter({
      routeTree,
      scrollRestoration: true,
      // Pass queryClient in context for route loaders
      context: { queryClient },
      // Wrap the app with ConvexProvider for real-time subscriptions
      Wrap: ({ children }) => (
        <ConvexProvider client={convexQueryClient.convexClient}>{children}</ConvexProvider>
      ),
    }),
    queryClient
  );

  return router;
}

// Register the router for type safety
declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}

// Export for use in route loaders
export { convexQueryClient, queryClient };
