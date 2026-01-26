/**
 * Core Type Aliases
 *
 * Shared type definitions used throughout the @libar-dev/platform-core package.
 * These aliases improve code readability and provide semantic meaning.
 */

/**
 * Alias for Record<string, unknown>.
 *
 * Used throughout the codebase for:
 * - Command args
 * - Handler args
 * - Event payloads
 * - Middleware context
 * - Generic object types where structure is unknown at compile time
 *
 * @example
 * ```typescript
 * function processArgs(args: UnknownRecord): void {
 *   // args is typed as Record<string, unknown>
 * }
 * ```
 */
export type UnknownRecord = Record<string, unknown>;

/**
 * Exhaustiveness check helper for switch statements on discriminated unions.
 *
 * Use in the `default` case of switch statements to ensure all variants
 * are handled. If a new variant is added to the union, TypeScript will
 * report an error at compile time.
 *
 * @param x - The value that should be of type `never` if all cases are handled
 * @param message - Optional custom error message
 * @throws Error if reached at runtime (indicates a missing case)
 *
 * @example
 * ```typescript
 * type Status = "success" | "failed" | "rejected";
 *
 * function handleStatus(status: Status): string {
 *   switch (status) {
 *     case "success":
 *       return "OK";
 *     case "failed":
 *       return "Error";
 *     case "rejected":
 *       return "Denied";
 *     default:
 *       // If a new status is added, TypeScript will error here
 *       return assertNever(status);
 *   }
 * }
 * ```
 */
export function assertNever(x: never, message?: string): never {
  throw new Error(message ?? `Unexpected value: ${JSON.stringify(x)}`);
}
