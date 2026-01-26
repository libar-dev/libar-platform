import type { ComponentProps, ReactNode } from "react";

/**
 * Mock for @tanstack/react-router module in Ladle.
 *
 * TanStack Router components require the router context, which isn't
 * available in Ladle. This mock provides stub implementations for
 * isolated component development.
 */

interface LinkProps extends Omit<ComponentProps<"a">, "href"> {
  /** URL to navigate to */
  to: string;
  /** Link content */
  children: ReactNode;
  /** URL parameters */
  params?: Record<string, string>;
  /** Search parameters */
  search?: Record<string, string>;
}

/**
 * Mock Link component - renders as standard <a> element
 */
export function Link({ to, children, params: _params, search: _search, ...props }: LinkProps) {
  return (
    <a href={to} {...props}>
      {children}
    </a>
  );
}

/**
 * Mock useLocation hook - returns static location
 */
export function useLocation() {
  return {
    pathname: "/",
    search: "",
    hash: "",
    state: null,
  };
}

/**
 * Mock useNavigate hook - returns no-op function
 */
export function useNavigate() {
  return (opts: { to: string }) => {
    console.log("[Mock navigate]", opts.to);
  };
}

/**
 * Mock useParams hook - returns empty object
 */
export function useParams() {
  return {};
}

/**
 * Mock useSearch hook - returns empty object
 */
export function useSearch() {
  return {};
}

/**
 * Mock useRouter hook - returns minimal router stub
 */
export function useRouter() {
  return {
    navigate: (opts: { to: string }) => {
      console.log("[Mock router.navigate]", opts.to);
    },
    state: {
      location: {
        pathname: "/",
        search: "",
        hash: "",
      },
    },
    matchRoute: () => false,
  };
}

/**
 * Mock useMatch hook - returns empty match object
 */
export function useMatch(_opts?: { from?: string; strict?: boolean }) {
  return {
    params: {},
    search: {},
    pathname: "/",
  };
}

/**
 * Mock useRouteContext hook - returns empty context
 */
export function useRouteContext(_opts?: { from?: string }) {
  return {};
}
