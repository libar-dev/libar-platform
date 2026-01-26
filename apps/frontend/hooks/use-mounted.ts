import { useSyncExternalStore } from "react";

/**
 * Hook to check if component is mounted (client-side).
 * Useful for avoiding hydration mismatches with SSR in Next.js.
 *
 * Uses useSyncExternalStore for React 19 compliance - avoids
 * the "setState in effect" pattern which causes cascading renders.
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const mounted = useMounted();
 *
 *   if (!mounted) {
 *     return <Skeleton />;
 *   }
 *
 *   return <ClientOnlyContent />;
 * }
 * ```
 */

// Subscribe function (no-op since mounted state never changes)
const subscribe = () => () => {};

// Client always returns true
const getSnapshot = () => true;

// Server always returns false
const getServerSnapshot = () => false;

export function useMounted(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
