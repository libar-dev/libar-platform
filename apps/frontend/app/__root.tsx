import { Outlet, createRootRouteWithContext, HeadContent, Scripts } from "@tanstack/react-router";
import type { QueryClient } from "@tanstack/react-query";
import appCss from "./globals.css?url";

// =============================================================================
// Root Layout with Router Context
// =============================================================================
// ConvexProvider is configured in router.tsx via the Wrap function.
// The queryClient context enables SSR data prefetching in route loaders.
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
